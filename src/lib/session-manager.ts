import type { BridgeConfig } from "./config.js";
import { extractCopilotUserRequest, messageContentToText } from "./openai.js";
import { run } from "./process.js";

export interface NormalizedMessage {
  role: string;
  content: string;
}

interface Session {
  chatId: string;
  messages: NormalizedMessage[];
  lastActivity: number;
}

export interface SessionResult {
  chatId: string;
  isNew: boolean;
  lastUserMessage: string;
}

const MAX_SESSIONS = 50;

export class SessionManager {
  private sessions = new Map<string, Session>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(private sessionTtlMs: number = 30 * 60 * 1000) {
    this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
  }

  async processRequest(
    config: BridgeConfig,
    rawMessages: any[],
  ): Promise<SessionResult> {
    const messages = normalizeMessages(rawMessages);
    const lastUser = findLastUserMessage(messages);
    if (!lastUser) {
      throw new Error("No user message found in request");
    }

    const match = this.findSession(messages);

    if (match) {
      const prefixLen = commonPrefixLen(messages, match.messages);
      const isCheckpoint = prefixLen < match.messages.length;

      if (isCheckpoint) {
        this.sessions.delete(match.chatId);
        console.log(
          `[${ts()}] Session ${match.chatId.slice(0, 8)}...: ` +
            `checkpoint detected (prefix ${prefixLen}/${match.messages.length}), ` +
            `creating new session`,
        );
      } else {
        const kind =
          messages.length > match.messages.length ? "resume" : "retry";
        match.messages = messages;
        match.lastActivity = Date.now();
        console.log(
          `[${ts()}] Session ${match.chatId.slice(0, 8)}...: ` +
            `${kind} (${messages.length} msgs, ${this.sessions.size} active)`,
        );
        return {
          chatId: match.chatId,
          isNew: false,
          lastUserMessage: lastUser,
        };
      }
    }

    if (this.sessions.size >= MAX_SESSIONS) {
      this.evictOldest();
    }

    const chatId = await createCliChat(config);
    this.sessions.set(chatId, {
      chatId,
      messages,
      lastActivity: Date.now(),
    });
    console.log(
      `[${ts()}] Session ${chatId.slice(0, 8)}...: ` +
        `new (${messages.length} msgs, ${this.sessions.size} active)`,
    );
    return { chatId, isNew: true, lastUserMessage: lastUser };
  }

  getActiveCount(): number {
    return this.sessions.size;
  }

  private findSession(incoming: NormalizedMessage[]): Session | null {
    let bestSession: Session | null = null;
    let bestMatchLen = 0;

    for (const session of this.sessions.values()) {
      const matchLen = commonPrefixLen(incoming, session.messages);
      if (matchLen > bestMatchLen) {
        bestMatchLen = matchLen;
        bestSession = session;
      }
    }

    return bestMatchLen >= 1 ? bestSession : null;
  }

  private evictOldest() {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [id, session] of this.sessions) {
      if (session.lastActivity < oldestTime) {
        oldestTime = session.lastActivity;
        oldest = id;
      }
    }
    if (oldest) {
      this.sessions.delete(oldest);
      console.log(`[${ts()}] Session evicted (limit ${MAX_SESSIONS})`);
    }
  }

  private cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > this.sessionTtlMs) {
        this.sessions.delete(id);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(
        `[${ts()}] Session cleanup: removed ${cleaned}, ${this.sessions.size} remaining`,
      );
    }
  }

  destroy() {
    clearInterval(this.cleanupTimer);
    this.sessions.clear();
    console.log(`[${ts()}] SessionManager destroyed`);
  }
}

function normalizeMessages(raw: any[]): NormalizedMessage[] {
  const result: NormalizedMessage[] = [];
  for (const m of raw ?? []) {
    if (m?.role === "system" || m?.role === "developer") continue;
    const content = messageContentToText(m?.content);
    if (content) result.push({ role: m.role, content });
  }
  return result;
}

function findLastUserMessage(messages: NormalizedMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      return extractCopilotUserRequest(messages[i].content);
    }
  }
  return null;
}

export function commonPrefixLen(
  a: NormalizedMessage[],
  b: NormalizedMessage[],
): number {
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i].role !== b[i].role || a[i].content !== b[i].content) return i;
  }
  return minLen;
}

async function createCliChat(config: BridgeConfig): Promise<string> {
  const result = await run(config.agentBin, ["create-chat"], {
    timeoutMs: 15_000,
  });
  const chatId = result.stdout.trim();
  if (!chatId || result.code !== 0) {
    throw new Error(
      `Failed to create CLI chat (exit ${result.code}): ${result.stderr}`,
    );
  }
  return chatId;
}

function ts(): string {
  return new Date().toISOString();
}
