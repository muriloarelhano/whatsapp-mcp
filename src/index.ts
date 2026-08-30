import { join } from "node:path";
import { createMcpHandler, hostHeaderValidationResponse } from "@modelcontextprotocol/server";
import { loadConfig, isAuthorized } from "./config.js";
import { MessageDatabase } from "./database.js";
import { setupPageResponse } from "./http/setup-page.js";
import { createMcpServer } from "./mcp/server.js";
import { WhatsAppCollector } from "./whatsapp.js";

const config = loadConfig();
const database = new MessageDatabase(join(config.dataDir, "messages.sqlite"));
const collector = new WhatsAppCollector(config, database);
if (config.connectWhatsApp) await collector.start();
const mcpHandler = createMcpHandler(() => createMcpServer(database, collector), {
  legacy: "stateless",
  responseMode: "json",
  onerror: (error) => console.error("MCP request failed", error),
});

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });

const protectedResourceMetadataPaths = new Set([
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/mcp",
]);

function isLoopback(url: URL): boolean {
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
}

const app = Bun.serve({
  hostname: config.host,
  port: config.port,
  async fetch(request) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/health" && request.method === "GET") {
        return json({ service: "whatsapp-mcp-local", ...collector.status() });
      }

      if (url.pathname === "/setup" && request.method === "GET") {
        return isLoopback(url) ? setupPageResponse() : json({ error: "Not found" }, 404);
      }

      // The OpenAI tunnel client checks RFC 9728 protected-resource metadata
      // during its preflight. This MCP uses a local bearer that the tunnel
      // injects, so it intentionally advertises no OAuth authorization server.
      if (request.method === "GET" && protectedResourceMetadataPaths.has(url.pathname)) {
        return json({ resource: new URL("/mcp", url).toString() });
      }

      if (!isAuthorized(request, config.mcpToken)) return json({ error: "Unauthorized" }, 401);
      if (url.pathname === "/pair" && request.method === "GET") {
        const svg = await collector.qrSvg();
        return svg
          ? new Response(svg, {
              headers: { "content-type": "image/svg+xml", "cache-control": "no-store" },
            })
          : json(
              { error: "No active pairing QR. Check /health; it may already be connected." },
              404,
            );
      }
      if (url.pathname === "/pair.png" && request.method === "GET") {
        const png = await collector.qrPng();
        if (!png)
          return json(
            { error: "No active pairing QR. Check /health; it may already be connected." },
            404,
          );
        const body = new ArrayBuffer(png.byteLength);
        new Uint8Array(body).set(png);
        return new Response(body, {
          headers: { "content-type": "image/png", "cache-control": "no-store" },
        });
      }
      if (url.pathname === "/mcp") {
        const hostError = hostHeaderValidationResponse(request, [
          "localhost",
          "127.0.0.1",
          "[::1]",
        ]);
        return hostError ?? mcpHandler.fetch(request);
      }
      return json({ error: "Not found" }, 404);
    } catch (error) {
      console.error("Request failed", error);
      return json({ error: "Internal server error" }, 500);
    }
  },
});

console.info(`WhatsApp MCP listening on http://${config.host}:${app.port}`);

async function shutdown(): Promise<void> {
  app.stop(true);
  await mcpHandler.close();
  await collector.stop();
  database.close();
}
process.once("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.once("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});
