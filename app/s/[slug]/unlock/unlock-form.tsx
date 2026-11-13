"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogoSpinner } from "@/components/logo-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { unlockSchool } from "@/actions/school-lock";

export function UnlockForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await unlockSchool(slug, password);
      if ("error" in result) {
        setError(result.error);
        setPassword("");
        return;
      }
      router.replace(result.redirectTo);
      router.refresh();
    } catch {
      setError("Couldn't check the password. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="school-lock-password">Lock password</Label>
        <Input
          id="school-lock-password"
          type="password"
          autoComplete="off"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "school-lock-error" : undefined}
        />
        {error && (
          <p id="school-lock-error" role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={!password || pending}>
        {pending && <LogoSpinner className="mr-2" />}
        Unlock
      </Button>
    </form>
  );
}
