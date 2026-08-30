# Architecture

```text
WhatsApp companion device
          │
          ▼
Baileys collector ──► SQLite + encrypted session state (`data/`)
          │
          ▼
Read-only MCP server ──► Codex plugin or OpenAI Secure MCP Tunnel
```

The collector is the only component that communicates with WhatsApp. The MCP layer reads the local database and has no mutation tools.

Docker Compose binds the MCP HTTP server to `127.0.0.1` only and mounts `data/` into the container. Running the app with Bun or Docker therefore uses the same local session and message store.

## MCP tools

| Tool                  | Purpose                                         |
| --------------------- | ----------------------------------------------- |
| `whatsapp_status`     | Connection state and local database counts.     |
| `whatsapp_pairing_qr` | Temporary image for linking a companion device. |
| `list_chats`          | Finds conversations by name or identifier.      |
| `get_messages`        | Returns recent messages for one conversation.   |
| `search_messages`     | Full-text search over synchronized messages.    |

`get_messages` returns the 100 newest messages unless the caller requests another amount, up to 250.
