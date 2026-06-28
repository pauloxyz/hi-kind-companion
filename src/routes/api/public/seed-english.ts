// TEMPORARY seed endpoint — DELETE after use.
import { createFileRoute } from "@tanstack/react-router";

const SEED_TOKEN = "english-deep-seed-2026-once";

export const Route = createFileRoute("/api/public/seed-english")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-seed-token");
        if (token !== SEED_TOKEN) return new Response("nope", { status: 401 });
        const body = (await request.json()) as {
          lessons: Array<{
            _lesson_id: string;
            warmup_pt: string;
            phrases: unknown;
            dialogue: unknown;
            flashcards: unknown;
            quiz: unknown;
            grammar_tip: string;
            pronunciation_tip: string;
            common_mistakes: unknown;
            cultural_note: string;
          }>;
        };
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        for (const l of body.lessons) {
          const { error } = await supabaseAdmin
            .from("english_lessons")
            .update({
              warmup_pt: l.warmup_pt,
              phrases: l.phrases,
              dialogue: l.dialogue,
              flashcards: l.flashcards,
              quiz: l.quiz,
              grammar_tip: l.grammar_tip,
              pronunciation_tip: l.pronunciation_tip,
              common_mistakes: l.common_mistakes,
              cultural_note: l.cultural_note,
              estimated_minutes: 22,
            })
            .eq("id", l._lesson_id);
          results.push({ id: l._lesson_id, ok: !error, error: error?.message });
        }
        return Response.json({ count: results.length, results });
      },
    },
  },
});
