import { getRouteApi } from "@tanstack/react-router";
import type { PlatformSettings } from "@/lib/platform-defaults";

const rootApi = getRouteApi("__root__");

/** Platform-wide branding/settings, loaded once at the root route. */
export function usePlatform(): PlatformSettings {
  return rootApi.useLoaderData() as PlatformSettings;
}

export function usePlatformName(): string {
  return usePlatform().general.platform_name;
}
