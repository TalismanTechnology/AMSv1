"use client";

import { useState } from "react";
import { Loader2, Plus, X, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updateSettings } from "@/actions/settings";
import { toast } from "sonner";
import { MagicBentoGrid, MagicBentoCard } from "@/components/magic-bento";
import type { Settings } from "@/lib/types";

interface SettingsClientProps {
  settings: Settings;
  schoolId: string;
  schoolSlug: string;
  joinCode: string | null;
}

export function SettingsClient({ settings, schoolId, schoolSlug, joinCode: initialJoinCode }: SettingsClientProps) {
  const [schoolName, setSchoolName] = useState(settings.school_name);
  const [contactInfo, setContactInfo] = useState(settings.contact_info || "");
  const [customPrompt, setCustomPrompt] = useState(
    settings.custom_system_prompt || ""
  );
  const [temperature, setTemperature] = useState(settings.ai_temperature);
  const [questions, setQuestions] = useState<string[]>(
    settings.suggested_questions || []
  );
  const [welcomeMessage, setWelcomeMessage] = useState(
    settings.welcome_message || ""
  );
  const [disableAnimations, setDisableAnimations] = useState(
    settings.disable_animations
  );
  const [joinCode, setJoinCode] = useState(initialJoinCode || "");
  const [requireJoinCode, setRequireJoinCode] = useState(settings.require_join_code);
  const [requireApproval, setRequireApproval] = useState(settings.require_approval);
  const [newQuestion, setNewQuestion] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleSave() {
    // Validate join code format if provided
    const trimmedCode = joinCode.trim().toUpperCase();
    if (trimmedCode && !/^[A-Z0-9-]{4,20}$/.test(trimmedCode)) {
      toast.error("Join code must be 4-20 characters, using letters, numbers, and hyphens only");
      return;
    }

    if (requireJoinCode && !trimmedCode) {
      toast.error("Please set a join code before enabling the requirement");
      return;
    }

    setSaving(true);
    const result = await updateSettings(schoolId, {
      school_name: schoolName.trim() || "AskMySchool",
      contact_info: contactInfo.trim() || null,
      custom_system_prompt: customPrompt.trim() || null,
      ai_temperature: temperature,
      suggested_questions: questions,
      welcome_message: welcomeMessage.trim() || null,
      disable_animations: disableAnimations,
      require_join_code: requireJoinCode,
      require_approval: requireApproval,
      join_code: trimmedCode || null,
    });
    if (result.error) toast.error(result.error);
    else toast.success("Settings saved");
    setSaving(false);
  }

  function addQuestion() {
    if (!newQuestion.trim()) return;
    setQuestions((prev) => [...prev, newQuestion.trim()]);
    setNewQuestion("");
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  function copyCode() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <MagicBentoGrid className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Configure your school&apos;s AskMySchool instance.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save all settings
        </Button>
      </div>

      <MagicBentoCard enableBorderGlow className="rounded-xl">
      <Card>
        <CardHeader>
          <CardTitle>School Information</CardTitle>
          <CardDescription>
            Basic information about your school.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="school-name">School Name</Label>
            <Input
              id="school-name"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
              placeholder="AskMySchool"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-info">Contact Information</Label>
            <Textarea
              id="contact-info"
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              rows={2}
              placeholder="Phone, email, or address..."
            />
          </div>
        </CardContent>
      </Card>
      </MagicBentoCard>

      <MagicBentoCard enableBorderGlow className="rounded-xl">
      <Card>
        <CardHeader>
          <CardTitle>Registration &amp; Access</CardTitle>
          <CardDescription>
            Control how parents join your school.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="join-code">School Join Code</Label>
            <div className="flex gap-2">
              <Input
                id="join-code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. LINCOLN-2026"
                className="font-mono uppercase tracking-wider"
                maxLength={20}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copyCode}
                disabled={!joinCode.trim()}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this code with parents so they can join your school. Letters, numbers, and hyphens only (4-20 characters).
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="require-join-code">Require Join Code</Label>
              <p className="text-xs text-muted-foreground">
                Parents must enter this code to register for your school.
              </p>
            </div>
            <Switch
              id="require-join-code"
              checked={requireJoinCode}
              onCheckedChange={setRequireJoinCode}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="require-approval">Require Admin Approval</Label>
              <p className="text-xs text-muted-foreground">
                New parents need admin approval before accessing the dashboard.
              </p>
            </div>
            <Switch
              id="require-approval"
              checked={requireApproval}
              onCheckedChange={setRequireApproval}
            />
          </div>
        </CardContent>
      </Card>
      </MagicBentoCard>

      <MagicBentoCard enableBorderGlow className="rounded-xl">
      <Card>
        <CardHeader>
          <CardTitle>AI Configuration</CardTitle>
          <CardDescription>
            Customize how the AI assistant responds to parents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="custom-prompt">
              Custom System Prompt Additions
            </Label>
            <Textarea
              id="custom-prompt"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={4}
              placeholder="Add additional instructions for the AI (e.g., 'Always mention our school mascot is the Eagle')"
            />
            <p className="text-xs text-muted-foreground">
              This text is appended to the AI&apos;s base system prompt.
            </p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Temperature</Label>
              <span className="text-sm text-muted-foreground">
                {temperature.toFixed(1)}
              </span>
            </div>
            <Slider
              value={[temperature]}
              onValueChange={([v]) => setTemperature(v)}
              min={0}
              max={1}
              step={0.1}
            />
            <p className="text-xs text-muted-foreground">
              Lower values make responses more focused. Higher values make them
              more creative.
            </p>
          </div>
        </CardContent>
      </Card>
      </MagicBentoCard>

      <MagicBentoCard enableBorderGlow className="rounded-xl">
      <Card>
        <CardHeader>
          <CardTitle>Chat Settings</CardTitle>
          <CardDescription>
            Configure the chat experience for parents.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="welcome-msg">Welcome Message</Label>
            <Textarea
              id="welcome-msg"
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              rows={2}
              placeholder="Welcome! I can help you find information about our school."
            />
          </div>
          <div className="space-y-2">
            <Label>Suggested Questions</Label>
            <div className="space-y-2">
              {questions.map((q, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 rounded-md border bg-muted/50 px-3 py-1.5 text-sm">
                    {q}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 shrink-0 p-0"
                    onClick={() => removeQuestion(i)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="Add a suggested question..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addQuestion();
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={addQuestion}
                disabled={!newQuestion.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      </MagicBentoCard>

      <MagicBentoCard enableBorderGlow className="rounded-xl">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Customize the look and feel of the app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="disable-animations">Disable Animations</Label>
              <p className="text-xs text-muted-foreground">
                Turn off page transitions and decorative animations for a faster experience.
              </p>
            </div>
            <Switch
              id="disable-animations"
              checked={disableAnimations}
              onCheckedChange={setDisableAnimations}
            />
          </div>
        </CardContent>
      </Card>
      </MagicBentoCard>

      <div className="pb-8" />
    </MagicBentoGrid>
  );
}
