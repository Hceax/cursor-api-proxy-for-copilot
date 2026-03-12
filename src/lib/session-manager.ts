import { createHash } from "node:crypto";

import type { BridgeConfig } from "./config.js";
import { run } from "./process.js";

export interface NormalizedMessage {
  role: string;
  content: string;
}

interface Session {
  chatId: string;
  fingerprint: string;
  messageCount: number;
  lastActivity: number;
}

export interface SessionResult {
  chatId: string;
  isNew: boolean;
  lastUserMessage: string;
}

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

    const currentFp = fingerprint(messages);
    const match = this.findContinuation(messages);

    if (match) {
      match.messageCount = messages.length;
      match.fingerprint = currentFp;
      match.lastActivity = Date.now();
      console.log(
        `[${ts()}] Session ${match.chatId.slice(0, 8)}...: ` +
          `resume (${messages.length} msgs, ${this.sessions.size} active)`,
      );
      return { chatId: match.chatId, isNew: false, lastUserMessage: lastUser };
    }

    const chatId = await createCliChat(config);
    this.sessions.set(chatId, {
      chatId,
      fingerprint: currentFp,
      messageCount: messages.length,
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

  private findContinuation(incoming: NormalizedMessage[]): Session | null {
    for (const session of this.sessions.values()) {
      if (incoming.length <= session.messageCount) continue;
      const prefixFp = fingerprint(incoming.slice(0, session.messageCount));
      if (prefixFp === session.fingerprint) return session;
    }
    return null;
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
  }
}

function normalizeMessages(raw: any[]): NormalizedMessage[] {
  const result: NormalizedMessage[] = [];
  for (const m of raw ?? []) {
    if (m?.role === "system" || m?.role === "developer") continue;
    const content =
      typeof m?.content === "string"
        ? m.content
        : Array.isArray(m?.content)
          ? (m.content as any[])
              .filter((p: any) => p?.type === "text")
              .map((p: any) => p.text ?? "")
              .join("")
          : "";
    if (content) result.push({ role: m.role, content });
  }
  return result;
}

function findLastUserMessage(messages: NormalizedMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return null;
}

function fingerprint(messages: NormalizedMessage[]): string {
  const h = createHash("sha256");
  for (const m of messages) {
    h.update(`${m.role}:${m.content}\n`);
  }
  return h.digest("hex").slice(0, 32);
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
