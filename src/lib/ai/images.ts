import sharp from "sharp";
import { createHash } from "node:crypto";
import { invariant, PaymentError } from "@/server/services/payment-rules";
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export async function normalizeEvidence(data: Buffer, mime: string) {
  invariant(
    data.length > 0 && data.length <= MAX_UPLOAD_BYTES,
    "INVALID_IMAGE",
    "Image must be at most 5 MiB",
    413,
  );
  const types: Record<string, string> = {
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  try {
    const pipeline = sharp(data, {
      limitInputPixels: 20000000,
      failOn: "warning",
      animated: true,
    }).timeout({ seconds: 5 });
    const meta = await pipeline.metadata();
    invariant(
      meta.format &&
        types[meta.format] === mime &&
        (meta.pages ?? 1) === 1 &&
        meta.width! >= 64 &&
        meta.height! >= 64 &&
        meta.width! <= 8192 &&
        meta.height! <= 8192,
      "INVALID_IMAGE",
      "Use a static JPEG, PNG or WebP product photo, 64–8192 pixels per side",
      400,
    );
    const image = await pipeline
      .rotate()
      .resize({
        width: 4096,
        height: 4096,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
      .toBuffer();
    invariant(
      image.length <= MAX_UPLOAD_BYTES,
      "INVALID_IMAGE",
      "Normalized image is too large",
      413,
    );
    const inferenceImage = await sharp(image)
      .resize({
        width: 1280,
        height: 1280,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
      .toBuffer();
    const clean = await sharp(image).metadata();
    return {
      image,
      inferenceImage,
      contentHash: createHash("sha256").update(image).digest("hex"),
      width: clean.width!,
      height: clean.height!,
      bytes: image.length,
    };
  } catch {
    throw new PaymentError(
      "INVALID_IMAGE",
      "Unsupported, animated, corrupt or oversized image. Use a clear static JPEG, PNG or WebP.",
      400,
    );
  }
}
