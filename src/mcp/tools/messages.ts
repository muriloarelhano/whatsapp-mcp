import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { MessageDatabase } from "../../database.js";
import { bounded, jsonResult, readOnlyTool } from "../tool-utils.js";

export function registerMessagesTool(server: McpServer, database: MessageDatabase): void {
  server.registerTool(
    "get_messages",
    {
      title: "Read recent WhatsApp messages",
      description:
        "Returns messages from one locally synchronized chat. It never sends, marks read, reacts, downloads media, or changes WhatsApp state.",
      inputSchema: z.object({
        chat_id: z.string().min(1).max(200).describe("Exact chat id returned by list_chats."),
        limit: z.int().min(1).max(250).optional().describe("Messages to return. Defaults to 100."),
        before: z.iso
          .datetime({ offset: true })
          .optional()
          .describe("Optional exclusive ISO-8601 upper timestamp for pagination."),
      }),
      annotations: readOnlyTool,
    },
    async ({ chat_id, limit, before }) =>
      jsonResult({
        chat_id,
        messages: database.getMessages(chat_id, bounded(limit, 100, 250), before),
      }),
  );
}
