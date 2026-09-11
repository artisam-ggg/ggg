import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-guards", () => ({
  requireUser: vi.fn(async () => ({ id: "user_1", username: "alice", role: "ORGANIZER" })),
  AuthError: class AuthError extends Error {
    readonly status = 403;
  },
}));
vi.mock("@/lib/csrf", () => ({
  assertSameOrigin: vi.fn(),
  CsrfError: class CsrfError extends Error {},
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/server/services/uploads", () => ({
  MAX_COVER_IMAGE_BYTES: 5 * 1024 * 1024,
  CoverImageValidationError: class CoverImageValidationError extends Error {
    readonly status = 400;
  },
  uploadCoverImage: vi.fn(async () => ({ key: "covers/abc.png" })),
}));

import { rateLimit } from "@/lib/rate-limit";
import { uploadCoverImage } from "@/server/services/uploads";
import { POST } from "./route";

const rateLimitMock = rateLimit as ReturnType<typeof vi.fn>;
const uploadCoverImageMock = uploadCoverImage as ReturnType<typeof vi.fn>;

function uploadRequest(file?: File) {
  const body = new FormData();
  if (file) body.set("file", file);
  return new Request("http://localhost:3000/api/uploads", {
    method: "POST",
    headers: { origin: "http://localhost:3000" },
    body,
  }) as Parameters<typeof POST>[0];
}

describe("POST /api/uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimitMock.mockResolvedValue({ ok: true });
    uploadCoverImageMock.mockResolvedValue({ key: "covers/abc.png" });
  });

  it("accepts a file and returns the standard success envelope", async () => {
    const res = await POST(uploadRequest(new File(["image"], "cover.png", { type: "image/png" })));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, data: { key: "covers/abc.png" } });
    expect(uploadCoverImageMock).toHaveBeenCalledOnce();
  });

  it("blocks creation of an upload when no file is supplied", async () => {
    const res = await POST(uploadRequest());

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: { message: "An image file is required" },
    });
    expect(uploadCoverImageMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared body before parsing multipart data", async () => {
    const formData = vi.fn();
    const req = {
      headers: new Headers({ "content-length": String(5 * 1024 * 1024 + 64 * 1024 + 1) }),
      formData,
    } as unknown as Parameters<typeof POST>[0];

    const res = await POST(req);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: { message: "Image must be no larger than 5 MB." },
    });
    expect(formData).not.toHaveBeenCalled();
  });

  it("accepts a file at the exact size limit when multipart framing is included", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array(5 * 1024 * 1024)], "cover.png", { type: "image/png" }),
    );
    const base = new Request("http://localhost:3000/api/uploads", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: form,
    });
    const contentLength = (await base.clone().arrayBuffer()).byteLength;
    const req = new Request(base, {
      headers: {
        origin: "http://localhost:3000",
        "content-length": String(contentLength),
        "content-type": base.headers.get("content-type") ?? "",
      },
    }) as Parameters<typeof POST>[0];

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(uploadCoverImageMock).toHaveBeenCalledOnce();
  });

  it("returns the file validation message for a disallowed MIME type", async () => {
    const res = await POST(
      uploadRequest(new File(["not an image"], "cover.txt", { type: "text/plain" })),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: { message: "Invalid file type. Upload a PNG, JPEG, or WEBP image." },
    });
  });

  it("does not process a file after rate limiting", async () => {
    rateLimitMock.mockResolvedValue({ ok: false });
    const res = await POST(uploadRequest(new File(["image"], "cover.png", { type: "image/png" })));

    expect(res.status).toBe(429);
    expect(uploadCoverImageMock).not.toHaveBeenCalled();
  });

  it("does not expose an object storage error", async () => {
    uploadCoverImageMock.mockRejectedValue(new Error("S3 bucket internal detail"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const res = await POST(uploadRequest(new File(["image"], "cover.png", { type: "image/png" })));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      ok: false,
      error: { message: "Cover image upload failed. Try again later." },
    });
    expect(errorSpy).toHaveBeenCalledWith("Cover image upload failed", {
      error: expect.any(Error),
    });
    errorSpy.mockRestore();
  });
});
