"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { legacySettingsHashTarget } from "@/lib/settings/sections";

/**
 * Old links like /admin/settings#email or #auto-sort: the server never sees
 * the hash, so the landing page forwards them to the section that now holds
 * that setting.
 */
export function LegacySettingsHashRedirect({ slug }: { slug: string }) {
  const router = useRouter();
  useEffect(() => {
    const target = legacySettingsHashTarget(slug, window.location.hash);
    if (target) router.replace(target);
  }, [router, slug]);
  return null;
}
