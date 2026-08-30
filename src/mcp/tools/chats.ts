import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { MessageDatabase } from "../../database.js";
import { bounded, jsonResult, readOnlyTool } from "../tool-utils.js";

export function registerChatsTool(server: McpServer, database: MessageDatabase): void {
  server.registerTool(
    "list_chats",
    {
      title: "List WhatsApp chats",
      description:
        "Lists locally synchronized WhatsApp conversations. Use this before reading messages, then pass the exact chat id to get_messages.",
      inputSchema: z.object({
        query: z.string().max(200).optional().describe("Optional name or chat-id filter."),
        limit: z.int().min(1).max(100).optional().describe("Maximum chats. Defaults to 50."),
      }),
      annotations: readOnlyTool,
    },
    async ({ query, limit }) =>
      jsonResult({ chats: database.listChats(bounded(limit, 50, 100), query) }),
  );
}
