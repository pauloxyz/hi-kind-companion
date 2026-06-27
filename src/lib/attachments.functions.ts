import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Returns signed URLs for the user's featured media + active intro video.
// Used to append public-shareable links inside cover letters and follow-ups.
export const getAttachmentLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: media }, { data: video }] = await Promise.all([
      supabase.from("work_media").select("id,media_url,media_type,caption").eq("owner_id", userId).eq("is_featured", true).order("uploaded_at", { ascending: false }).limit(6),
      supabase.from("intro_video").select("id,video_url").eq("owner_id", userId).eq("is_active", true).order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const EXPIRES = 60 * 60 * 24 * 30; // 30 days
    const photoLinks: Array<{ id: string; url: string; type: string; caption: string | null }> = [];
    for (const m of media ?? []) {
      const { data: signed } = await supabase.storage.from("work-media").createSignedUrl(m.media_url, EXPIRES);
      if (signed) photoLinks.push({ id: m.id, url: signed.signedUrl, type: m.media_type ?? "photo", caption: m.caption });
    }
    let videoLink: { id: string; url: string } | null = null;
    if (video) {
      const { data: signed } = await supabase.storage.from("intro-videos").createSignedUrl(video.video_url, EXPIRES);
      if (signed) videoLink = { id: video.id, url: signed.signedUrl };
    }
    return { photos: photoLinks, video: videoLink };
  });

export function buildAttachmentFooter(att: { photos: Array<{ url: string; caption: string | null }>; video: { url: string } | null }): string {
  const lines: string[] = [];
  if (att.video) lines.push(`Intro video (60s, in English): ${att.video.url}`);
  if (att.photos.length) {
    lines.push("Work photos / videos:");
    for (const p of att.photos) lines.push(`- ${p.caption ?? "Work sample"}: ${p.url}`);
  }
  if (!lines.length) return "";
  return "\n\n---\nReferences:\n" + lines.join("\n");
}
