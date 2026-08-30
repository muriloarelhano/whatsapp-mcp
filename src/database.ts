import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Chat = {
  id: string;
  name: string;
  kind: "group" | "direct" | "unknown";
  lastMessageAt: string | null;
  messageCount: number;
};
export type StoredMessage = {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string | null;
  fromMe: boolean;
  timestamp: string;
  type: string;
  text: string;
};

type MessageInput = Omit<StoredMessage, "timestamp"> & { timestamp: number };

export class MessageDatabase {
  private readonly db: Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path, { create: true, strict: true });
    this.db.exec(
      "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;",
    );
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'unknown',
        last_message_at INTEGER,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL REFERENCES chats(id),
        sender_id TEXT NOT NULL,
        sender_name TEXT,
        from_me INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL,
        text TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS messages_by_chat_time ON messages(chat_id, timestamp DESC);
      CREATE VIRTUAL TABLE IF NOT EXISTS message_search USING fts5(message_id UNINDEXED, chat_id UNINDEXED, text);
    `);
  }

  close(): void {
    this.db.close();
  }

  upsertChat(id: string, name?: string, kind?: Chat["kind"]): void {
    const now = Date.now();
    const fallbackName = name?.trim() || id;
    this.db
      .query(`
      INSERT INTO chats (id, name, kind, updated_at) VALUES ($id, $name, $kind, $now)
      ON CONFLICT(id) DO UPDATE SET
        name = CASE WHEN excluded.name != excluded.id THEN excluded.name ELSE chats.name END,
        kind = CASE WHEN excluded.kind != 'unknown' THEN excluded.kind ELSE chats.kind END,
        updated_at = excluded.updated_at
    `)
      .run({ id, name: fallbackName, kind: kind ?? "unknown", now });
  }

  saveMessage(message: MessageInput): void {
    this.upsertChat(
      message.chatId,
      undefined,
      message.chatId.endsWith("@g.us") ? "group" : "direct",
    );
    const transaction = this.db.transaction(() => {
      const result = this.db
        .query(`
        INSERT OR IGNORE INTO messages (id, chat_id, sender_id, sender_name, from_me, timestamp, type, text)
        VALUES ($id, $chatId, $senderId, $senderName, $fromMe, $timestamp, $type, $text)
      `)
        .run({
          id: message.id,
          chatId: message.chatId,
          senderId: message.senderId,
          senderName: message.senderName,
          fromMe: message.fromMe ? 1 : 0,
          timestamp: message.timestamp,
          type: message.type,
          text: message.text,
        });
      if (result.changes) {
        this.db
          .query(
            "INSERT INTO message_search (message_id, chat_id, text) VALUES ($id, $chatId, $text)",
          )
          .run({ id: message.id, chatId: message.chatId, text: message.text });
        this.db
          .query(
            "UPDATE chats SET last_message_at = MAX(COALESCE(last_message_at, 0), $timestamp), updated_at = $now WHERE id = $chatId",
          )
          .run({ timestamp: message.timestamp, now: Date.now(), chatId: message.chatId });
      }
    });
    transaction();
  }

  listChats(limit: number, query?: string): Chat[] {
    const text = query?.trim();
    return this.db
      .query(`
      SELECT c.id, c.name, c.kind, c.last_message_at AS lastMessageAt, COUNT(m.id) AS messageCount
      FROM chats c LEFT JOIN messages m ON m.chat_id = c.id
      WHERE ($query IS NULL OR c.name LIKE '%' || $query || '%' OR c.id LIKE '%' || $query || '%')
      GROUP BY c.id ORDER BY c.last_message_at DESC NULLS LAST LIMIT $limit
    `)
      .all({ limit, query: text || null })
      .map((row: any) => ({
        ...row,
        lastMessageAt: row.lastMessageAt ? new Date(row.lastMessageAt * 1000).toISOString() : null,
      })) as Chat[];
  }

  getMessages(chatId: string, limit: number, before?: string): StoredMessage[] {
    const beforeTime = before
      ? Math.floor(new Date(before).getTime() / 1000)
      : Number.MAX_SAFE_INTEGER;
    if (!Number.isFinite(beforeTime)) throw new Error("before must be an ISO-8601 timestamp.");
    return this.db
      .query(`
      SELECT id, chat_id AS chatId, sender_id AS senderId, sender_name AS senderName, from_me AS fromMe, timestamp, type, text
      FROM messages WHERE chat_id = $chatId AND timestamp < $before ORDER BY timestamp DESC LIMIT $limit
    `)
      .all({ chatId, before: beforeTime, limit })
      .reverse()
      .map((row: any) => ({
        ...row,
        fromMe: Boolean(row.fromMe),
        timestamp: new Date(row.timestamp * 1000).toISOString(),
      })) as StoredMessage[];
  }

  searchMessages(query: string, chatId: string | undefined, limit: number): StoredMessage[] {
    const result = this.db
      .query(`
      SELECT m.id, m.chat_id AS chatId, m.sender_id AS senderId, m.sender_name AS senderName, m.from_me AS fromMe, m.timestamp, m.type, m.text
      FROM message_search s JOIN messages m ON m.id = s.message_id
      WHERE message_search MATCH $query AND ($chatId IS NULL OR m.chat_id = $chatId)
      ORDER BY rank LIMIT $limit
    `)
      .all({ query, chatId: chatId ?? null, limit });
    return result.map((row: any) => ({
      ...row,
      fromMe: Boolean(row.fromMe),
      timestamp: new Date(row.timestamp * 1000).toISOString(),
    })) as StoredMessage[];
  }

  stats(): { chats: number; messages: number } {
    const chats = this.db.query("SELECT COUNT(*) AS value FROM chats").get() as { value: number };
    const messages = this.db.query("SELECT COUNT(*) AS value FROM messages").get() as {
      value: number;
    };
    return { chats: chats.value, messages: messages.value };
  }
}
