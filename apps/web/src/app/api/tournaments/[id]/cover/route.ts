import { GetObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { s3, BUCKET } from "@/lib/s3";
import { coverImageKeySchema } from "@/lib/validation/tournament";
import { MAX_COVER_IMAGE_BYTES } from "@/server/services/uploads";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const tournament = await prisma.tournament.findUnique({
    where: { id },
    select: { coverImageKey: true },
  });
  const key = tournament?.coverImageKey;
  if (!key || !coverImageKeySchema.safeParse(key).success) {
    return new Response(null, { status: 404 });
  }

  try {
    const object = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    if (
      !object.Body ||
      object.ContentLength == null ||
      object.ContentLength > MAX_COVER_IMAGE_BYTES
    ) {
      return new Response(null, { status: 404 });
    }
    const bytes = await object.Body.transformToByteArray();
    if (bytes.length > MAX_COVER_IMAGE_BYTES) return new Response(null, { status: 404 });
    const contentType = key.endsWith(".png")
      ? "image/png"
      : key.endsWith(".jpg")
        ? "image/jpeg"
        : "image/webp";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return new Response(null, {
      status: error instanceof Error && error.name === "NoSuchKey" ? 404 : 503,
    });
  }
}
