import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { webhookListener } from "../../scripts/webhook-listener";

let upstream: Server, relay: Server, url: string;
let calls = 0;
let received = { body: "", signature: "", cookie: "" };
async function listen(server: Server) {
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  return `http://127.0.0.1:${address.port}`;
}
beforeAll(async () => {
  upstream = createServer(async (req, res) => {
    calls++;
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    received = {
      body: Buffer.concat(chunks).toString(),
      signature: String(req.headers["paypal-transmission-sig"] ?? ""),
      cookie: String(req.headers.cookie ?? ""),
    };
    res.writeHead(401).end("private upstream details");
  });
  relay = webhookListener(await listen(upstream));
  url = await listen(relay);
});
afterAll(async () => {
  for (const server of [relay, upstream]) {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});
it("forwards exact webhook bytes/signature and preserves rejection without exposing cookies or error details", async () => {
  const body = '{ "id": "synthetic-test", "value": 1 }';
  const response = await fetch(`${url}/api/paypal/webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "paypal-transmission-sig": "test-signature",
      cookie: "private-session",
    },
    body,
  });
  expect(response.status).toBe(401);
  expect(await response.text()).toBe("");
  expect(received).toEqual({ body, signature: "test-signature", cookie: "" });
});
it("does not forward merchant routes, alternate URLs, wrong methods or oversized bodies", async () => {
  const before = calls;
  for (const path of ["/", "/transactions", "/api/paypal/webhook?extra=1"])
    expect((await fetch(url + path)).status).toBe(404);
  expect((await fetch(`${url}/api/paypal/webhook`)).status).toBe(405);
  expect(
    (
      await fetch(`${url}/api/paypal/webhook`, {
        method: "POST",
        body: "x".repeat(262145),
      })
    ).status,
  ).toBe(413);
  expect(calls).toBe(before);
});
