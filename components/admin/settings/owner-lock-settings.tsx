"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, LockKeyholeOpen } from "lucide-react";
import { toast } from "sonner";
import { LogoSpinner } from "@/components/logo-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  relockSchool,
  removeSchoolOwnerLock,
  setSchoolOwnerLock,
} from "@/actions/school-lock";
import { LOCK_PASSWORD_MIN_LENGTH } from "@/lib/school-lock/core";
import { SettingsPageHeader } from "./settings-header";

// Settings › Security: the school's owner lock. Its own admins set, change or
// remove the password; platform staff only see whether it's on (and, when
// they've unlocked it, can lock it again).

export interface OwnerLockConfig {
  /** False until migration 050 is applied. */
  installed: boolean;
  locked: boolean;
  updatedAt: string | null;
  loadError: string | null;
  /** The viewer is an approved admin of this school (not platform staff). */
  canManage: boolean;
}

type Mode = "idle" | "set" | "change" | "remove";

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "new-password" | "current-password";
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function OwnerLockSettings({
  schoolId,
  schoolSlug,
  config,
}: {
  schoolId: string;
  schoolSlug: string;
  config: OwnerLockConfig;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  function reset(nextMode: Mode = "idle") {
    setMode(nextMode);
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  async function run(action: () => Promise<{ success: true } | { error: string }>, done: string) {
    setBusy(true);
    try {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(done);
      reset();
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (next.length < LOCK_PASSWORD_MIN_LENGTH) {
      toast.error(`Use at least ${LOCK_PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (next !== confirm) {
      toast.error("The new passwords don't match.");
      return;
    }
    const changing = mode === "change";
    void run(
      () =>
        setSchoolOwnerLock(schoolId, {
          newPassword: next,
          ...(changing ? { currentPassword: current } : {}),
        }),
      changing ? "Lock password changed" : "Owner lock turned on"
    );
  }

  function handleRemove(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(() => removeSchoolOwnerLock(schoolId, current), "Owner lock removed");
  }

  const StatusIcon = config.locked ? LockKeyhole : LockKeyholeOpen;

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-8">
      <SettingsPageHeader slug={schoolSlug} section="security" />

      <section id="setting-owner-lock" className="scroll-mt-6 space-y-6">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-ink">Owner lock</h2>
          <p className="text-sm text-muted-foreground">
            Keeps AskMySchool platform staff out of your school&apos;s admin
            pages and data unless they enter this password. Your admins,
            parents, the assistant, email intake and syncs aren&apos;t affected.
          </p>
        </div>

        {config.loadError ? (
          <p className="text-sm text-destructive">{config.loadError}</p>
        ) : !config.installed ? (
          <p className="text-sm text-muted-foreground">
            The owner lock isn&apos;t available yet. Please check back soon.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <StatusIcon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-muted-foreground" />
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium text-ink">
                    {config.locked ? "On" : "Off"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {config.locked
                      ? `Platform staff need the password to open this school${
                          config.updatedAt
                            ? ` · set ${new Date(config.updatedAt).toLocaleDateString()}`
                            : ""
                        }.`
                      : "Platform staff can open this school to help with support."}
                  </p>
                </div>
              </div>

              {config.canManage && mode === "idle" && (
                <div className="flex shrink-0 gap-2">
                  {config.locked ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => reset("change")}>
                        Change password
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => reset("remove")}>
                        Remove
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => reset("set")}>
                      Set a password
                    </Button>
                  )}
                </div>
              )}

              {!config.canManage && config.locked && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() =>
                    run(() => relockSchool(schoolId), "Locked again").then(() =>
                      router.replace("/super-admin")
                    )
                  }
                  disabled={busy}
                >
                  Lock again
                </Button>
              )}
            </div>

            {!config.canManage && (
              <p className="text-xs text-muted-foreground">
                Only this school&apos;s own admins can change the owner lock.
              </p>
            )}

            {config.canManage && (mode === "set" || mode === "change") && (
              <form onSubmit={handleSave} className="space-y-4">
                {mode === "change" && (
                  <PasswordField
                    id="owner-lock-current"
                    label="Current password"
                    value={current}
                    onChange={setCurrent}
                    autoComplete="current-password"
                  />
                )}
                <PasswordField
                  id="owner-lock-new"
                  label={mode === "change" ? "New password" : "Password"}
                  value={next}
                  onChange={setNext}
                  autoComplete="new-password"
                  hint={`At least ${LOCK_PASSWORD_MIN_LENGTH} characters. Share it only with people you trust to open your school.`}
                />
                <PasswordField
                  id="owner-lock-confirm"
                  label="Confirm password"
                  value={confirm}
                  onChange={setConfirm}
                  autoComplete="new-password"
                />
                <div className="flex gap-2 pt-1">
                  <Button type="submit" disabled={busy || !next || !confirm}>
                    {busy && <LogoSpinner className="mr-2" />}
                    {mode === "change" ? "Change password" : "Turn on lock"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => reset()} disabled={busy}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            {config.canManage && mode === "remove" && (
              <form onSubmit={handleRemove} className="space-y-4">
                <PasswordField
                  id="owner-lock-remove-current"
                  label="Current password"
                  value={current}
                  onChange={setCurrent}
                  autoComplete="current-password"
                  hint="Removing the lock lets platform staff open your school again without a password."
                />
                <div className="flex gap-2 pt-1">
                  <Button type="submit" variant="destructive" disabled={busy || !current}>
                    {busy && <LogoSpinner className="mr-2" />}
                    Remove lock
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => reset()} disabled={busy}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}
