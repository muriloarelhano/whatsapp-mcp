import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const envPath = join(root, ".env");

type RunOptions = { env?: NodeJS.ProcessEnv };

async function run(command: string[], options: RunOptions = {}): Promise<void> {
  const process = Bun.spawn(command, {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
    ...options,
  });
  if ((await process.exited) !== 0) throw new Error(`Command failed: ${command.join(" ")}`);
}

async function loadEnvironment(): Promise<Record<string, string>> {
  if (!existsSync(envPath)) throw new Error("Missing .env. Run 'bun run setup' first.");
  const content = await Bun.file(envPath).text();
  return Object.fromEntries(
    content.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^\s*([^#=\s]+)=(.*)$/);
      return match ? [[match[1], match[2].trim()]] : [];
    }),
  );
}

function printSecrets(): void {
  console.log(`MCP_AUTH_TOKEN=${randomBytes(32).toString("base64url")}`);
  console.log(`WA_AUTH_KEY=${randomBytes(32).toString("base64")}`);
}

async function setup(): Promise<void> {
  if (existsSync(envPath)) {
    console.log(".env already exists; it was not changed.");
    return;
  }
  await copyFile(join(root, ".env.example"), envPath);
  await writeFile(
    envPath,
    [
      `MCP_AUTH_TOKEN=${randomBytes(32).toString("base64url")}`,
      `WA_AUTH_KEY=${randomBytes(32).toString("base64")}`,
      "HOST_PORT=8765",
      "LOG_LEVEL=info",
      "",
    ].join("\n"),
  );
  console.log("Created .env with unique local secrets.");
}

async function openPairingQr(): Promise<void> {
  const env = await loadEnvironment();
  const port = env.HOST_PORT || "8765";
  const response = await fetch(`http://127.0.0.1:${port}/pair.png`, {
    headers: { authorization: `Bearer ${env.MCP_AUTH_TOKEN}` },
  });
  if (!response.ok)
    throw new Error(`Could not retrieve the QR (${response.status}). Is Docker running?`);

  const file = join(Bun.env.TEMP || Bun.env.TMPDIR || "/tmp", "whatsapp-mcp-pairing-qr.png");
  await Bun.write(file, response);
  const opener =
    process.platform === "win32"
      ? ["cmd", "/c", "start", "", file]
      : process.platform === "darwin"
        ? ["open", file]
        : ["xdg-open", file];
  await run(opener);
  console.log(`Opened pairing QR: ${file}`);
}

function tunnelClient(): string {
  const candidates = [
    Bun.env.TUNNEL_CLIENT_PATH,
    Bun.which("tunnel-client"),
    Bun.which("client"),
    process.platform === "win32" && Bun.env.USERPROFILE
      ? join(Bun.env.USERPROFILE, "go", "bin", "client.exe")
      : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));
  const client = candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
  if (!client)
    throw new Error(
      "OpenAI tunnel-client not found. Install it with Go; see docs/chatgpt-tunnel.md.",
    );
  return client;
}

async function tunnel(mode: "doctor" | "start"): Promise<void> {
  const env = await loadEnvironment();
  for (const name of ["MCP_AUTH_TOKEN", "CONTROL_PLANE_API_KEY", "OPENAI_TUNNEL_ID"]) {
    if (!env[name]) throw new Error(`Missing ${name} in .env.`);
  }

  const profile = "whatsapp-mcp";
  const profileDir = join(root, "data", "tunnel-client");
  const port = env.HOST_PORT || "8765";
  const healthPort = mode === "doctor" ? "8082" : "8081";
  await mkdir(profileDir, { recursive: true });
  const client = tunnelClient();
  const childEnv = { ...process.env, ...env, MCP_BEARER_HEADER: `Bearer ${env.MCP_AUTH_TOKEN}` };

  await run(
    [
      client,
      "init",
      "--force",
      "--sample",
      "sample_mcp_remote_no_auth",
      "--profile",
      profile,
      "--profile-dir",
      profileDir,
      "--tunnel-id",
      env.OPENAI_TUNNEL_ID,
      "--mcp-server-url",
      `http://127.0.0.1:${port}/mcp`,
      "--health-listen-addr",
      `127.0.0.1:${healthPort}`,
    ],
    { env: childEnv },
  );

  const shared = [
    "--profile",
    profile,
    "--profile-dir",
    profileDir,
    "--mcp.extra-headers",
    "Authorization: env:MCP_BEARER_HEADER",
    "--mcp.discovery-extra-headers",
    "Authorization: env:MCP_BEARER_HEADER",
  ];
  await run([client, mode, ...shared, ...(mode === "doctor" ? ["--explain"] : [])], {
    env: childEnv,
  });
}

async function migrateData(): Promise<void> {
  const volume = Bun.argv[3] || "whatsapp-mcp_whatsapp_mcp_data";
  const dataDir = join(root, "data");
  if (existsSync(dataDir) && (await readdir(dataDir)).length) {
    throw new Error("data/ already contains files. Review it before migrating.");
  }
  await mkdir(dataDir, { recursive: true });
  await run(["docker", "volume", "inspect", volume]);
  await run([
    "docker",
    "run",
    "--rm",
    "-v",
    `${volume}:/source:ro`,
    "-v",
    `${dataDir}:/target`,
    "alpine:3.22",
    "sh",
    "-c",
    "cp -a /source/. /target/",
  ]);
  console.log("Session and SQLite data copied. The original Docker volume was not changed.");
}

async function verify(): Promise<void> {
  for (const command of [
    ["bun", "run", "fmt:check"],
    ["bun", "run", "lint"],
    ["bun", "run", "check"],
    ["bun", "test"],
  ]) {
    await run(command);
  }
}

const [command, subcommand] = Bun.argv.slice(2);
switch (command) {
  case "setup":
    await setup();
    break;
  case "secrets":
    printSecrets();
    break;
  case "pairing":
    await openPairingQr();
    break;
  case "migrate-data":
    await migrateData();
    break;
  case "tunnel":
    if (subcommand !== "doctor" && subcommand !== "start")
      throw new Error("Use 'tunnel doctor' or 'tunnel start'.");
    await tunnel(subcommand);
    break;
  case "verify":
    await verify();
    break;
  default:
    throw new Error("Use setup, secrets, pairing, migrate-data, tunnel, or verify.");
}
