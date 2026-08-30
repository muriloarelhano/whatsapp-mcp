import { McpServer } from "@modelcontextprotocol/server";
import type { MessageDatabase } from "../database.js";
import type { WhatsAppCollector } from "../whatsapp.js";
import { registerChatsTool } from "./tools/chats.js";
import { registerMessagesTool } from "./tools/messages.js";
import { registerPairingTool } from "./tools/pairing.js";
import { registerSearchTool } from "./tools/search.js";
import { registerStatusTool } from "./tools/status.js";

/** Creates a stateless MCP server from an explicit, reviewable tool registry. */
export function createMcpServer(
  database: MessageDatabase,
  collector: WhatsAppCollector,
): McpServer {
  const server = new McpServer(
    { name: "whatsapp-mcp-local", version: "0.2.0", title: "WhatsApp MCP Local" },
    { capabilities: { tools: {} } },
  );

  registerStatusTool(server, collector);
  registerPairingTool(server, collector);
  registerChatsTool(server, database);
  registerMessagesTool(server, database);
  registerSearchTool(server, database);
  return server;
}
