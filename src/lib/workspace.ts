import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { BridgeConfig } from "./config.js";

export type WorkspaceResult = {
  workspaceDir: string;
  tempDir?: string;
};

const WIN_ABS_PATH = /[A-Z]:\\[\w\-. \\]+/gi;
const UNIX_ABS_PATH = /\/(?:home|Users|opt|var|tmp|srv|workspace)\/[\w\-. /]+/g;

/**
 * Try to detect the user's project root from absolute file paths in messages.
 * Scans system/user message text for absolute paths referenced by the client
 * (e.g. Copilot system prompt, @-file references) and returns the shallowest
 * existing directory — likely the project root.
 */
export function detectWorkspaceFromMessages(messages: any[]): string | null {
  const dirs = new Set<string>();

  for (const m of messages ?? []) {
    const role = m?.role;
    if (role !== "system" && role !== "user") continue;

    const text =
      typeof m?.content === "string"
        ? m.content
        : Array.isArray(m?.content)
          ? (m.content as any[])
              .filter((p) => p?.type === "text")
              .map((p) => p.text ?? "")
              .join(" ")
          : "";
    if (!text) continue;

    const winMatches = text.match(WIN_ABS_PATH) ?? [];
    const unixMatches = text.match(UNIX_ABS_PATH) ?? [];

    for (const raw of [...winMatches, ...unixMatches]) {
      const cleaned = raw.replace(/[\s.]+$/, "");
      try {
        const normalized = path.resolve(cleaned);
        if (normalized.length <= 3) continue;
        const dir = fs.existsSync(normalized) && fs.statSync(normalized).isDirectory()
          ? normalized
          : path.dirname(normalized);
        if (dir.length > 3 && fs.existsSync(dir)) dirs.add(dir);
      } catch {
        continue;
      }
    }
  }

  if (dirs.size === 0) return null;

  const sorted = [...dirs].sort((a, b) => a.length - b.length);
  return sorted[0];
}

export function resolveWorkspace(
  config: BridgeConfig,
  workspaceHeader?: string | string[] | null,
  messages?: any[],
): WorkspaceResult {
  if (config.chatOnlyWorkspace) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cursor-proxy-"));
    return { workspaceDir: tempDir, tempDir };
  }

  const headerWs =
    typeof workspaceHeader === "string" && workspaceHeader.trim()
      ? workspaceHeader.trim()
      : null;

  if (headerWs) return { workspaceDir: headerWs };

  const detected = messages ? detectWorkspaceFromMessages(messages) : null;
  if (detected) {
    console.log(`[${new Date().toISOString()}] Workspace detected from messages: ${detected}`);
    return { workspaceDir: detected };
  }

  return { workspaceDir: config.workspace };
}
