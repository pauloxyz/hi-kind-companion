import { createFileRoute } from "@tanstack/react-router";
import { verifyCronSecret, unauthorizedCronResponse, logCronCall } from "@/lib/cron-auth.server";
import { checkRateLimit } from "@/lib/rate-limit.server";

export const Route = createFileRoute("/api/public/hooks/import-dol-feed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = verifyCronSecret(request);
        await logCronCall({ hook: "import-dol-feed", request, result: auth });
        if (!auth.ok) return unauthorizedCronResponse(auth.reason);
        if (!(await checkRateLimit("cron:import-dol-feed", 5, 60))) {
          return new Response(JSON.stringify({ error: "rate_limited" }), {
            status: 429,
            headers: { "content-type": "application/json" },
          });
        }

        let daysBack = 1;
        try {
          const body = (await request.json()) as { daysBack?: number };
          if (typeof body?.daysBack === "number") daysBack = body.daysBack;
        } catch {
          // empty body is fine
        }
        const { importDolFeed } = await import("@/lib/dol-import.server");
        try {
          const result = await importDolFeed({ daysBack });
          return Response.json({ ok: true, ...result });
        } catch (e) {
          return Response.json(
            { ok: false, error: e instanceof Error ? e.message : String(e) },
            { status: 500 },
          );
        }
      },
    },
  },
});
