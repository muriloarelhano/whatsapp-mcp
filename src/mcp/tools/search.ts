import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { MessageDatabase } from "../../database.js";
import { bounded, jsonResult, readOnlyTool } from "../tool-utils.js";

export function registerSearchTool(server: McpServer, database: MessageDatabase): void {
  server.registerTool(
    "search_messages",
    {
      title: "Search WhatsApp messages",
      description:
        "Full-text searches locally synchronized message text. Search syntax is SQLite FTS5; quote multi-word phrases.",
      inputSchema: z.object({
        query: z.string().min(2).max(200).describe("Full-text query."),
        chat_id: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe("Restrict the search to an exact chat id."),
        limit: z.int().min(1).max(100).optional().describe("Results to return. Defaults to 30."),
      }),
      annotations: readOnlyTool,
    },
    async ({ query, chat_id, limit }) => {
      try {
        return jsonResult({
          messages: database.searchMessages(query, chat_id, bounded(limit, 30, 100)),
        });
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Invalid FTS query: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
