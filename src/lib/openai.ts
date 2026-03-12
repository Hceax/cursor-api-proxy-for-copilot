export type OpenAiChatCompletionRequest = {
  model?: string;
  messages: any[];
  stream?: boolean;
  tools?: any[];
  functions?: any[];
};

export function normalizeModelId(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parts = trimmed.split("/");
  return parts[parts.length - 1] || undefined;
}

const USER_REQUEST_RE = /<userRequest>\s*([\s\S]*?)\s*<\/userRequest>/;
const COPILOT_TAG_RE = /<(?:context|editorContext|reminderInstructions|userRequest)>[\s\S]*?<\/(?:context|editorContext|reminderInstructions|userRequest)>/g;

/**
 * Extract the actual user request from a Copilot-wrapped message.
 * If `<userRequest>` tag is present, returns just its content.
 * Otherwise returns the full text.
 */
export function extractCopilotUserRequest(text: string): string {
  const match = text.match(USER_REQUEST_RE);
  if (match) return match[1].trim();
  return text;
}

/**
 * Strip Copilot wrapper tags, keeping only the meaningful parts.
 * Returns `<editorContext>` content + `<userRequest>` content if tags present,
 * otherwise returns the original text.
 */
export function stripCopilotBoilerplate(text: string): string {
  if (!USER_REQUEST_RE.test(text)) return text;
  return text.replace(COPILOT_TAG_RE, "").trim() || extractCopilotUserRequest(text);
}

export function messageContentToText(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        if (!p) return "";
        if (typeof p === "string") return p;
        if (p.type === "text" && typeof p.text === "string") return p.text;
        return "";
      })
      .join("");
  }
  return "";
}

export function buildPromptFromMessages(messages: any[]): string {
  const systemParts: string[] = [];
  const convo: string[] = [];

  for (const m of messages || []) {
    const role = m?.role;
    const text = messageContentToText(m?.content);
    if (!text) continue;

    if (role === "system" || role === "developer") {
      systemParts.push(text);
      continue;
    }
    if (role === "user") {
      convo.push(`User: ${text}`);
      continue;
    }
    if (role === "assistant") {
      convo.push(`Assistant: ${text}`);
      continue;
    }
    if (role === "tool" || role === "function") {
      convo.push(`Tool: ${text}`);
      continue;
    }
  }

  const system = systemParts.length
    ? `System:\n${systemParts.join("\n\n")}\n\n`
    : "";
  const transcript = convo.join("\n\n");
  return system + transcript + "\n\nAssistant:";
}

/**
 * Build a condensed prompt for the first message of a new session.
 * Strips Copilot system prompts and limits history to avoid token waste.
 */
export function buildNewSessionPrompt(
  messages: any[],
  maxTurns: number,
): string {
  const convo: string[] = [];

  for (const m of messages || []) {
    const role = m?.role;
    if (role === "system" || role === "developer") continue;
    const raw = messageContentToText(m?.content);
    if (!raw) continue;

    const text = role === "user" ? extractCopilotUserRequest(raw) : raw;
    if (role === "user") convo.push(`User: ${text}`);
    else if (role === "assistant") convo.push(`Assistant: ${text}`);
    else if (role === "tool" || role === "function") convo.push(`Tool: ${text}`);
  }

  const limited = convo.slice(-(maxTurns * 2));
  return limited.join("\n\n");
}
