# ChatGPT Secure MCP Tunnel

ChatGPT cannot reach `http://127.0.0.1` directly. The official OpenAI Secure MCP Tunnel creates an outbound connection from this computer to the OpenAI control plane; no public port is opened.

## Setup

1. Start the local server: `docker compose up -d`.
2. In the OpenAI platform, create a tunnel and a runtime key. Put `OPENAI_TUNNEL_ID` and `CONTROL_PLANE_API_KEY` in `.env`.
3. Install the official Go client:

   ```sh
   go install github.com/openai/tunnel-client/cmd/client@v0.0.13
   ```

4. Validate it with `bun run tunnel:doctor`.
5. Keep `bun run tunnel:start` running while ChatGPT needs access.
6. In ChatGPT, create a Developer Mode app using the tunnel and select no additional authentication. The tunnel injects the local bearer, so `MCP_AUTH_TOKEN` remains on this computer.

The tunnel client runs on the host instead of Docker so it can use the host's credential store and maintain the expected trust boundary.

Official references: [Developer Mode and MCP apps](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt) and [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).
