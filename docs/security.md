# Security model

This project is intentionally local and read-only.

- The MCP HTTP port is exposed only on loopback.
- Every route except `/health` requires `Authorization: Bearer <MCP_AUTH_TOKEN>`.
- WhatsApp session credentials are encrypted with AES-256-GCM using `WA_AUTH_KEY` before being written under `data/`.
- `data/`, `.env`, tunnel profiles, SQLite files, private keys, and logs are ignored by Git.
- Docker runs with a read-only container filesystem; only `/data` is writable.
- The OpenAI tunnel is outbound. It does not open a public inbound port, and it injects the local MCP bearer on the host rather than sending that bearer to ChatGPT.

## What to protect

Never share the pairing QR, `.env`, or `data/`. Rotating either application secret requires pairing WhatsApp again. If you suspect exposure, stop the container, unlink the companion device in WhatsApp, remove `data/`, create fresh secrets with `bun run setup`, and pair again.

## WhatsApp limitation

Personal WhatsApp has no official API for reading private conversation history. The collector uses Baileys as an unofficial companion connection. WhatsApp can change the protocol or unlink the device at any time; history availability is controlled by WhatsApp.
