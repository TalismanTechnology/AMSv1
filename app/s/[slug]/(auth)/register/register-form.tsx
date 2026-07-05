"use client";

import { useState } from "react";
import Link from "next/link";
import { LogoSpinner } from "@/components/logo-spinner";
import { Logo } from "@/components/logo";
import { LogoLoading } from "@/components/logo-loading";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { register } from "@/actions/auth";
import { AuthShell } from "@/components/auth/auth-shell";

interface RegisterFormProps {
  schoolSlug: string;
  schoolId: string;
  schoolName: string;
  requireJoinCode: boolean;
}

export function RegisterForm({ schoolSlug, schoolId, schoolName, requireJoinCode }: RegisterFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<"parent" | "admin">("parent");
  const [childName, setChildName] = useState("");
  const [childGrade, setChildGrade] = useState("");
  const [joinCode, setJoinCode] = useState("");

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await register(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  const showTransition = loading && !error;

  return (
    <AuthShell
      wide
      eyebrow={schoolName}
      headline={
        <>
          Join {schoolName},{" "}
          <span className="italic text-primary">ask</span> anything.
        </>
      }
      subhead={`Create your account for ${schoolName} and get instant, cited answers from official school documents.`}
      points={[
        "Instant answers from official handbooks",
        "Every reply cites its source document",
        "Private to your school community",
      ]}
    >
      <AnimatePresence>
        {showTransition && (
          <motion.div
            key="auth-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background"
          >
            <LogoLoading size={100} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="metallic-card rounded-2xl p-8 sm:p-10">
        <div className="mb-7">
          <span className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary elev-1">
            <Logo size={24} className="text-primary" />
          </span>
          <p className="eyebrow">Get started</p>
          <h2 className="mt-2 font-serif-display text-3xl font-medium tracking-[-0.02em] text-ink">
            Create an account
          </h2>
          <p className="mt-2 text-sm text-ink-soft">
            Create an account for {schoolName}
          </p>
        </div>

        <form
          action={handleSubmit}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <input type="hidden" name="school_slug" value={schoolSlug} />
          <input type="hidden" name="school_id" value={schoolId} />
          <input type="hidden" name="join_code" value={joinCode} />
          {error && (
            <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive sm:col-span-2">
              {error}
            </div>
          )}
          {requireJoinCode && (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="join_code">School Code</Label>
              <Input
                id="join_code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Enter your school code"
                className="font-mono uppercase tracking-wider"
                required
              />
              <p className="text-xs text-muted-foreground">
                Ask your school for the join code.
              </p>
            </div>
          )}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="role">I am a</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as "parent" | "admin")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="parent">Parent</SelectItem>
                <SelectItem value="admin">School Admin</SelectItem>
              </SelectContent>
            </Select>
            <input type="hidden" name="role" value={role} />
          </div>
          {role === "parent" && (
            <>
              <p className="eyebrow sm:col-span-2">Child Information</p>
              <div className="space-y-2">
                <Label htmlFor="child_name">Child&apos;s name</Label>
                <Input
                  id="child_name"
                  value={childName}
                  onChange={(e) => setChildName(e.target.value)}
                  placeholder="e.g. Alex"
                />
                <input type="hidden" name="child_name" value={childName} />
              </div>
              <div className="space-y-2">
                <Label>Child&apos;s grade</Label>
                <Select value={childGrade} onValueChange={setChildGrade}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select grade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pre-K">Pre-K</SelectItem>
                    <SelectItem value="K">Kindergarten</SelectItem>
                    <SelectItem value="1">1st Grade</SelectItem>
                    <SelectItem value="2">2nd Grade</SelectItem>
                    <SelectItem value="3">3rd Grade</SelectItem>
                    <SelectItem value="4">4th Grade</SelectItem>
                    <SelectItem value="5">5th Grade</SelectItem>
                    <SelectItem value="6">6th Grade</SelectItem>
                    <SelectItem value="7">7th Grade</SelectItem>
                    <SelectItem value="8">8th Grade</SelectItem>
                    <SelectItem value="9">9th Grade</SelectItem>
                    <SelectItem value="10">10th Grade</SelectItem>
                    <SelectItem value="11">11th Grade</SelectItem>
                    <SelectItem value="12">12th Grade</SelectItem>
                  </SelectContent>
                </Select>
                <input type="hidden" name="child_grade" value={childGrade} />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="full_name">Parent&apos;s name</Label>
            <Input
              id="full_name"
              name="full_name"
              type="text"
              placeholder="Jane Smith"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="parent@example.com"
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="At least 6 characters"
              minLength={6}
              required
            />
          </div>
          <Button
            type="submit"
            className="h-11 w-full sm:col-span-2"
            disabled={loading}
          >
            {loading && <LogoSpinner className="mr-2" />}
            Create account
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-ink-soft">
          Already have an account?{" "}
          <Link
            href={`/s/${schoolSlug}/login`}
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
