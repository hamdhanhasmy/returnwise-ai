import "server-only";
import { invariant } from "./services/payment-rules";
import { MAX_UPLOAD_BYTES } from "@/lib/ai/images";
export async function readImage(request: Request) {
  invariant(
    Number(request.headers.get("content-length") ?? 0) <= MAX_UPLOAD_BYTES,
    "INVALID_IMAGE",
    "Image is too large",
    413,
  );
  const reader = request.body?.getReader();
  invariant(reader, "INVALID_IMAGE", "Image required", 400);
  const chunks: Uint8Array[] = [];
  let count = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      count += part.value.byteLength;
      if (count > MAX_UPLOAD_BYTES) {
        await reader.cancel();
        invariant(false, "INVALID_IMAGE", "Image is too large", 413);
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}
export function imageResponse(bytes: Buffer) {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": "inline; filename=product-evidence.jpg",
    },
  });
}
