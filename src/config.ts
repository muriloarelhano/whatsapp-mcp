import { timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";

export type Config = {
  dataDir: string;
  host: string;
  port: number;
  connectWhatsApp: boolean;
  mcpToken: string;
  authKey: Buffer;
  logLevel: "debug" | "info" | "warn" | "error";
};

function required(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name]?.trim();
  if (!value)
    throw new Error(`${name} is required. Copy .env.example to .env and set a secure value.`);
  return value;
}

function port(value: string | undefined): number {
  const result = Number(value ?? "8765");
  if (!Number.isInteger(result) || result < 1 || result > 65535)
    throw new Error("PORT must be a valid TCP port.");
  return result;
}

export function loadConfig(env = process.env): Config {
  const mcpToken = required("MCP_AUTH_TOKEN", env);
  if (mcpToken.length < 32) throw new Error("MCP_AUTH_TOKEN must be at least 32 characters long.");

  const authKeyText = required("WA_AUTH_KEY", env);
  const authKey = Buffer.from(authKeyText, "base64");
  if (authKey.length !== 32)
    throw new Error("WA_AUTH_KEY must be a base64-encoded 32-byte key. Run `bun run secrets`.");

  const logLevel = env.LOG_LEVEL ?? "info";
  if (!["debug", "info", "warn", "error"].includes(logLevel))
    throw new Error("LOG_LEVEL must be debug, info, warn, or error.");

  return {
    dataDir: resolve(env.DATA_DIR ?? "./data"),
    host: env.HOST ?? "127.0.0.1",
    port: port(env.PORT),
    connectWhatsApp: env.CONNECT_WHATSAPP !== "false",
    mcpToken,
    authKey,
    logLevel: logLevel as Config["logLevel"],
  };
}

export function isAuthorized(request: Request, expectedToken: string): boolean {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
