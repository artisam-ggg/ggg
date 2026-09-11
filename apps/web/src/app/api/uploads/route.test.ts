import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all external boundaries before importing the route
vi.mock("@/lib/auth-guards", () => ({
  requireUser: vi.fn(async () => ({ id: "user_1", username: "alice", role: "ORGANIZER" })),
  AuthError: class AuthError extends Error {
    readonly status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "AuthError";
      this.status = status;
    }
  },
}));
vi.mock("@/lib/csrf", () => ({
  assertSameOrigin: vi.fn(),
  CsrfError: class CsrfError extends Error {
    constructor() {
      super("Cross-origin request rejected");
      this.name = "CsrfError";
    }
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true, remaining: 19 })),
}));
vi.mock("@/server/services/uploads", () => ({
  createPresignedUpload: vi.fn(async () => ({
    uploadUrl: "https://minio/presigned",
    key: "covers/abc-123.png",
  })),
}));

import { requireUser, AuthError } from "@/lib/auth-guards";
import { assertSameOrigin, CsrfError } from "@/lib/csrf";
import { rateLimit } from "@/lib/rate-limit";
import { createPresignedUpload } from "@/server/services/uploads";
import { POST } from "./route";

const requireUserMock = requireUser as ReturnType<typeof vi.fn>;
const assertSameOriginMock = assertSameOrigin as ReturnType<typeof vi.fn>;
const rateLimitMock = rateLimit as ReturnType<typeof vi.fn>;
const createPresignedUploadMock = createPresignedUpload as ReturnType<typeof vi.fn>;

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/uploads", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      ...headers,
    },
    body: JSON.stringify(body),
  }) as Parameters<typeof POST>[0];
}

describe("POST /api/uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertSameOriginMock.mockReturnValue(undefined);
    requireUserMock.mockResolvedValue({ id: "user_1", username: "alice", role: "ORGANIZER" });
    rateLimitMock.mockResolvedValue({ ok: true, remaining: 19 });
    createPresignedUploadMock.mockResolvedValue({
      uploadUrl: "https://minio/presigned",
      key: "covers/abc-123.png",
    });
  });

  it("returns presigned uploadUrl and key on valid request", async () => {
    const res = await POST(makeReq({ contentType: "image/png", contentLength: 1000 }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.uploadUrl).toBe("https://minio/presigned");
    expect(json.data.key).toBe("covers/abc-123.png");
  });

  it("delegates to createPresignedUpload with validated contentType and contentLength", async () => {
    await POST(makeReq({ contentType: "image/jpeg", contentLength: 2048 }));

    expect(createPresignedUploadMock).toHaveBeenCalledOnce();
    expect(createPresignedUploadMock).toHaveBeenCalledWith("image/jpeg", 2048);
  });

  it("returns 400 for invalid MIME type", async () => {
    const res = await POST(makeReq({ contentType: "application/zip", contentLength: 1000 }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(createPresignedUploadMock).not.toHaveBeenCalled();
  });

  it("returns 400 for missing contentType", async () => {
    const res = await POST(makeReq({ contentLength: 1000 }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });

  it("returns 400 for oversized contentLength (>5MB)", async () => {
    const res = await POST(makeReq({ contentType: "image/png", contentLength: 6 * 1024 * 1024 }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(createPresignedUploadMock).not.toHaveBeenCalled();
  });

  it("returns 400 for zero contentLength", async () => {
    const res = await POST(makeReq({ contentType: "image/png", contentLength: 0 }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost:3000/api/uploads", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: "not json",
    }) as Parameters<typeof POST>[0];

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
  });

  it("returns the standard 401 envelope when the session has ended", async () => {
    requireUserMock.mockRejectedValue(new AuthError("Authentication required", 401));

    const res = await POST(makeReq({ contentType: "image/png", contentLength: 1000 }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    expect(requireUserMock).toHaveBeenCalledWith(undefined, false);
    expect(createPresignedUploadMock).not.toHaveBeenCalled();
  });

  it("returns 403 for wrong-role requests (AuthError)", async () => {
    requireUserMock.mockRejectedValue(new AuthError("Forbidden", 403));

    const res = await POST(makeReq({ contentType: "image/png", contentLength: 1000 }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("FORBIDDEN");
    expect(createPresignedUploadMock).not.toHaveBeenCalled();
  });

  it("returns 403 for cross-origin requests (CSRF)", async () => {
    assertSameOriginMock.mockImplementation(() => {
      throw new CsrfError();
    });

    const res = await POST(
      makeReq(
        { contentType: "image/png", contentLength: 1000 },
        { origin: "https://evil.example.com" },
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe("CSRF_VIOLATION");
    expect(createPresignedUploadMock).not.toHaveBeenCalled();
  });

  it("returns 429 when rate limit is exceeded", async () => {
    rateLimitMock.mockResolvedValue({ ok: false, remaining: 0 });

    const res = await POST(makeReq({ contentType: "image/png", contentLength: 1000 }));
    const json = await res.json();

    expect(res.status).toBe(429);
    expect(json.ok).toBe(false);
    expect(createPresignedUploadMock).not.toHaveBeenCalled();
  });

  it("rate-limits per user (passes upload:<userId> as key)", async () => {
    await POST(makeReq({ contentType: "image/png", contentLength: 1000 }));

    expect(rateLimitMock).toHaveBeenCalledOnce();
    expect(rateLimitMock).toHaveBeenCalledWith(
      "upload:user_1",
      expect.objectContaining({ limit: 20 }),
    );
  });

  it("accepts all three supported MIME types", async () => {
    for (const contentType of ["image/png", "image/jpeg", "image/webp"] as const) {
      vi.clearAllMocks();
      assertSameOriginMock.mockReturnValue(undefined);
      requireUserMock.mockResolvedValue({ id: "user_1", username: "alice", role: "ORGANIZER" });
      rateLimitMock.mockResolvedValue({ ok: true, remaining: 19 });
      createPresignedUploadMock.mockResolvedValue({
        uploadUrl: "https://minio/presigned",
        key: "covers/abc-123.png",
      });

      const res = await POST(makeReq({ contentType, contentLength: 1000 }));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.ok).toBe(true);
    }
  });
});
