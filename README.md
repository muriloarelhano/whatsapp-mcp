# WhatsApp MCP Local

Private, local and read-only access to a personal WhatsApp account through MCP. It stores synchronized text messages in SQLite and is designed for analysis in Codex or ChatGPT.

It can list chats, retrieve recent messages (100 by default), search messages, report connection status, and display a pairing QR. It cannot send, delete, react to, mark messages as read, download media, or manage groups.

## Quick start

Requirements: Docker Desktop and Bun 1.4 or newer.

```sh
bun run setup
docker compose up -d --build
docker compose logs -f whatsapp-mcp
```

Open WhatsApp on your phone: **Settings → Linked devices → Link a device**. Scan the QR from the terminal, `bun run pairing:open`, or the local [setup page](http://127.0.0.1:8765/setup). The QR expires quickly.

Use `docker compose down` to stop the service. Your session and history remain in `data/`, which is deliberately ignored by Git.

## Documentation

- [Architecture](docs/architecture.md)
- [Security model](docs/security.md)
- [Codex integration](docs/codex.md)
- [ChatGPT Secure MCP Tunnel](docs/chatgpt-tunnel.md)

## Maintenance

```sh
bun run verify
docker compose up -d --build
```

Before dependency upgrades, read the relevant release notes. This project pins direct dependencies so upgrades are explicit and reviewable.
