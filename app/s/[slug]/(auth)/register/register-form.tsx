"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GradientMesh } from "@/components/ui/gradient-mesh";
import { register } from "@/actions/auth";

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <GradientMesh />
      <Link
        href="/"
        className="group absolute left-6 top-6 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Back
      </Link>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="w-full max-w-md metallic-card backdrop-blur-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full metallic-surface border border-glass-border neon-border">
              <Logo size={24} className="text-primary drop-shadow-[0_0_6px_var(--glow-primary)] drop-shadow-[0_0_10px_oklch(1_0_0/40%)]" />
            </div>
            <CardTitle className="text-2xl metallic-heading neon-text-soft">Create an account</CardTitle>
            <CardDescription>
              Create an account for {schoolName}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={handleSubmit} className="space-y-4">
              <input type="hidden" name="school_slug" value={schoolSlug} />
              <input type="hidden" name="school_id" value={schoolId} />
              <input type="hidden" name="join_code" value={joinCode} />
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              {requireJoinCode && (
                <div className="space-y-2">
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
              <div className="space-y-2">
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
                <div className="space-y-4">
                  <p className="text-sm font-medium text-muted-foreground">
                    Child Information
                  </p>
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
                    <Select
                      value={childGrade}
                      onValueChange={setChildGrade}
                    >
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
                </div>
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
              <div className="space-y-2">
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
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create account
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href={`/s/${schoolSlug}/login`} className="text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
