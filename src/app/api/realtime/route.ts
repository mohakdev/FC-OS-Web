import { getAccessContext } from "@/lib/auth/context";
import { subscribe } from "@/lib/realtime/server";

// Long-lived SSE connection → needs the Node runtime (not Edge) and must never
// be statically cached/rendered.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events stream for realtime signals.
 *
 * This route is OUTSIDE the proxy matcher (`["/dashboard/:path*"]`), so it is
 * the only auth gate for realtime — we reject before writing the first byte,
 * since an SSE response can't change status/headers once streaming has begun.
 */
export async function GET(request: Request): Promise<Response> {
  const ctx = await getAccessContext();
  if (!ctx) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller already closed (client gone) — ignore.
        }
      };

      const unsubscribe = await subscribe((evt) => {
        send(`data: ${JSON.stringify(evt)}\n\n`);
      });

      // Comment heartbeat keeps the tunnel connection alive and flushes past
      // any intermediary buffering.
      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed — ignore.
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
