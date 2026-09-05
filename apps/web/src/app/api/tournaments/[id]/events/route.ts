import { ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

const channelFor = (id: string): string => `tournament:${id}`;
const sseFrame = (obj: unknown): string => `data: ${JSON.stringify(obj)}\n\n`;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const url = new URL(req.url);

  // Polling fallback: return the recent confirmed rows as JSON, no stream.
  if (url.searchParams.get("fallback") === "poll") {
    const rows = await prisma.contractEvent.findMany({
      where: { tournamentId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok(rows.reverse().map((ev) => ({ type: ev.type, txHash: ev.txHash, data: ev.payload })));
  }

  // Dedicated connection for pub/sub (a subscribed ioredis client can't run
  // other commands). Redis is ephemeral — we replay confirmed rows from
  // Postgres (the source of truth) before streaming live messages.
  const sub = redis.duplicate();
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const cleanup = (closeStream = true): void => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    void sub.unsubscribe(channelFor(id));
    void sub.quit();
    if (closeStream) {
      try {
        controller?.close();
      } catch {
        /* already closed */
      }
    }
  };

  const enqueue = (frame: string): void => {
    if (closed) return;
    try {
      controller?.enqueue(encoder.encode(frame));
    } catch {
      cleanup();
    }
  };

  req.signal.addEventListener("abort", () => cleanup(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(nextController) {
      controller = nextController;
      if (closed) return;
      try {
        const recent = await prisma.contractEvent.findMany({
          where: { tournamentId: id },
          orderBy: { createdAt: "asc" },
          take: 50,
        });
        for (const ev of recent) {
          enqueue(sseFrame({ type: ev.type, txHash: ev.txHash, data: ev.payload }));
        }
        enqueue(": connected\n\n");

        sub.on("message", (_channel: string, message: string) => {
          try {
            enqueue(sseFrame(JSON.parse(message)));
          } catch {
            /* drop malformed */
          }
        });
        await sub.subscribe(channelFor(id));

        heartbeat = setInterval(() => enqueue(": ping\n\n"), 25_000);
      } catch (error) {
        cleanup(false);
        throw error;
      }
    },
    cancel: cleanup,
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
