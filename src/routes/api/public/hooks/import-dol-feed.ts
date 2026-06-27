import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/import-dol-feed")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
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
