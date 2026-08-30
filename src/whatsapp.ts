import { join } from "node:path";
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WAMessage,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import { useEncryptedAuthState } from "./auth.js";
import type { Config } from "./config.js";
import { MessageDatabase } from "./database.js";

type ConnectionState = "starting" | "pairing" | "connected" | "disconnected" | "logged_out";

function createSilentLogger() {
  return {
    level: "silent",
    child: () => createSilentLogger(),
    trace: () => undefined,
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

function messageText(message: WAMessage["message"]): { text: string; type: string } | null {
  if (!message) return null;
  const m: any = message;
  const candidates: Array<[string, unknown]> = [
    ["text", m.conversation],
    ["text", m.extendedTextMessage?.text],
    ["image", m.imageMessage?.caption],
    ["video", m.videoMessage?.caption],
    ["document", m.documentMessage?.caption],
    ["audio", m.audioMessage ? "[áudio]" : undefined],
    ["sticker", m.stickerMessage ? "[figurinha]" : undefined],
    ["contact", m.contactMessage?.displayName],
    ["location", m.locationMessage ? "[localização]" : undefined],
    ["reaction", m.reactionMessage?.text ? `Reação: ${m.reactionMessage.text}` : undefined],
    ["list-response", m.listResponseMessage?.title],
    ["button-response", m.buttonsResponseMessage?.selectedDisplayText],
  ];
  const found = candidates.find(([, text]) => typeof text === "string" && text.trim());
  return found ? { type: found[0], text: String(found[1]).trim() } : null;
}

function disconnectCode(error: unknown): number | undefined {
  return (error as any)?.output?.statusCode ?? (error as any)?.data?.statusCode;
}

/** Owns the single WhatsApp companion socket. It never sends or modifies messages. */
export class WhatsAppCollector {
  private socket: ReturnType<typeof makeWASocket> | undefined;
  private state: ConnectionState = "starting";
  private latestQr: string | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private stopping = false;
  private lastError: string | undefined;

  constructor(
    private readonly config: Config,
    private readonly database: MessageDatabase,
  ) {}

  async start(): Promise<void> {
    this.stopping = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.end(undefined);
    this.socket = undefined;
  }

  status(): {
    state: ConnectionState;
    qrAvailable: boolean;
    lastError?: string;
    stats: { chats: number; messages: number };
  } {
    return {
      state: this.state,
      qrAvailable: Boolean(this.latestQr),
      lastError: this.lastError,
      stats: this.database.stats(),
    };
  }

  async qrSvg(): Promise<string | null> {
    return this.latestQr
      ? QRCode.toString(this.latestQr, { type: "svg", margin: 2, errorCorrectionLevel: "M" })
      : null;
  }

  async qrPng(): Promise<Buffer | null> {
    return this.latestQr
      ? QRCode.toBuffer(this.latestQr, {
          type: "png",
          margin: 2,
          errorCorrectionLevel: "M",
          width: 512,
        })
      : null;
  }

  private scheduleReconnect(): void {
    if (this.stopping || this.state === "logged_out" || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, 5_000);
  }

  private async connect(): Promise<void> {
    if (this.stopping) return;
    this.state = "starting";
    try {
      const { state, saveCreds } = await useEncryptedAuthState(
        join(this.config.dataDir, "auth"),
        this.config.authKey,
      );
      const { version } = await fetchLatestBaileysVersion();
      const socket = makeWASocket({
        auth: state,
        version,
        browser: ["WhatsApp MCP", "Chrome", "1.0.0"],
        logger: createSilentLogger(),
        markOnlineOnConnect: false,
        syncFullHistory: true,
        shouldSyncHistoryMessage: () => true,
        emitOwnEvents: true,
      });
      this.socket = socket;

      socket.ev.on("creds.update", saveCreds);
      socket.ev.on("connection.update", (update: any) => {
        if (update.qr) {
          this.latestQr = update.qr;
          this.state = "pairing";
          void QRCode.toString(update.qr, {
            type: "utf8",
            margin: 2,
            errorCorrectionLevel: "M",
          }).then((qr) =>
            console.info(
              [
                "",
                "WhatsApp pairing QR (keep this terminal at least 80 columns wide):",
                "If it does not scan, run: .\\scripts\\open-pairing-qr.ps1",
                "",
                qr,
              ].join("\n"),
            ),
          );
        }
        if (update.connection === "open") {
          this.latestQr = undefined;
          this.lastError = undefined;
          this.state = "connected";
        }
        if (update.connection === "close") {
          const code = disconnectCode(update.lastDisconnect?.error);
          this.socket = undefined;
          this.latestQr = undefined;
          if (code === DisconnectReason.loggedOut) {
            this.state = "logged_out";
            this.lastError =
              "WhatsApp removed this linked device. Delete the auth files in the Docker volume to pair again.";
          } else {
            this.state = "disconnected";
            this.lastError = code
              ? `WhatsApp disconnected (code ${code}). Retrying.`
              : "WhatsApp disconnected. Retrying.";
            this.scheduleReconnect();
          }
        }
      });
      socket.ev.on("messages.upsert", ({ messages }: any) => {
        for (const message of messages as WAMessage[]) this.storeMessage(message);
      });
      socket.ev.on("messaging-history.set", ({ chats, contacts, messages }: any) => {
        this.storeContacts(contacts);
        this.storeChats(chats);
        for (const message of messages as WAMessage[]) this.storeMessage(message);
      });
      socket.ev.on("contacts.upsert", (contacts: any[]) => this.storeContacts(contacts));
      socket.ev.on("chats.upsert", (chats: any[]) => this.storeChats(chats));
      socket.ev.on("groups.upsert", (groups: any[]) => this.storeChats(groups));
      socket.ev.on("groups.update", (groups: any[]) => this.storeChats(groups));
    } catch (error) {
      this.state = "disconnected";
      this.lastError = error instanceof Error ? error.message : String(error);
      this.scheduleReconnect();
    }
  }

  private storeContacts(contacts: any[] | undefined): void {
    for (const contact of contacts ?? []) {
      const id = contact.id ?? contact.jid;
      if (!id) continue;
      const name = contact.name ?? contact.notify ?? contact.verifiedName ?? contact.pushname;
      this.database.upsertChat(id, name, id.endsWith("@g.us") ? "group" : "direct");
    }
  }

  private storeChats(chats: any[] | undefined): void {
    for (const chat of chats ?? []) {
      const id = chat.id ?? chat.jid;
      if (!id) continue;
      const name = chat.name ?? chat.subject ?? chat.notify ?? chat.pushName;
      this.database.upsertChat(id, name, id.endsWith("@g.us") ? "group" : "direct");
    }
  }

  private storeMessage(message: WAMessage): void {
    const remoteJid = message.key.remoteJid;
    const messageId = message.key.id;
    const extracted = messageText(message.message);
    if (!remoteJid || !messageId || !extracted || remoteJid === "status@broadcast") return;
    const timestamp = Number(message.messageTimestamp);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return;
    const senderId = message.key.participant ?? (message.key.fromMe ? "me" : remoteJid);
    this.database.saveMessage({
      id: `${remoteJid}:${messageId}`,
      chatId: remoteJid,
      senderId,
      senderName: message.pushName ?? null,
      fromMe: Boolean(message.key.fromMe),
      timestamp,
      type: extracted.type,
      text: extracted.text.slice(0, 16_000),
    });
  }
}
