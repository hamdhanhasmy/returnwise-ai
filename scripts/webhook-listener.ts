import { createServer } from "node:http";

/** Local tunnel boundary: expose only the webhook, never the merchant app. */
export function webhookListener(
  upstream = "http://127.0.0.1:3000",
  onResponse?: (status: number) => void,
) {
  const limit = 262144;
  return createServer(
    { requestTimeout: 30000, headersTimeout: 10000 },
    async (req, res) => {
      const reply = (status: number) => {
        onResponse?.(status);
        res.writeHead(status).end();
      };
      if (req.url !== "/api/paypal/webhook") return void reply(404);
      if (req.method !== "POST") return void reply(405);
      if (Number(req.headers["content-length"] ?? 0) > limit)
        return void reply(413);
      try {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          const bytes = Buffer.from(chunk);
          size += bytes.length;
          if (size > limit) return void reply(413);
          chunks.push(bytes);
        }
        const headers = new Headers();
        for (const name of [
          "content-type",
          "paypal-auth-algo",
          "paypal-cert-url",
          "paypal-transmission-id",
          "paypal-transmission-sig",
          "paypal-transmission-time",
        ]) {
          const value = req.headers[name];
          if (typeof value === "string") headers.set(name, value);
        }
        const response = await fetch(`${upstream}/api/paypal/webhook`, {
          method: "POST",
          headers,
          body: Buffer.concat(chunks),
          redirect: "error",
          signal: AbortSignal.timeout(25000),
        });
        // No payload, cookies, credentials or upstream error details are logged/returned.
        await response.body?.cancel();
        reply(response.status);
      } catch {
        reply(502);
      }
    },
  );
}
