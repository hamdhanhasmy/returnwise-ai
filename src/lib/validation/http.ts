import { parseEnvironment } from "./env";

export function isTrustedOrigin(request: Request, baseUrl: string) {
  return request.headers.get("origin") === new URL(baseUrl).origin;
}

export function configuredOrigin() {
  return new URL(parseEnvironment(process.env).APP_BASE_URL).origin;
}

export async function readSmallForm(
  request: Request,
): Promise<URLSearchParams> {
  if (
    !request.headers
      .get("content-type")
      ?.startsWith("application/x-www-form-urlencoded")
  )
    throw new Error("Unsupported body");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new Error("Body too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}
