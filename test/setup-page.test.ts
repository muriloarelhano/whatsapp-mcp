import { expect, test } from "bun:test";
import { setupPageResponse } from "../src/http/setup-page.js";

test("serves a non-cached local pairing page without embedding a token", async () => {
  const response = setupPageResponse();
  const page = await response.text();

  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-security-policy")).toContain("connect-src 'self'");
  expect(page).toContain('fetch("/pair"');
  expect(page).not.toContain("MCP_AUTH_TOKEN=");
});
