import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
} from "@whiskeysockets/baileys";

const FORMAT_VERSION = "v1";

function fileName(name: string): string {
  return name.replaceAll("/", "__").replaceAll(":", "-");
}

function encrypt(value: unknown, key: Buffer): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  const plaintext = Buffer.from(JSON.stringify(value, BufferJSON.replacer));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    FORMAT_VERSION,
    nonce.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

function decrypt(payload: string, key: Buffer): unknown {
  const [version, nonce, tag, ciphertext, ...extra] = payload.split(".");
  if (version !== FORMAT_VERSION || !nonce || !tag || !ciphertext || extra.length)
    throw new Error("Invalid encrypted WhatsApp auth state.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8"), BufferJSON.reviver);
}

/**
 * Baileys-compatible auth state with AES-256-GCM encrypted credentials at rest.
 * The key must remain stable; rotating it requires pairing the companion again.
 */
export async function useEncryptedAuthState(
  folder: string,
  key: Buffer,
): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  await mkdir(folder, { recursive: true });
  const locks = new Map<string, Promise<void>>();

  const serialized = async <T>(name: string, task: () => Promise<T>): Promise<T> => {
    const previous = locks.get(name) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    locks.set(name, queued);
    await previous;
    try {
      return await task();
    } finally {
      release();
      if (locks.get(name) === queued) locks.delete(name);
    }
  };

  const readData = async (name: string): Promise<unknown | null> =>
    serialized(name, async () => {
      try {
        return decrypt(await readFile(join(folder, fileName(name)), "utf8"), key);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    });

  const writeData = async (value: unknown, name: string): Promise<void> =>
    serialized(name, async () => {
      const target = join(folder, fileName(name));
      const temporary = `${target}.${randomBytes(8).toString("hex")}.tmp`;
      await writeFile(temporary, encrypt(value, key), { mode: 0o600 });
      await rename(temporary, target);
    });

  const removeData = async (name: string): Promise<void> =>
    serialized(name, async () => {
      await rm(join(folder, fileName(name)), { force: true });
    });

  const creds = (await readData("creds.json")) ?? initAuthCreds();
  const state: AuthenticationState = {
    creds: creds as AuthenticationState["creds"],
    keys: {
      get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const entries = await Promise.all(
          ids.map(async (id) => {
            let value = await readData(`${type}-${id}.json`);
            if (type === "app-state-sync-key" && value)
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            return [id, value] as const;
          }),
        );
        return Object.fromEntries(
          entries.filter(
            (entry): entry is readonly [string, SignalDataTypeMap[T]] => entry[1] !== null,
          ),
        );
      },
      set: async (data: SignalDataSet) => {
        await Promise.all(
          Object.entries(data).flatMap(([type, values]) =>
            Object.entries(values ?? {}).map(([id, value]) =>
              value ? writeData(value, `${type}-${id}.json`) : removeData(`${type}-${id}.json`),
            ),
          ),
        );
      },
      clear: async () => {
        throw new Error("Clearing WhatsApp authentication is intentionally disabled.");
      },
    },
  };

  return { state, saveCreds: () => writeData(creds, "creds.json") };
}
