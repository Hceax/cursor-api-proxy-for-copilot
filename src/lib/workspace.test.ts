import { describe, it, expect, vi, afterEach } from "vitest";
import * as path from "node:path";
import {
  detectWorkspaceFromMessages,
  resolveWorkspace,
} from "./workspace.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
    mkdtempSync: vi.fn(actual.mkdtempSync),
  };
});

import * as fs from "node:fs";

describe("detectWorkspaceFromMessages", () => {
  it("returns null for empty messages", () => {
    expect(detectWorkspaceFromMessages([])).toBeNull();
    expect(detectWorkspaceFromMessages(null as any)).toBeNull();
  });

  it("returns null for messages with no paths", () => {
    expect(
      detectWorkspaceFromMessages([
        { role: "user", content: "hello world" },
        { role: "system", content: "no paths here" },
      ])
    ).toBeNull();
  });

  it("skips assistant role messages", () => {
    const cwd = process.cwd();
    const msgWithPath = `Check file at ${cwd}\\src\\index.ts`;
    expect(
      detectWorkspaceFromMessages([
        { role: "assistant", content: msgWithPath },
      ])
    ).toBeNull();
  });

  it("returns null for non-existent paths", async () => {
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(
      detectWorkspaceFromMessages([
        {
          role: "user",
          content: "See C:\\nonexistent\\fake\\path\\file.txt",
        },
      ])
    ).toBeNull();
    vi.mocked(fs.existsSync).mockImplementation(actual.existsSync);
  });

  it("returns shallowest existing directory from user message", () => {
    const cwd = process.cwd();
    const deeper = path.join(cwd, "src", "lib");
    expect(
      detectWorkspaceFromMessages([
        {
          role: "user",
          content: `Check ${cwd}\\package.json and ${deeper}\\workspace.ts`,
        },
      ])
    ).toBe(cwd);
  });

  it("extracts paths from array content with text parts", () => {
    const cwd = process.cwd();
    expect(
      detectWorkspaceFromMessages([
        {
          role: "user",
          content: [{ type: "text", text: `File at ${cwd}` }],
        },
      ])
    ).toBe(cwd);
  });
});

describe("resolveWorkspace", () => {
  const baseConfig = {
    workspace: "C:\\fallback\\workspace",
    chatOnlyWorkspace: false,
  } as any;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("chatOnlyWorkspace=true returns tempDir", async () => {
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    const mockTemp = "C:\\tmp\\cursor-proxy-abc123";
    vi.mocked(fs.mkdtempSync).mockReturnValue(mockTemp);
    const result = resolveWorkspace({
      ...baseConfig,
      chatOnlyWorkspace: true,
    });
    expect(result.workspaceDir).toBe(mockTemp);
    expect(result.tempDir).toBe(mockTemp);
    vi.mocked(fs.mkdtempSync).mockImplementation(actual.mkdtempSync);
  });

  it("header provided uses it", () => {
    const header = "C:\\my\\project";
    const result = resolveWorkspace(baseConfig, header);
    expect(result.workspaceDir).toBe(header);
  });

  it("no header, messages with paths attempts detection", () => {
    const cwd = process.cwd();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = resolveWorkspace(baseConfig, null, [
      { role: "user", content: `See ${path.join(cwd, "package.json")}` },
    ]);
    expect(result.workspaceDir).toBe(cwd);
    consoleSpy.mockRestore();
  });

  it("fallback to config.workspace", () => {
    const result = resolveWorkspace(baseConfig, null, [
      { role: "user", content: "no paths" },
    ]);
    expect(result.workspaceDir).toBe(baseConfig.workspace);
  });
});
