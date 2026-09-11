import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { s3, BUCKET } from "@/lib/s3";

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const MAX_COVER_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_COVER_IMAGE_PIXELS = 16_000_000;

export class CoverImageValidationError extends Error {
  readonly status = 400;
}

function invalidImage(message: string): CoverImageValidationError {
  return new CoverImageValidationError(message);
}

function hasImageSignature(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === "image/png") {
    return (
      bytes.length >= 45 &&
      bytes
        .slice(0, 8)
        .every((byte, i) => byte === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][i]) &&
      new TextDecoder().decode(bytes.slice(12, 16)) === "IHDR" &&
      new TextDecoder().decode(bytes.slice(-8, -4)) === "IEND"
    );
  }
  if (contentType === "image/jpeg")
    return (
      bytes.length >= 4 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff &&
      bytes.at(-2) === 0xff &&
      bytes.at(-1) === 0xd9
    );
  return (
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true) + 8 === bytes.length &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  );
}

export async function uploadCoverImage(file: Blob): Promise<{ key: string }> {
  const contentType = file.type;
  const ext = EXT[contentType];
  if (!ext) {
    throw invalidImage("Invalid file type. Upload a PNG, JPEG, or WEBP image.");
  }
  if (file.size <= 0 || file.size > MAX_COVER_IMAGE_BYTES) {
    throw invalidImage("Image must be no larger than 5 MB.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasImageSignature(contentType, bytes)) throw invalidImage("Invalid image file.");
  try {
    const image = sharp(bytes, { limitInputPixels: MAX_COVER_IMAGE_PIXELS });
    const format = await image.metadata().then((metadata) => metadata.format);
    if (format !== contentType.slice(6)) throw invalidImage("Invalid image file.");
    const safe = await image.toBuffer();
    const key = `covers/${randomUUID()}.${ext}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        ContentType: contentType,
        ContentLength: safe.length,
        Body: safe,
      }),
    );
    return { key };
  } catch (error) {
    if (error instanceof CoverImageValidationError) throw error;
    throw invalidImage("Invalid image file.");
  }
}
