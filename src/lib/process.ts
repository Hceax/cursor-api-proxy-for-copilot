import { spawn } from "node:child_process";
import * as path from "node:path";

export type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type RunOptions = {
  cwd?: string;
  timeoutMs?: number;
};

export type RunStreamingOptions = RunOptions & {
  onLine: (line: string) => void;
};

const DROP_PREFIXES = ["CURSOR_AGENT_", "CURSOR_BRIDGE_", "CONEMU"];
const DROP_EXACT = new Set([
  "CURSOR_INVOKED_AS",
  "CURSOR_AGENT",
  "CURSOR_API_KEY",
]);

let _cachedCleanEnv: Record<string, string | undefined> | null = null;

function cleanEnvForChild(): Record<string, string | undefined> {
  if (_cachedCleanEnv) return _cachedCleanEnv;

  const env: Record<string, string | undefined> = {};
  for (const [key, val] of Object.entries(process.env)) {
    const upper = key.toUpperCase();
    if (DROP_EXACT.has(upper)) continue;
    if (DROP_PREFIXES.some((p) => upper.startsWith(p))) continue;
    env[key] = val;
  }

  if (process.platform === "win32") {
    const systemDrive = process.env.SystemDrive || "C:";
    const username = process.env.USERNAME;
    if (username) {
      const realProfile = path.join(systemDrive, "Users", username);
      env.HOME = realProfile;
      env.HOMEPATH = `\\Users\\${username}`;
      env.USERPROFILE = realProfile;
      env.APPDATA = path.join(realProfile, "AppData", "Roaming");
      env.LOCALAPPDATA = path.join(realProfile, "AppData", "Local");
      env.TEMP = path.join(realProfile, "AppData", "Local", "Temp");
      env.TMP = env.TEMP;
      env.NODE_COMPILE_CACHE = path.join(
        env.LOCALAPPDATA,
        "cursor-compile-cache",
      );
    }

    const cursorToolkitMarker =
      detectPortableMarker() || findToolkitInPath(env.Path);
    if (cursorToolkitMarker && env.Path) {
      env.Path = env.Path.split(";")
        .filter((p) => !p.includes(cursorToolkitMarker))
        .join(";");
    }
  }

  _cachedCleanEnv = env;
  return env;
}

function detectPortableMarker(): string | null {
  for (const v of ["HOME", "USERPROFILE", "TEMP"]) {
    const val = process.env[v];
    if (!val) continue;
    const m = val.match(/^(.+?[/\\]CursorToolkit)\b/i);
    if (m) return m[1];
  }
  return null;
}

function findToolkitInPath(pathStr?: string): string | null {
  if (!pathStr) return null;
  for (const entry of pathStr.split(";")) {
    const m = entry.match(/^(.+?[/\\]CursorToolkit)\b/i);
    if (m) return m[1];
  }
  return null;
}

function spawnChild(cmd: string, args: string[], cwd?: string) {
  if (process.platform === "win32") {
    const nodeBin = process.env.CURSOR_AGENT_NODE;
    const agentScript = process.env.CURSOR_AGENT_SCRIPT;
    if (nodeBin && agentScript) {
      return spawn(nodeBin, [agentScript, ...args], {
        cwd,
        env: { ...cleanEnvForChild(), CURSOR_INVOKED_AS: "agent.cmd" },
        stdio: ["ignore", "pipe", "pipe"],
      });
    }
    if (/\.cmd$/i.test(cmd)) {
      const quotedArgs = args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ");
      const cmdLine = `""${cmd}" ${quotedArgs}"`;
      return spawn(process.env.COMSPEC || "cmd.exe", ["/d", "/s", "/c", cmdLine], {
        cwd,
        env: cleanEnvForChild(),
        stdio: ["ignore", "pipe", "pipe"],
        windowsVerbatimArguments: true,
      });
    }
  }
  return spawn(cmd, args, {
    cwd,
    env: cleanEnvForChild(),
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function runStreaming(
  cmd: string,
  args: string[],
  opts: RunStreamingOptions,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawnChild(cmd, args, opts.cwd);

    const timeoutMs = opts.timeoutMs;
    const timeout =
      typeof timeoutMs === "number" && timeoutMs > 0
        ? setTimeout(() => {
            child.kill("SIGKILL");
          }, timeoutMs)
        : undefined;

    let stderr = "";
    let lineBuffer = "";

    child.stderr!.setEncoding("utf8");
    child.stderr!.on("data", (c) => (stderr += c));

    child.stdout!.setEncoding("utf8");
    child.stdout!.on("data", (chunk: string) => {
      lineBuffer += chunk;
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) opts.onLine(line);
      }
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (timeout) clearTimeout(timeout);
      if (err?.code === "ENOENT") {
        reject(
          new Error(
            `Command not found: ${cmd}. Install Cursor CLI (agent) or set CURSOR_AGENT_BIN to its path.`,
          ),
        );
        return;
      }
      reject(err);
    });

    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      if (lineBuffer.trim()) opts.onLine(lineBuffer.trim());
      resolve({ code: code ?? 0, stderr });
    });
  });
}

export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawnChild(cmd, args, opts.cwd);

    const timeoutMs = opts.timeoutMs;
    const timeout =
      typeof timeoutMs === "number" && timeoutMs > 0
        ? setTimeout(() => {
            child.kill("SIGKILL");
          }, timeoutMs)
        : undefined;

    let stdout = "";
    let stderr = "";

    child.stdout!.setEncoding("utf8");
    child.stderr!.setEncoding("utf8");
    child.stdout!.on("data", (c) => (stdout += c));
    child.stderr!.on("data", (c) => (stderr += c));

    child.on("error", (err: NodeJS.ErrnoException) => {
      if (timeout) clearTimeout(timeout);
      if (err?.code === "ENOENT") {
        reject(
          new Error(
            `Command not found: ${cmd}. Install Cursor CLI (agent) or set CURSOR_AGENT_BIN to its path.`,
          ),
        );
        return;
      }
      reject(err);
    });

    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout);
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}
