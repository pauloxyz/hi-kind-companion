import { createFileRoute } from "@tanstack/react-router";

// Global cron: scans Gmail threads for inbound replies across ALL users and
// marks the corresponding application rows as responded. Gmail is a builder-
// scope connector (a single inbox sends every email), so a single pass covers
// every user. Designed to be invoked by pg_cron every ~15 minutes.
export const Route = createFileRoute("/api/public/hooks/check-replies")({
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

        const lovableKey = process.env.LOVABLE_API_KEY;
        const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
        if (!lovableKey || !gmailKey) {
          return Response.json({ ok: false, error: "gmail-not-connected" }, { status: 500 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Pull every pending application with a gmail thread, capped.
        const { data: apps, error } = await supabaseAdmin
          .from("applications")
          .select("id, owner_id, gmail_thread_id, sent_at")
          .is("responded_at", null)
          .not("gmail_thread_id", "is", null)
          .order("sent_at", { ascending: false })
          .limit(500);

        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        if (!apps?.length) return Response.json({ ok: true, checked: 0, newReplies: 0 });

        // Resolve owner emails once per distinct owner.
        const ownerIds = Array.from(new Set(apps.map((a) => a.owner_id)));
        const ownerEmail = new Map<string, string | null>();
        for (const id of ownerIds) {
          try {
            const { data } = await supabaseAdmin.auth.admin.getUserById(id);
            ownerEmail.set(id, data.user?.email?.toLowerCase() ?? null);
          } catch {
            ownerEmail.set(id, null);
          }
        }

        let newReplies = 0;
        const nowIso = new Date().toISOString();

        for (const app of apps) {
          try {
            const res = await fetch(
              `https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/threads/${app.gmail_thread_id}?format=metadata&metadataHeaders=From&metadataHeaders=Date`,
              { headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": gmailKey } },
            );
            if (!res.ok) continue;
            const thread = (await res.json()) as {
              messages?: Array<{
                id?: string;
                snippet?: string;
                internalDate?: string;
                payload?: { headers?: Array<{ name: string; value: string }> };
              }>;
            };
            const msgs = thread.messages ?? [];
            const me = ownerEmail.get(app.owner_id);
            const inbound = msgs.find((m) => {
              const from = (m.payload?.headers ?? []).find((h) => h.name.toLowerCase() === "from")?.value ?? "";
              // If we don't know the owner's email, treat any 2nd+ message as inbound.
              if (!me) return msgs.indexOf(m) > 0;
              return !from.toLowerCase().includes(me);
            });
            if (inbound) {
              const from =
                (inbound.payload?.headers ?? []).find((h) => h.name.toLowerCase() === "from")?.value ?? null;
              const receivedAt = inbound.internalDate
                ? new Date(Number(inbound.internalDate)).toISOString()
                : nowIso;
              await supabaseAdmin
                .from("applications")
                .update({
                  responded_at: nowIso,
                  status: "responded",
                  last_reply_check_at: nowIso,
                  reply_snippet: inbound.snippet ?? null,
                  reply_from: from,
                  reply_received_at: receivedAt,
                })
                .eq("id", app.id);
              newReplies++;
            } else {
              await supabaseAdmin
                .from("applications")
                .update({ last_reply_check_at: nowIso })
                .eq("id", app.id);
            }
          } catch {
            // skip individual failures so one bad thread doesn't stop the job
          }
        }

        return Response.json({ ok: true, checked: apps.length, newReplies });
      },
    },
  },
});
