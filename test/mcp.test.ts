import { expect, test } from "bun:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { MessageDatabase } from "../src/database.js";
import { createMcpServer } from "../src/mcp/server.js";

test("exposes only read-only message tools", async () => {
  const database = new MessageDatabase(":memory:");
  database.upsertChat("chat@example", "Teste", "direct");
  database.saveMessage({
    id: "message-1",
    chatId: "chat@example",
    senderId: "person",
    senderName: "Pessoa",
    fromMe: false,
    timestamp: 1_700_000_000,
    type: "text",
    text: "Mensagem para análise",
  });
  const collector = {
    status: () => ({ state: "connected", qrAvailable: false, stats: database.stats() }),
    qrPng: async () => Buffer.from("png-data"),
  } as any;
  const server = createMcpServer(database, collector);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      "get_messages",
      "list_chats",
      "search_messages",
      "whatsapp_pairing_qr",
      "whatsapp_status",
    ]);
    expect(tools.tools.every((tool) => tool.annotations?.readOnlyHint)).toBe(true);
    const result = await client.callTool({
      name: "get_messages",
      arguments: { chat_id: "chat@example" },
    });
    expect(result.content).toContainEqual(
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("Mensagem para análise"),
      }),
    );
    const pairing = await client.callTool({ name: "whatsapp_pairing_qr" });
    expect(pairing.content).toContainEqual(
      expect.objectContaining({ type: "image", data: Buffer.from("png-data").toString("base64") }),
    );
  } finally {
    await client.close();
    await server.close();
    database.close();
  }
});
