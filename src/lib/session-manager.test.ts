import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SessionManager,
  commonPrefixLen,
  type NormalizedMessage,
} from "./session-manager.js";

const runCallCount = { value: 0 };

vi.mock("./process.js", () => ({
  run: vi.fn().mockImplementation(() => {
    runCallCount.value++;
    return Promise.resolve({
      code: 0,
      stdout: `test-chat-id-${String(runCallCount.value).padStart(3, "0")}\n`,
      stderr: "",
    });
  }),
  runStreaming: vi.fn(),
}));

const baseConfig = {
  agentBin: "agent",
  sessionTtlMs: 30000,
  maxHistoryTurns: 10,
} as any;

function msg(role: string, content: string): { role: string; content: string } {
  return { role, content };
}

describe("commonPrefixLen", () => {
  it("returns full length for exact match", () => {
    const a: NormalizedMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    const b: NormalizedMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    expect(commonPrefixLen(a, b)).toBe(2);
  });

  it("returns prefix length for partial match", () => {
    const a: NormalizedMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
      { role: "user", content: "bye" },
    ];
    const b: NormalizedMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "different" },
    ];
    expect(commonPrefixLen(a, b)).toBe(1);
  });

  it("returns 0 for no match", () => {
    const a: NormalizedMessage[] = [{ role: "user", content: "hi" }];
    const b: NormalizedMessage[] = [{ role: "user", content: "bye" }];
    expect(commonPrefixLen(a, b)).toBe(0);
  });

  it("returns 0 for empty arrays", () => {
    expect(commonPrefixLen([], [])).toBe(0);
    expect(commonPrefixLen([], [{ role: "user", content: "hi" }])).toBe(0);
    expect(commonPrefixLen([{ role: "user", content: "hi" }], [])).toBe(0);
  });

  it("returns min length when one array is shorter and matches", () => {
    const a: NormalizedMessage[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    const b: NormalizedMessage[] = [{ role: "user", content: "hi" }];
    expect(commonPrefixLen(a, b)).toBe(1);
  });
});

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    runCallCount.value = 0;
    manager = new SessionManager(30 * 60 * 1000);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("creates new session on first request", async () => {
    const result = await manager.processRequest(baseConfig, [
      msg("user", "hello"),
    ]);
    expect(result.chatId).toBe("test-chat-id-001");
    expect(result.isNew).toBe(true);
    expect(result.lastUserMessage).toBe("hello");
  });

  it("resume: second request with more messages matches existing session", async () => {
    await manager.processRequest(baseConfig, [
      msg("user", "hi"),
      msg("assistant", "hello"),
    ]);
    const result = await manager.processRequest(baseConfig, [
      msg("user", "hi"),
      msg("assistant", "hello"),
      msg("user", "more"),
    ]);
    expect(result.chatId).toBe("test-chat-id-001");
    expect(result.isNew).toBe(false);
    expect(result.lastUserMessage).toBe("more");
  });

  it("retry: same messages sent again returns existing session", async () => {
    await manager.processRequest(baseConfig, [
      msg("user", "hi"),
      msg("assistant", "hello"),
      msg("user", "more"),
    ]);
    const result = await manager.processRequest(baseConfig, [
      msg("user", "hi"),
      msg("assistant", "hello"),
      msg("user", "more"),
    ]);
    expect(result.chatId).toBe("test-chat-id-001");
    expect(result.isNew).toBe(false);
    expect(result.lastUserMessage).toBe("more");
  });

  it("checkpoint: messages diverge from stored creates new session", async () => {
    await manager.processRequest(baseConfig, [
      msg("user", "hi"),
      msg("assistant", "hello"),
      msg("user", "help"),
    ]);
    const result = await manager.processRequest(baseConfig, [
      msg("user", "hi"),
      msg("assistant", "hello"),
      msg("user", "different question"),
    ]);
    expect(result.chatId).toBe("test-chat-id-002");
    expect(result.isNew).toBe(true);
    expect(result.lastUserMessage).toBe("different question");
  });

  it("throws when no user message in request", async () => {
    await expect(
      manager.processRequest(baseConfig, [
        msg("assistant", "hello"),
      ]),
    ).rejects.toThrow("No user message found in request");
  });

  it("destroy clears sessions", async () => {
    await manager.processRequest(baseConfig, [msg("user", "hi")]);
    expect(manager.getActiveCount()).toBe(1);
    manager.destroy();
    expect(manager.getActiveCount()).toBe(0);
  });

  it("getActiveCount tracks sessions", async () => {
    expect(manager.getActiveCount()).toBe(0);
    await manager.processRequest(baseConfig, [msg("user", "conv1")]);
    expect(manager.getActiveCount()).toBe(1);
    await manager.processRequest(baseConfig, [
      msg("user", "conv1"),
      msg("assistant", "reply1"),
      msg("user", "more1"),
    ]);
    expect(manager.getActiveCount()).toBe(1);
    await manager.processRequest(baseConfig, [msg("user", "conv2")]);
    expect(manager.getActiveCount()).toBe(2);
  });
});
