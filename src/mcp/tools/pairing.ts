import type { McpServer } from "@modelcontextprotocol/server";
import type { WhatsAppCollector } from "../../whatsapp.js";
import { readOnlyTool } from "../tool-utils.js";

/** Returns the short-lived device-link QR as an MCP image, so supported clients show it in chat. */
export function registerPairingTool(server: McpServer, collector: WhatsAppCollector): void {
  server.registerTool(
    "whatsapp_pairing_qr",
    {
      title: "Show WhatsApp pairing QR",
      description:
        "Displays the current short-lived WhatsApp linked-device QR inside the chat. Use only on a trusted local client; scan it from WhatsApp Settings > Linked devices. The QR is unavailable after pairing.",
      annotations: readOnlyTool,
    },
    async () => {
      const png = await collector.qrPng();
      if (!png) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No active pairing QR. Check whatsapp_status: the device may already be connected or still starting.",
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          { type: "image" as const, data: png.toString("base64"), mimeType: "image/png" },
          {
            type: "text" as const,
            text: "Scan this QR in WhatsApp: Settings > Linked devices > Link a device. It expires quickly and stops working once paired.",
          },
        ],
      };
    },
  );
}
