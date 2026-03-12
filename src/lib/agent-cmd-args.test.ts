import { describe, it, expect } from "vitest";
import { buildAgentCmdArgs } from "./agent-cmd-args.js";

const baseConfig = {
  mode: "ask",
  force: false,
  approveMcps: false,
  chatOnlyWorkspace: false,
} as any;

describe("buildAgentCmdArgs", () => {
  it("basic ask mode: includes --print, --mode ask, --workspace, --model, prompt", () => {
    const args = buildAgentCmdArgs({
      config: baseConfig,
      workspaceDir: "/ws",
      model: "gpt-4",
      prompt: "hello",
      stream: false,
    });
    expect(args).toContain("--print");
    expect(args).toContain("--mode");
    expect(args).toContain("ask");
    expect(args).toContain("--workspace");
    expect(args).toContain("/ws");
    expect(args).toContain("--model");
    expect(args).toContain("gpt-4");
    expect(args).toContain("hello");
    expect(args).toContain("--output-format");
    expect(args).toContain("text");
  });

  it("agent mode: includes --force, --trust, no --mode flag", () => {
    const args = buildAgentCmdArgs({
      config: { ...baseConfig, mode: "agent" },
      workspaceDir: "/ws",
      model: "gpt-4",
      prompt: "do it",
      stream: false,
    });
    expect(args).toContain("--force");
    expect(args).toContain("--trust");
    expect(args).not.toContain("--mode");
  });

  it("stream=true: includes --stream-partial-output --output-format stream-json", () => {
    const args = buildAgentCmdArgs({
      config: baseConfig,
      workspaceDir: "/ws",
      model: "gpt-4",
      prompt: "hi",
      stream: true,
    });
    expect(args).toContain("--stream-partial-output");
    expect(args).toContain("--output-format");
    expect(args).toContain("stream-json");
  });

  it("stream=false: includes --output-format text", () => {
    const args = buildAgentCmdArgs({
      config: baseConfig,
      workspaceDir: "/ws",
      model: "gpt-4",
      prompt: "hi",
      stream: false,
    });
    expect(args).toContain("--output-format");
    expect(args).toContain("text");
  });

  it("chatId provided: includes --resume chatId", () => {
    const args = buildAgentCmdArgs({
      config: baseConfig,
      workspaceDir: "/ws",
      model: "gpt-4",
      prompt: "hi",
      stream: false,
      chatId: "chat-123",
    });
    expect(args).toContain("--resume");
    expect(args).toContain("chat-123");
  });

  it("modeOverride overrides config.mode", () => {
    const args = buildAgentCmdArgs({
      config: { ...baseConfig, mode: "ask" },
      workspaceDir: "/ws",
      model: "gpt-4",
      prompt: "hi",
      stream: false,
      modeOverride: "plan",
    });
    expect(args).toContain("--mode");
    expect(args).toContain("plan");
  });

  it("approveMcps=true: includes --approve-mcps", () => {
    const args = buildAgentCmdArgs({
      config: { ...baseConfig, approveMcps: true },
      workspaceDir: "/ws",
      model: "gpt-4",
      prompt: "hi",
      stream: false,
    });
    expect(args).toContain("--approve-mcps");
  });

  it("chatOnlyWorkspace=true: includes --trust", () => {
    const args = buildAgentCmdArgs({
      config: { ...baseConfig, chatOnlyWorkspace: true },
      workspaceDir: "/tmp/chat",
      model: "gpt-4",
      prompt: "hi",
      stream: false,
    });
    expect(args).toContain("--trust");
  });
});
