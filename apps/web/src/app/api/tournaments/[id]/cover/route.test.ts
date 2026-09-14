import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueMock, sendMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { tournament: { findUnique: findUniqueMock } },
}));
vi.mock("@/lib/s3", () => ({ s3: { send: sendMock }, BUCKET: "covers-test" }));
vi.mock("@/server/services/uploads", () => ({ MAX_COVER_IMAGE_BYTES: 5 * 1024 * 1024 }));

import { GET } from "./route";

const id = "t_1";
const uuid = "123e4567-e89b-12d3-a456-426614174000";
const ctx = { params: Promise.resolve({ id }) };

describe("GET /api/tournaments/[id]/cover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockResolvedValue({
      Body: { transformToByteArray: async () => Uint8Array.from([1, 2, 3]) },
      ContentLength: 3,
    });
  });

  it.each([
    ["png", "image/png"],
    ["jpg", "image/jpeg"],
    ["webp", "image/webp"],
  ])("serves a tournament's stored %s cover with the correct type", async (ext, type) => {
    const key = `covers/${uuid}.${ext}`;
    findUniqueMock.mockResolvedValue({ coverImageKey: key });

    const response = await GET(new Request(`http://localhost/api/tournaments/${id}/cover`), ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(type);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3]);
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id },
      select: { coverImageKey: true },
    });
    expect(sendMock.mock.calls[0]?.[0].input).toEqual({ Bucket: "covers-test", Key: key });
  });

  it("returns 404 without reading storage when the tournament has no cover", async () => {
    findUniqueMock.mockResolvedValue({ coverImageKey: null });
    const response = await GET(new Request(`http://localhost/api/tournaments/${id}/cover`), ctx);
    expect(response.status).toBe(404);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid stored key instead of reading an arbitrary object", async () => {
    findUniqueMock.mockResolvedValue({ coverImageKey: "private/another-object" });
    const response = await GET(new Request(`http://localhost/api/tournaments/${id}/cover`), ctx);
    expect(response.status).toBe(404);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the stored image is missing", async () => {
    findUniqueMock.mockResolvedValue({ coverImageKey: `covers/${uuid}.png` });
    sendMock.mockRejectedValue(Object.assign(new Error("missing"), { name: "NoSuchKey" }));
    const response = await GET(new Request(`http://localhost/api/tournaments/${id}/cover`), ctx);
    expect(response.status).toBe(404);
  });

  it("returns 503 when storage is unavailable", async () => {
    findUniqueMock.mockResolvedValue({ coverImageKey: `covers/${uuid}.png` });
    sendMock.mockRejectedValue(new Error("unavailable"));
    const response = await GET(new Request(`http://localhost/api/tournaments/${id}/cover`), ctx);
    expect(response.status).toBe(503);
  });

  it("refuses an oversized stored object", async () => {
    findUniqueMock.mockResolvedValue({ coverImageKey: `covers/${uuid}.png` });
    const readBody = vi.fn();
    sendMock.mockResolvedValue({
      ContentLength: 5 * 1024 * 1024 + 1,
      Body: { transformToByteArray: readBody },
    });
    const response = await GET(new Request(`http://localhost/api/tournaments/${id}/cover`), ctx);
    expect(response.status).toBe(404);
    expect(readBody).not.toHaveBeenCalled();
  });
});
