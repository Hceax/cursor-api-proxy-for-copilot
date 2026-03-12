import { describe, it, expect, vi } from "vitest";
import { createStreamParser } from "./cli-stream-parser.js";

describe("createStreamParser", () => {
  it("single assistant message calls onText with text, onDone not called", () => {
    const onText = vi.fn();
    const onDone = vi.fn();
    const parse = createStreamParser(onText, onDone);

    parse(JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "Hello" }] },
    }));

    expect(onText).toHaveBeenCalledTimes(1);
    expect(onText).toHaveBeenCalledWith("Hello");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("result/success calls onDone", () => {
    const onText = vi.fn();
    const onDone = vi.fn();
    const parse = createStreamParser(onText, onDone);

    parse(JSON.stringify({ type: "result", subtype: "success" }));

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("incremental deltas emit only the delta", () => {
    const onText = vi.fn();
    const onDone = vi.fn();
    const parse = createStreamParser(onText, onDone);

    parse(JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "Hello" }] },
    }));
    parse(JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "Hello world" }] },
    }));

    expect(onText).toHaveBeenCalledTimes(2);
    expect(onText).toHaveBeenNthCalledWith(1, "Hello");
    expect(onText).toHaveBeenNthCalledWith(2, " world");
  });

  it("duplicate full text (same as accumulated) is skipped", () => {
    const onText = vi.fn();
    const onDone = vi.fn();
    const parse = createStreamParser(onText, onDone);

    parse(JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "Hello" }] },
    }));
    parse(JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "Hello" }] },
    }));

    expect(onText).toHaveBeenCalledTimes(1);
    expect(onText).toHaveBeenCalledWith("Hello");
  });

  it("multiple content parts are joined", () => {
    const onText = vi.fn();
    const onDone = vi.fn();
    const parse = createStreamParser(onText, onDone);

    parse(JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "world" },
        ],
      },
    }));

    expect(onText).toHaveBeenCalledTimes(1);
    expect(onText).toHaveBeenCalledWith("Hello world");
  });

  it("non-JSON lines are ignored", () => {
    const onText = vi.fn();
    const onDone = vi.fn();
    const parse = createStreamParser(onText, onDone);

    parse("not json");
    parse("{ invalid json");
    parse("");
    parse("  \n");

    expect(onText).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("lines after done are ignored", () => {
    const onText = vi.fn();
    const onDone = vi.fn();
    const parse = createStreamParser(onText, onDone);

    parse(JSON.stringify({ type: "result", subtype: "success" }));
    parse(JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "ignored" }] },
    }));

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onText).not.toHaveBeenCalled();
  });

  it("empty text content is skipped", () => {
    const onText = vi.fn();
    const onDone = vi.fn();
    const parse = createStreamParser(onText, onDone);

    parse(JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "" }] },
    }));
    parse(JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "image", url: "x" }] },
    }));
    parse(JSON.stringify({
      type: "assistant",
      message: { content: [] },
    }));

    expect(onText).not.toHaveBeenCalled();
  });
});
