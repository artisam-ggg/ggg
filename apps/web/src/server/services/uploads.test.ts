import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

vi.mock("@/lib/s3", () => ({
  s3: { send: vi.fn(async () => ({})) },
  BUCKET: "ggg-uploads",
}));

import { s3 } from "@/lib/s3";
import { uploadCoverImage, MAX_COVER_IMAGE_BYTES } from "./uploads";

const sendMock = s3.send as ReturnType<typeof vi.fn>;

async function image(format: "png" | "jpeg" | "webp"): Promise<Blob> {
  const bytes = await sharp({
    create: { width: 1, height: 1, channels: 3, background: "black" },
  })
    .toFormat(format)
    .toBuffer();
  return new Blob([new Uint8Array(bytes)], {
    type: format === "jpeg" ? "image/jpeg" : `image/${format}`,
  });
}

describe("uploadCoverImage", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["png", "jpeg", "webp"] as const)("stores a valid %s image", async (format) => {
    const result = await uploadCoverImage(await image(format));

    expect(result.key).toMatch(
      new RegExp(`^covers/[0-9a-f-]{36}\\.${format === "jpeg" ? "jpg" : format}$`),
    );
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it("rejects a PDF before it reaches storage", async () => {
    await expect(
      uploadCoverImage(new Blob(["%PDF-1.7"], { type: "application/pdf" })),
    ).rejects.toThrow("Invalid file type");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects an arbitrary document before it reaches storage", async () => {
    await expect(
      uploadCoverImage(new Blob(["not an image"], { type: "text/plain" })),
    ).rejects.toThrow("Invalid file type");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects a renamed PDF with an image MIME type before it reaches storage", async () => {
    await expect(uploadCoverImage(new Blob(["%PDF-1.7"], { type: "image/png" }))).rejects.toThrow(
      "Invalid image file",
    );
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects an image MIME type that does not match its signature", async () => {
    await expect(
      uploadCoverImage(
        new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/jpeg" }),
      ),
    ).rejects.toThrow("Invalid image file");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects a truncated JPEG before it reaches storage", async () => {
    await expect(
      uploadCoverImage(
        new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }),
      ),
    ).rejects.toThrow("Invalid image file");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects oversized images before it reaches storage", async () => {
    const bytes = new Uint8Array(MAX_COVER_IMAGE_BYTES + 1);
    await expect(uploadCoverImage(new Blob([bytes], { type: "image/png" }))).rejects.toThrow(
      "no larger than 5 MB",
    );
    expect(sendMock).not.toHaveBeenCalled();
  });
});
