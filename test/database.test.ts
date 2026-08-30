import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageDatabase } from "../src/database.js";

test("stores, lists, paginates, and full-text searches messages", () => {
  const dir = mkdtempSync(join(tmpdir(), "whatsapp-mcp-test-"));
  const db = new MessageDatabase(join(dir, "messages.sqlite"));
  try {
    db.upsertChat("55119999@s.whatsapp.net", "Ana", "direct");
    db.saveMessage({
      id: "one",
      chatId: "55119999@s.whatsapp.net",
      senderId: "Ana",
      senderName: "Ana",
      fromMe: false,
      timestamp: 1_700_000_000,
      type: "text",
      text: "Vamos revisar o orçamento amanhã",
    });
    db.saveMessage({
      id: "two",
      chatId: "55119999@s.whatsapp.net",
      senderId: "me",
      senderName: null,
      fromMe: true,
      timestamp: 1_700_000_100,
      type: "text",
      text: "Combinado",
    });
    expect(db.listChats(10)).toEqual([expect.objectContaining({ name: "Ana", messageCount: 2 })]);
    expect(db.getMessages("55119999@s.whatsapp.net", 100)).toHaveLength(2);
    expect(db.searchMessages("orçamento", undefined, 10)).toEqual([
      expect.objectContaining({ id: "one" }),
    ]);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
