
-- Add flashcards + mastery to lessons
ALTER TABLE public.english_lessons
  ADD COLUMN IF NOT EXISTS flashcards jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS mastery_threshold numeric NOT NULL DEFAULT 0.9,
  ADD COLUMN IF NOT EXISTS warmup_pt text;

-- Add mastery tracking to progress
ALTER TABLE public.english_progress
  ADD COLUMN IF NOT EXISTS best_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mastered_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_step integer NOT NULL DEFAULT 0;

-- Flashcard review tracking (per user, per card)
CREATE TABLE IF NOT EXISTS public.english_flashcard_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id uuid NOT NULL REFERENCES public.english_lessons(id) ON DELETE CASCADE,
  card_index integer NOT NULL,
  correct_streak integer NOT NULL DEFAULT 0,
  total_seen integer NOT NULL DEFAULT 0,
  total_correct integer NOT NULL DEFAULT 0,
  mastered boolean NOT NULL DEFAULT false,
  last_review_at timestamptz NOT NULL DEFAULT now(),
  next_due_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id, card_index)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.english_flashcard_reviews TO authenticated;
GRANT ALL ON public.english_flashcard_reviews TO service_role;

ALTER TABLE public.english_flashcard_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own flashcard reviews"
  ON public.english_flashcard_reviews
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_english_flashcard_reviews_updated_at
  BEFORE UPDATE ON public.english_flashcard_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_user_lesson
  ON public.english_flashcard_reviews(user_id, lesson_id);
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_due
  ON public.english_flashcard_reviews(user_id, next_due_at) WHERE NOT mastered;
