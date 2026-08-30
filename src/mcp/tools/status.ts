import type { McpServer } from "@modelcontextprotocol/server";
import type { WhatsAppCollector } from "../../whatsapp.js";
import { jsonResult, readOnlyTool } from "../tool-utils.js";

export function registerStatusTool(server: McpServer, collector: WhatsAppCollector): void {
  server.registerTool(
    "whatsapp_status",
    {
      title: "WhatsApp connection status",
      description:
        "Checks whether the local WhatsApp companion is paired and how much message history is available locally.",
      annotations: readOnlyTool,
    },
    async () => jsonResult(collector.status()),
  );
}
