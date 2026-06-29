import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export type PublicMedia = { id: string; type: string; caption: string | null; url: string };
export type PublicExperience = { id: string; job_title: string | null; employer_name: string | null; start_date: string | null; end_date: string | null; description: string | null };
export type PublicSkill = { id: string; skill_name: string | null; category: string | null };

export type PublicProfilePayload = {
  profile: {
    full_name: string | null;
    country: string | null;
    public_headline: string | null;
    languages: string[] | null;
    has_prior_h2_experience: boolean | null;
    phone: string | null;
  };
  experiences: PublicExperience[];
  skills: PublicSkill[];
  media: PublicMedia[];
  video: { id: string; url: string } | null;
} | null;

export const getPublicProfileBySlug = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data }): Promise<PublicProfilePayload> => {
    const sb = publicClient();
    const { data: profile } = await sb
      .from("public_profiles" as never)
      .select("owner_id, full_name, country, public_headline, languages, has_prior_h2_experience")
      .eq("public_slug", data.slug)
      .maybeSingle<{
        owner_id: string;
        full_name: string | null;
        country: string | null;
        public_headline: string | null;
        languages: string[] | null;
        has_prior_h2_experience: boolean | null;
      }>();
    if (!profile) return null;
    const { data: phoneRow } = await (sb.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null }>)("get_public_profile_whatsapp", { _slug: data.slug });
    const phone = (typeof phoneRow === "string" ? phoneRow : null) as string | null;

    const ownerId = profile.owner_id;
    const [exps, skills, mediaRows, videoRow] = await Promise.all([
      sb.from("resume_experiences").select("id,job_title,job_title_en,employer_name,start_date,end_date,description_en,description_pt").eq("owner_id", ownerId).order("start_date", { ascending: false }),
      sb.from("resume_skills").select("id,skill_name,category").eq("owner_id", ownerId),
      (async () => {
        const featured = await sb.from("work_media").select("id,media_url,media_type,caption,is_featured").eq("owner_id", ownerId).eq("is_featured", true).order("uploaded_at", { ascending: false }).limit(8);
        if ((featured.data ?? []).length > 0) return featured;
        // Fallback: if the candidate hasn't starred anything, show the most recent uploads
        return await sb.from("work_media").select("id,media_url,media_type,caption,is_featured").eq("owner_id", ownerId).order("uploaded_at", { ascending: false }).limit(8);
      })(),
      sb.from("intro_video").select("id,video_url").eq("owner_id", ownerId).eq("is_active", true).order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const EXPIRES = 60 * 60; // 1h, regenerated each load
    const media: PublicMedia[] = [];
    for (const m of mediaRows.data ?? []) {
      const { data: s } = await supabaseAdmin.storage.from("work-media").createSignedUrl(m.media_url, EXPIRES);
      if (s) media.push({ id: m.id, type: m.media_type ?? "photo", caption: m.caption, url: s.signedUrl });
    }
    let video: { id: string; url: string } | null = null;
    if (videoRow.data) {
      const { data: s } = await supabaseAdmin.storage.from("intro-videos").createSignedUrl(videoRow.data.video_url, EXPIRES);
      if (s) video = { id: videoRow.data.id, url: s.signedUrl };
    }

    const experiences: PublicExperience[] = (exps.data ?? []).map((e) => ({
      id: e.id,
      job_title: e.job_title_en ?? e.job_title,
      employer_name: e.employer_name,
      start_date: e.start_date,
      end_date: e.end_date,
      description: e.description_en ?? e.description_pt ?? null,
    }));

    return {
      profile: {
        full_name: profile.full_name,
        country: profile.country,
        public_headline: profile.public_headline,
        languages: profile.languages,
        has_prior_h2_experience: profile.has_prior_h2_experience,
        phone,
      },
      experiences,
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

export const listPublicProfileSlugs = createServerFn({ method: "GET" }).handler(async () => {
  const sb = publicClient();
  const { data } = await sb
    .from("my_profile")
    .select("public_slug")
    .eq("public_page_enabled", true)
    .not("public_slug", "is", null)
    .limit(5000);
  return { slugs: (data ?? []).map((r) => r.public_slug as string).filter(Boolean) };
});
