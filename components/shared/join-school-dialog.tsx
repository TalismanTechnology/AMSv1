"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { joinSchoolByCode } from "@/actions/school-join";

interface JoinSchoolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JoinSchoolDialog({ open, onOpenChange }: JoinSchoolDialogProps) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    schoolName: string;
    schoolSlug: string;
    pending: boolean;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError(null);

    const res = await joinSchoolByCode(code.trim());

    if (res.error) {
      setError(res.error);
      setLoading(false);
      return;
    }

    if (res.success) {
      setResult({
        schoolName: res.schoolName!,
        schoolSlug: res.schoolSlug!,
        pending: res.pending!,
      });
      setLoading(false);
    }
  }

  function handleClose() {
    setCode("");
    setError(null);
    setResult(null);
    onOpenChange(false);
  }

  function handleGoToSchool() {
    if (result) {
      router.push(`/s/${result.schoolSlug}/parent`);
    }
    handleClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join a School</DialogTitle>
          <DialogDescription>
            Enter the school code provided by your school.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-2">
            {result.pending ? (
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
                  <Clock className="h-6 w-6 text-amber-500" />
                </div>
                <div>
                  <p className="font-medium">Request Sent</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    You&apos;ve requested to join <strong>{result.schoolName}</strong>. A school administrator will review your request.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <p className="font-medium">Joined Successfully</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    You&apos;ve joined <strong>{result.schoolName}</strong>.
                  </p>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              {!result.pending && (
                <Button onClick={handleGoToSchool}>
                  Go to School
                </Button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="school-code">School Code</Label>
              <Input
                id="school-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Enter school code"
                className="font-mono uppercase tracking-wider"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !code.trim()}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Join School
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
