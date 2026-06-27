import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({ daysBack: z.number().int().min(1).max(60).default(15) });

export const triggerDolImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { importDolFeed } = await import("./dol-import.server");
    return await importDolFeed({ daysBack: data.daysBack });
  });
