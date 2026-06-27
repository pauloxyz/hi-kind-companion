// Server-only helper to import H-2A jobs from the DOL SeasonalJobs Datahub.
// Uses the same POST search endpoint called by seasonaljobs.dol.gov. The older
// GET Datahub endpoint is more frequently blocked by CloudFront from server runtimes.

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const DOL_SEARCH_URL = "https://api.seasonaljobs.dol.gov/datahub/search?api-version=2020-06-30";
const PAGE_SIZE = 100;
const SELECT_FIELDS = [
  "case_number",
  "visa_class",
  "job_title",
  "begin_date",
  "end_date",
  "basic_rate_from",
  "basic_rate_to",
  "pay_range_desc",
  "employer_trade_name",
  "employer_business_name",
  "worksite_address",
  "worksite_city",
  "worksite_state",
  "worksite_zip",
  "total_positions",
  "apply_email",
  "apply_phone",
  "apply_url",
  "accepted_date",
].join(",");

type DolRecord = {
  case_number?: string | null;
  visa_class?: string | null;
  job_title?: string | null;
  employer_business_name?: string | null;
  employer_trade_name?: string | null;
  worksite_address?: string | null;
  worksite_city?: string | null;
  worksite_state?: string | null;
  worksite_zip?: string | null;
  basic_rate_from?: number | null;
  pay_range_desc?: string | null;
  begin_date?: string | null;
  end_date?: string | null;
  total_positions?: number | null;
  apply_email?: string | null;
  apply_phone?: string | null;
  apply_url?: string | null;
  accepted_date?: string | null;
  [k: string]: unknown;
};

function toDateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function mapRecord(r: DolRecord) {
  const city = r.worksite_city ?? "";
  const state = r.worksite_state ?? "";
  const zip = r.worksite_zip ?? "";
  const addr = [r.worksite_address, city, state, zip].filter(Boolean).join(", ");
  return {
    external_case_number: r.case_number ?? null,
    visa_type: r.visa_class ?? "H-2A",
    job_title: r.job_title ?? null,
    employer_name: r.employer_trade_name || r.employer_business_name || null,
    employer_address: addr || null,
    worksite_state: state || null,
    worksite_city: city || null,
    wage_offered: r.basic_rate_from ?? null,
    wage_unit: r.pay_range_desc ?? null,
    start_date: toDateOnly(r.begin_date),
    end_date: toDateOnly(r.end_date),
    total_openings: r.total_positions ?? null,
    recruitment_email: r.apply_email ?? null,
    recruitment_phone: r.apply_phone ?? null,
    recruitment_website: r.apply_url ?? null,
    posted_date: toDateOnly(r.accepted_date),
    raw_feed_data: r as unknown as Record<string, unknown>,
  };
}

async function fetchPage(opts: { skip: number; sinceIso?: string }) {
  const filters = ["active eq true", "display eq true", "visa_class eq 'H-2A'"];
  if (opts.sinceIso) filters.push(`accepted_date ge ${opts.sinceIso}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const res = await fetch(DOL_SEARCH_URL, {
    method: "POST",
    signal: controller.signal,
    headers: {
      Referer: "https://seasonaljobs.dol.gov/",
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({
      search: "*",
      searchFields:
        "job_title, job_duties, soc_code_id, soc_title, case_number, worksite_city, worksite_state, employer_business_name, employer_trade_name",
      filter: filters.join(" and "),
      orderby: "accepted_date desc",
      top: PAGE_SIZE,
      skip: opts.skip,
      select: SELECT_FIELDS,
      count: true,
    }),
  });
  clearTimeout(timeout);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const shortBody = body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
    throw new Error(`DOL feed ${res.status}${shortBody ? `: ${shortBody}` : ""}`);
  }
  const json = (await res.json()) as { value?: DolRecord[]; "@odata.count"?: number };
  return { records: json.value ?? [], total: json["@odata.count"] ?? null };
}

export async function importDolFeed(opts: { daysBack: number; maxRecords?: number }) {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const maxRecords = opts.maxRecords ?? 5000;
  const since = new Date(Date.now() - opts.daysBack * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString().replace(/\.\d{3}Z$/, "Z");

  let skip = 0;
  let imported = 0;
  let errorMessage: string | null = null;
  let status = "success";

  try {
    while (imported < maxRecords) {
      const { records } = await fetchPage({ skip, sinceIso });
      if (records.length === 0) break;
      const mapped = records.map(mapRecord).filter((r) => r.external_case_number);
      if (mapped.length > 0) {
        const { error } = await supabase
          .from("jobs")
          .upsert(mapped, { onConflict: "external_case_number" });
        if (error) throw error;
        imported += mapped.length;
      }
      skip += records.length;
      if (records.length < PAGE_SIZE) break;
    }
  } catch (e) {
    status = "error";
    errorMessage = e instanceof Error ? e.message : String(e);
  }

  await supabase.from("feed_import_logs").insert({
    feed_type: `dol_h2a_${opts.daysBack}d`,
    records_imported: imported,
    status,
    error_message: errorMessage,
  });

  if (status === "error") throw new Error(errorMessage ?? "import failed");
  return { imported };
}
