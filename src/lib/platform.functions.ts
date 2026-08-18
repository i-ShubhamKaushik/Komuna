import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { PlatformSettings } from "@/lib/platform-defaults";
import { DEFAULT_PLATFORM_SETTINGS } from "@/lib/platform-defaults";

/**
 * Public read of the platform settings (name, tagline, colors, toggles).
 * Everything user-visible reads from here so admins can rebrand without code changes.
 */
export const getPlatformSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlatformSettings> => {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return DEFAULT_PLATFORM_SETTINGS;

    const client = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
            headers.delete("Authorization");
          }
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });

    const { data, error } = await client.from("platform_settings").select("key, value");
    if (error || !data) return DEFAULT_PLATFORM_SETTINGS;

    const byKey = Object.fromEntries(data.map((row) => [row.key, row.value ?? {}]));
    return {
      general: { ...DEFAULT_PLATFORM_SETTINGS.general, ...(byKey["general"] as object) },
      appearance: { ...DEFAULT_PLATFORM_SETTINGS.appearance, ...(byKey["appearance"] as object) },
      registration: {
        ...DEFAULT_PLATFORM_SETTINGS.registration,
        ...(byKey["registration"] as object),
      },
      communities: {
        ...DEFAULT_PLATFORM_SETTINGS.communities,
        ...(byKey["communities"] as object),
      },
      maintenance: {
        ...DEFAULT_PLATFORM_SETTINGS.maintenance,
        ...(byKey["maintenance"] as object),
      },
    };
  },
);
