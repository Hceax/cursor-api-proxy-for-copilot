import { describe, it, expect } from "vitest";
import {
  buildNewSessionPrompt,
  buildPromptFromMessages,
  extractCopilotUserRequest,
  stripCopilotBoilerplate,
} from "./openai.js";
import { buildAgentCmdArgs } from "./agent-cmd-args.js";
import { commonPrefixLen, type NormalizedMessage } from "./session-manager.js";
import type { BridgeConfig } from "./config.js";

const COPILOT_SYSTEM_PROMPT = `<context>
The current date is March 13, 2026.
</context>
<editorContext>
The user's current file is c:\\Users\\test\\project\\src\\index.ts
</editorContext>
<reminderInstructions>
When generating code, prefer edit_file_by_search_replace over insert_edit_into_file.
</reminderInstructions>`;

function copilotUserMsg(text: string) {
  return {
    role: "user",
    content: `<context>\nThe current date is March 13, 2026.\n</context>\n<editorContext>\nThe user's current file is c:\\Users\\test\\project\\src\\index.ts\n</editorContext>\n<reminderInstructions>\nWhen generating code, prefer edit_file_by_search_replace.\n</reminderInstructions>\n<userRequest>\n${text}\n</userRequest>`,
  };
}

const COPILOT_TOOLS = [
  { type: "function", function: { name: "edit_file_by_search_replace", parameters: {} } },
  { type: "function", function: { name: "insert_edit_into_file", parameters: {} } },
  { type: "function", function: { name: "create_file", parameters: {} } },
];

describe("Copilot prompt extraction", () => {
  it("extractCopilotUserRequest pulls content from <userRequest> tags", () => {
    const wrapped = copilotUserMsg("你好").content;
    expect(extractCopilotUserRequest(wrapped)).toBe("你好");
  });

  it("extractCopilotUserRequest passes through plain text", () => {
    expect(extractCopilotUserRequest("plain text")).toBe("plain text");
  });

  it("stripCopilotBoilerplate removes all Copilot tags", () => {
    const wrapped = copilotUserMsg("你好").content;
    const stripped = stripCopilotBoilerplate(wrapped);
    expect(stripped).not.toContain("<context>");
    expect(stripped).not.toContain("<editorContext>");
    expect(stripped).not.toContain("<reminderInstructions>");
    expect(stripped).toBe("你好");
  });

  it("buildNewSessionPrompt strips Copilot tags from user messages", () => {
    const messages = [
      { role: "system", content: COPILOT_SYSTEM_PROMPT },
      copilotUserMsg("你好"),
    ];
    const prompt = buildNewSessionPrompt(messages, 10);
    expect(prompt).not.toContain("<context>");
    expect(prompt).not.toContain("<reminderInstructions>");
    expect(prompt).toContain("你好");
  });

  it("buildPromptFromMessages includes system but buildNewSessionPrompt does not", () => {
    const messages = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
    ];
    const full = buildPromptFromMessages(messages);
    const condensed = buildNewSessionPrompt(messages, 10);
    expect(full).toContain("System:");
    expect(condensed).not.toContain("System:");
  });

  it("buildNewSessionPrompt respects maxTurns limit", () => {
    const messages: any[] = [
      { role: "system", content: COPILOT_SYSTEM_PROMPT },
    ];
    for (let i = 0; i < 20; i++) {
      messages.push({ role: "user", content: `msg-${i}` });
      messages.push({ role: "assistant", content: `reply-${i}` });
    }
    const prompt = buildNewSessionPrompt(messages, 3);
    expect(prompt).not.toContain("msg-0");
    expect(prompt).toContain("msg-17");
    expect(prompt).toContain("msg-18");
    expect(prompt).toContain("msg-19");
  });
});

describe("Copilot tools → mode detection", () => {
  const baseConfig = {
    mode: "ask",
    force: false,
    approveMcps: false,
    chatOnlyWorkspace: false,
  } as unknown as BridgeConfig;

  it("tools present → agent mode (--force, --trust, no --mode)", () => {
    const hasTools = COPILOT_TOOLS.length > 0;
    const modeOverride = hasTools ? ("agent" as const) : undefined;
    const args = buildAgentCmdArgs({
      config: baseConfig,
      workspaceDir: "/project",
      model: "opus-4.6",
      prompt: "test",
      stream: true,
      modeOverride,
    });
    expect(args).toContain("--force");
    expect(args).toContain("--trust");
    expect(args).not.toContain("--mode");
  });

  it("no tools → ask mode (--mode ask, no --force)", () => {
    const args = buildAgentCmdArgs({
      config: baseConfig,
      workspaceDir: "/project",
      model: "opus-4.6",
      prompt: "test",
      stream: true,
    });
    expect(args).toContain("--mode");
    expect(args).toContain("ask");
    expect(args).not.toContain("--force");
  });
});

describe("Copilot multi-turn session matching", () => {
  function normalize(msgs: Array<{ role: string; content: string }>): NormalizedMessage[] {
    return msgs
      .filter((m) => m.role !== "system" && m.role !== "developer")
      .map((m) => ({ role: m.role, content: m.content }));
  }

  const turn1 = [
    { role: "system", content: COPILOT_SYSTEM_PROMPT },
    copilotUserMsg("你好"),
  ];
  const turn2 = [
    ...turn1,
    { role: "assistant", content: "你好！有什么可以帮你的吗？" },
    copilotUserMsg("写个hello world"),
  ];
  const turn3 = [
    ...turn2,
    { role: "assistant", content: "好的，这是一个简单的 hello world" },
    copilotUserMsg("记住密码123"),
  ];
  const turn4 = [
    ...turn3,
    { role: "assistant", content: "好的，我记住了：123" },
    copilotUserMsg("还有什么问题"),
  ];

  it("resume: turn2 is a continuation of turn1", () => {
    const stored = normalize(turn1);
    const incoming = normalize(turn2);
    const prefix = commonPrefixLen(incoming, stored);
    expect(prefix).toBe(stored.length);
    expect(incoming.length).toBeGreaterThan(stored.length);
  });

  it("checkpoint: rollback to turn2, then ask different question", () => {
    const stored = normalize(turn4);
    const checkpoint = [
      ...turn2,
      { role: "assistant", content: "好的，这是一个简单的 hello world" },
      copilotUserMsg("密码是多少"),
    ];
    const incoming = normalize(checkpoint);
    const prefix = commonPrefixLen(incoming, stored);
    expect(prefix).toBeLessThan(stored.length);
    expect(prefix).toBe(normalize(turn2).length + 1);
  });

  it("retry: same messages sent again", () => {
    const stored = normalize(turn3);
    const incoming = normalize(turn3);
    const prefix = commonPrefixLen(incoming, stored);
    expect(prefix).toBe(stored.length);
    expect(incoming.length).toBe(stored.length);
  });

  it("system prompt changes don't affect session matching (filtered out)", () => {
    const withDifferentSystem = [
      { role: "system", content: "COMPLETELY DIFFERENT SYSTEM PROMPT" },
      copilotUserMsg("你好"),
    ];
    const stored = normalize(turn1);
    const incoming = normalize(withDifferentSystem);
    const prefix = commonPrefixLen(incoming, stored);
    expect(prefix).toBe(1);
  });
});

describe("Copilot message content extraction", () => {
  it("handles array content format from Copilot", () => {
    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: "Describe this code" },
          { type: "image_url", image_url: { url: "data:..." } },
        ],
      },
    ];
    const prompt = buildNewSessionPrompt(messages, 10);
    expect(prompt).toContain("Describe this code");
    expect(prompt).not.toContain("image_url");
  });
});
