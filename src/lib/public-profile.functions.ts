import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export type PublicProfilePayload = {
  profile: {
    full_name: string | null;
    country: string | null;
    public_headline: string | null;
    languages: string[] | null;
    has_prior_h2_experience: boolean | null;
    phone: string | null;
  };
  experiences: Array<{ id: string; role: string | null; employer_name: string | null; start_date: string | null; end_date: string | null; description: string | null }>;
  skills: Array<{ id: string; skill: string; level: string | null }>;
  media: Array<{ id: string; type: string; caption: string | null; url: string }>;
  video: { id: string; url: string } | null;
} | null;

export const getPublicProfileBySlug = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data }): Promise<PublicProfilePayload> => {
    const sb = publicClient();
    const { data: profile } = await sb
      .from("my_profile")
      .select("owner_id, full_name, country, public_headline, languages, has_prior_h2_experience, phone, public_page_enabled")
      .eq("public_slug", data.slug)
      .eq("public_page_enabled", true)
      .maybeSingle();
    if (!profile) return null;

    const ownerId = profile.owner_id;
    const [exps, skills, mediaRows, videoRow] = await Promise.all([
      sb.from("resume_experiences").select("id,role,employer_name,start_date,end_date,description").eq("owner_id", ownerId).order("start_date", { ascending: false }),
      sb.from("resume_skills").select("id,skill,level").eq("owner_id", ownerId),
      sb.from("work_media").select("id,media_url,media_type,caption").eq("owner_id", ownerId).eq("is_featured", true).order("uploaded_at", { ascending: false }).limit(8),
      sb.from("intro_video").select("id,video_url").eq("owner_id", ownerId).eq("is_active", true).order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    // Sign storage URLs with service-grade publishable client (buckets are private; we use admin to sign briefly)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const EXPIRES = 60 * 60; // 1h - regenerated each page load
    const media: PublicProfilePayload extends infer T ? (T extends null ? never : T["media"]) : never = [];
    for (const m of mediaRows.data ?? []) {
      const { data: s } = await supabaseAdmin.storage.from("work-media").createSignedUrl(m.media_url, EXPIRES);
      if (s) media.push({ id: m.id, type: m.media_type ?? "photo", caption: m.caption, url: s.signedUrl });
    }
    let video: { id: string; url: string } | null = null;
    if (videoRow.data) {
      const { data: s } = await supabaseAdmin.storage.from("intro-videos").createSignedUrl(videoRow.data.video_url, EXPIRES);
      if (s) video = { id: videoRow.data.id, url: s.signedUrl };
    }

    return {
      profile: {
        full_name: profile.full_name,
        country: profile.country,
        public_headline: profile.public_headline,
        languages: profile.languages,
        has_prior_h2_experience: profile.has_prior_h2_experience,
        phone: profile.phone,
      },
      experiences: exps.data ?? [],
      skills: skills.data ?? [],
      media,
      video,
    };
  });

export const trackProfileView = createServerFn({ method: "POST" })
  .inputValidator((d: { slug: string; userAgent?: string; referer?: string }) => d)
  .handler(async ({ data }) => {
    const sb = publicClient();
    const { data: profile } = await sb.from("my_profile").select("owner_id").eq("public_slug", data.slug).maybeSingle();
    if (!profile) return { ok: false };
    await sb.from("profile_views").insert({
      owner_id: profile.owner_id,
      slug: data.slug,
      user_agent: data.userAgent ?? null,
      referer: data.referer ?? null,
    });
    return { ok: true };
  });
