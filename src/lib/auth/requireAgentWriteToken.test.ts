import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { requireAgentWriteToken } from "./requireAgentWriteToken";

function request(token?: string) {
  return new NextRequest("http://localhost/api/internal/agent-actions", {
    headers: token ? { "x-agent-write-token": token } : undefined,
  });
}

afterEach(() => {
  delete process.env.OPENCLAW_WRITE_TOKEN;
  delete process.env.INTERNAL_SERVICE_TOKEN;
});

describe("requireAgentWriteToken", () => {
  it("accepts only the configured write token", () => {
    process.env.OPENCLAW_WRITE_TOKEN = "write-token-that-is-long-and-random";
    process.env.INTERNAL_SERVICE_TOKEN = "different-read-token-that-is-random";

    expect(requireAgentWriteToken(request("write-token-that-is-long-and-random"))).toBeNull();
    expect(requireAgentWriteToken(request("wrong-token"))?.status).toBe(401);
    expect(requireAgentWriteToken(request())?.status).toBe(401);
  });

  it("fails closed when the write token is missing", () => {
    expect(requireAgentWriteToken(request("anything"))?.status).toBe(503);
  });

  it("rejects configuration that reuses the read credential", () => {
    process.env.OPENCLAW_WRITE_TOKEN = "same-token-that-must-not-be-reused";
    process.env.INTERNAL_SERVICE_TOKEN = "same-token-that-must-not-be-reused";
    expect(requireAgentWriteToken(request("same-token-that-must-not-be-reused"))?.status).toBe(503);
  });
});
