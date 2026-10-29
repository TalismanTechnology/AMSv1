import type { SignInSchool } from "@/lib/auth/sign-in-schools";

export interface MembershipSummary {
  school_id: string;
  approved: boolean | null;
}

export interface JoinableSchools {
  /** Schools the user has no membership in — the ones worth offering. */
  available: SignInSchool[];
  /** Schools the user has asked to join but an admin hasn't approved yet. */
  pending: SignInSchool[];
}

/**
 * Splits the sign-in school list for the "Add a school" dialog. Schools the
 * user already belongs to are dropped; ones awaiting approval are kept apart
 * so the dialog can say so rather than offer them again.
 */
export function partitionJoinableSchools(
  schools: SignInSchool[],
  memberships: MembershipSummary[]
): JoinableSchools {
  const approved = new Set<string>();
  const waiting = new Set<string>();

  for (const membership of memberships) {
    if (membership.approved) approved.add(membership.school_id);
    else waiting.add(membership.school_id);
  }

  const available: SignInSchool[] = [];
  const pending: SignInSchool[] = [];

  for (const school of schools) {
    if (approved.has(school.id)) continue;
    if (waiting.has(school.id)) pending.push(school);
    else available.push(school);
  }

  return { available, pending };
}
