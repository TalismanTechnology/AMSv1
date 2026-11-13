import { requireSchoolContext, getUserSchoolMembership } from "@/lib/school-context";
import { PageTransition } from "@/components/motion";
import {
  OwnerLockSettings,
  type OwnerLockConfig,
} from "@/components/admin/settings/owner-lock-settings";
import { hasGenuineAccess } from "@/lib/school-lock/core";
import { loadSchoolLock } from "@/lib/school-lock/store";

export default async function SecuritySettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user, school } = await requireSchoolContext(slug);

  const [membership, lock] = await Promise.all([
    getUserSchoolMembership(user.id, school.id),
    loadSchoolLock(school.id).catch((err: unknown) => {
      console.error("[settings] Loading the owner lock failed:", err instanceof Error ? err.message : err);
      return null;
    }),
  ]);

  // Only the status reaches the browser, never the hash.
  const config: OwnerLockConfig = {
    installed: lock?.installed ?? true,
    locked: Boolean(lock?.passwordHash),
    updatedAt: lock?.updatedAt ?? null,
    loadError: lock ? null : "The owner lock couldn't be loaded. Reload to try again.",
    canManage: hasGenuineAccess(membership, "admin"),
  };

  return (
    <PageTransition>
      <OwnerLockSettings schoolId={school.id} schoolSlug={slug} config={config} />
    </PageTransition>
  );
}
