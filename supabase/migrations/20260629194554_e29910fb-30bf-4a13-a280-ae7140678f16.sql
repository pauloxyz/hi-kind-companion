
ALTER TABLE public.work_media
  ADD COLUMN IF NOT EXISTS is_resume_photo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resume_photo_order SMALLINT;

CREATE INDEX IF NOT EXISTS idx_work_media_resume_photo
  ON public.work_media(owner_id, resume_photo_order)
  WHERE is_resume_photo = true;

ALTER TABLE public.my_profile
  ADD COLUMN IF NOT EXISTS youtube_video_url TEXT,
  ADD COLUMN IF NOT EXISTS video_script_pt TEXT,
  ADD COLUMN IF NOT EXISTS video_script_en TEXT,
  ADD COLUMN IF NOT EXISTS video_script_generated_at TIMESTAMPTZ;
