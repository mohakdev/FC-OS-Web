// Minimal edge function: liveness probe for the Supabase edge runtime.
//
// It exists for two reasons beyond being useful:
//   * `[edge_runtime] policy = "per_worker"` watches supabase/functions for hot reload —
//     with no functions at all the container has nothing to mount or serve.
//   * fcos-supabase-guard.sh probes this endpoint to decide whether the runtime is
//     actually alive, not merely "running" according to Docker.
//
// Reachable on the box at http://127.0.0.1:54321/functions/v1/health (loopback + tailnet
// only — fcos-firewall.sh drops 54320:54330 on wlan0/eno1). Not exposed on fc-os.tech.
Deno.serve(() =>
  new Response(
    JSON.stringify({ ok: true, ts: new Date().toISOString() }),
    { headers: { "content-type": "application/json" } },
  )
);
