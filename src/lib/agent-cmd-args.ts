import type { BridgeConfig, CursorExecutionMode } from "./config.js";

export type AgentCmdOptions = {
  config: BridgeConfig;
  workspaceDir: string;
  model: string;
  prompt: string;
  stream: boolean;
  modeOverride?: CursorExecutionMode;
  chatId?: string;
};

export function buildAgentCmdArgs(opts: AgentCmdOptions): string[] {
  const { config, workspaceDir, model, prompt, stream, modeOverride, chatId } =
    opts;
  const mode = modeOverride ?? config.mode;
  const args = ["--print"];
  if (chatId) args.push("--resume", chatId);
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
