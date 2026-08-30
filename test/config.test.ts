import { expect, test } from "bun:test";
import { loadConfig } from "../src/config.js";

const valid = {
  MCP_AUTH_TOKEN: "a".repeat(32),
  WA_AUTH_KEY: Buffer.alloc(32, 7).toString("base64"),
};

test("loads a valid secure configuration", () => {
  expect(loadConfig({ ...valid, PORT: "9876", DATA_DIR: "./tmp-data" }).port).toBe(9876);
});

test("rejects short and invalid secrets", () => {
  expect(() => loadConfig({ ...valid, MCP_AUTH_TOKEN: "short" })).toThrow("at least 32");
  expect(() => loadConfig({ ...valid, WA_AUTH_KEY: "invalid" })).toThrow("32-byte");
});
