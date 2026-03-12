import type { BridgeConfig, CursorExecutionMode } from "./config.js";

/**
 * Build CLI arguments for running the Cursor agent.
 */
export function buildAgentCmdArgs(
  config: BridgeConfig,
  workspaceDir: string,
  model: string,
  prompt: string,
  stream: boolean,
  modeOverride?: CursorExecutionMode,
): string[] {
  const mode = modeOverride ?? config.mode;
  const args = ["--print"];
  if (config.approveMcps) args.push("--approve-mcps");
  if (config.force || mode === "agent") args.push("--force");
  if (config.chatOnlyWorkspace || mode === "agent") args.push("--trust");
  if (mode === "ask" || mode === "plan") {
    args.push("--mode", mode);
  }
  args.push("--workspace", workspaceDir);
  args.push("--model", model);
  if (stream) {
    args.push("--stream-partial-output", "--output-format", "stream-json");
  } else {
    args.push("--output-format", "text");
  }
  args.push(prompt);
  return args;
}
