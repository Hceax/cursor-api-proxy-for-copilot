import { describe, it, expect } from "vitest";
import { resolveToCursorModel, getAnthropicModelAliases } from "./model-map.js";

describe("resolveToCursorModel", () => {
  it("maps known Anthropic names to Cursor IDs", () => {
    expect(resolveToCursorModel("claude-opus-4-6")).toBe("opus-4.6");
    expect(resolveToCursorModel("claude-sonnet-4-6")).toBe("sonnet-4.6");
    expect(resolveToCursorModel("claude-opus-4-5")).toBe("opus-4.5");
    expect(resolveToCursorModel("claude-sonnet-4-5")).toBe("sonnet-4.5");
  });

  it("maps thinking variants", () => {
    expect(resolveToCursorModel("claude-opus-4-6-thinking")).toBe("opus-4.6-thinking");
    expect(resolveToCursorModel("claude-sonnet-4-6-thinking")).toBe("sonnet-4.6-thinking");
  });

  it("is case insensitive", () => {
    expect(resolveToCursorModel("CLAUDE-OPUS-4-6")).toBe("opus-4.6");
    expect(resolveToCursorModel("Claude-Sonnet-4-6")).toBe("sonnet-4.6");
  });

  it("passes through unknown models as-is", () => {
    expect(resolveToCursorModel("gpt-4o")).toBe("gpt-4o");
    expect(resolveToCursorModel("some-other-model")).toBe("some-other-model");
  });

  it("returns undefined for undefined or empty input", () => {
    expect(resolveToCursorModel(undefined)).toBeUndefined();
    expect(resolveToCursorModel("")).toBeUndefined();
    expect(resolveToCursorModel("   ")).toBeUndefined();
  });
});

describe("getAnthropicModelAliases", () => {
  it("returns Anthropic aliases for matching Cursor IDs", () => {
    const result = getAnthropicModelAliases(["opus-4.6", "sonnet-4.6"]);
    expect(result).toContainEqual({ id: "claude-opus-4-6", name: "Claude 4.6 Opus" });
    expect(result).toContainEqual({ id: "claude-sonnet-4-6", name: "Claude 4.6 Sonnet" });
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no matches", () => {
    const result = getAnthropicModelAliases(["gpt-4o", "unknown-model"]);
    expect(result).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    const result = getAnthropicModelAliases([]);
    expect(result).toEqual([]);
  });
});
