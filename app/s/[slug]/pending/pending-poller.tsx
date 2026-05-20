"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { checkApprovalStatus } from "@/actions/pending";

const POLL_INTERVAL_MS = 10_000;

/**
 * Polls for membership approval while the user sits on the pending page.
 * On approval (or any other state that should leave this page) it navigates
 * away automatically — no manual refresh required.
 */
export function PendingPoller({ slug }: { slug: string }) {
  const router = useRouter();
  const [approved, setApproved] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const { approved, redirectTo } = await checkApprovalStatus(slug);
        if (cancelled || !redirectTo) return;
        if (approved) setApproved(true);
        router.replace(redirectTo);
      } catch {
        // Transient error — the next interval tick will retry.
      } finally {
        inFlight.current = false;
      }
    }

    // Check on mount, on a fixed interval, and whenever the tab regains focus.
    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [slug, router]);

  if (approved) {
    return (
      <p className="flex items-center justify-center gap-2 text-sm text-emerald-500">
        <CheckCircle2 className="h-4 w-4" />
        Approved — taking you in…
      </p>
    );
  }

  return (
    <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
      <RefreshCw className="h-3 w-3 animate-spin [animation-duration:3s]" />
      Checking automatically — this page will update once you&apos;re approved.
    </p>
  );
}
