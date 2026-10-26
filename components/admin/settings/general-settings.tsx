"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateSettings } from "@/actions/settings";
import {
  ROLLOVER_MONTHS,
  formatRollover,
  isValidRollover,
  rolloverDaysInMonth,
  schoolYearStart,
} from "@/lib/grades";
import { SettingsPageHeader } from "./settings-header";
import { toast } from "sonner";
import type { Settings } from "@/lib/types";

// The School, App & notifications and Assistant pages: plain settings fields,
// saved together by the Save button in the page header. Each page sends only
// its own fields.

interface SettingsFormProps {
  settings: Settings;
  schoolId: string;
  schoolSlug: string;
}

function SaveButton({ saving, onSave }: { saving: boolean; onSave: () => void }) {
  return (
    <Button onClick={onSave} disabled={saving}>
      {saving && <LogoSpinner className="mr-2" />}
      Save settings
    </Button>
  );
}

/** Calls updateSettings with `data`, toasting the outcome. */
function useSaveSettings(schoolId: string) {
  const [saving, setSaving] = useState(false);
  async function save(data: Parameters<typeof updateSettings>[1]) {
    setSaving(true);
    const result = await updateSettings(schoolId, data);
    if (result.error) toast.error(result.error);
    else toast.success("Settings saved");
    setSaving(false);
  }
  return { saving, save };
}

export function SchoolSettings({ settings, schoolId, schoolSlug }: SettingsFormProps) {
  const [schoolName, setSchoolName] = useState(settings.school_name);
  const [rolloverMonth, setRolloverMonth] = useState(settings.grade_rollover_month);
  const [rolloverDay, setRolloverDay] = useState(settings.grade_rollover_day);
  // Fixed at mount, so the render stays pure; only the date part matters.
  const [today] = useState(() => new Date());
  const rolloverChanged =
    rolloverMonth !== settings.grade_rollover_month ||
    rolloverDay !== settings.grade_rollover_day;
  // Moving the date across today changes which school year it is now, so
  // every grade shifts by one at the next hourly update.
  const rolloverYearShift = rolloverChanged
    ? schoolYearStart(today, { month: rolloverMonth, day: rolloverDay }) -
      schoolYearStart(today, {
        month: settings.grade_rollover_month,
        day: settings.grade_rollover_day,
      })
    : 0;
  const { saving, save } = useSaveSettings(schoolId);

  function changeRolloverMonth(value: string) {
    const month = Number(value);
    setRolloverMonth(month);
    setRolloverDay((day) => Math.min(day, rolloverDaysInMonth(month)));
  }

  async function handleSave() {
    if (rolloverChanged && !isValidRollover(rolloverMonth, rolloverDay)) {
      toast.error("Choose a valid date for grades to move up.");
      return;
    }
    await save({
      school_name: schoolName.trim() || "AskMySchool",
      // Only sent when changed, so saving still works before migration 043.
      ...(rolloverChanged
        ? { grade_rollover_month: rolloverMonth, grade_rollover_day: rolloverDay }
        : {}),
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-8">
      <SettingsPageHeader
        slug={schoolSlug}
        section="school"
        action={<SaveButton saving={saving} onSave={handleSave} />}
      />
      <div className="space-y-12">
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-ink">
              School Information
            </h2>
            <p className="text-sm text-muted-foreground">
              Basic information about your school.
            </p>
          </div>
          <div className="space-y-4">
            <div id="setting-school-name" className="scroll-mt-6 space-y-2">
              <Label htmlFor="school-name">School Name</Label>
              <Input
                id="school-name"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="AskMySchool"
              />
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-ink">School year</h2>
            <p className="text-sm text-muted-foreground">
              When children&apos;s grades move up.
            </p>
          </div>
          <div id="setting-grade-rollover" className="scroll-mt-6 space-y-2">
            <Label htmlFor="grade-rollover-month">Grades move up on</Label>
            <div className="flex gap-2">
              <Select value={String(rolloverMonth)} onValueChange={changeRolloverMonth}>
                <SelectTrigger
                  id="grade-rollover-month"
                  aria-label="Month"
                  aria-describedby="grade-rollover-hint"
                  className="w-40"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLLOVER_MONTHS.map((m) => (
                    <SelectItem key={m.value} value={String(m.value)}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={String(rolloverDay)}
                onValueChange={(value) => setRolloverDay(Number(value))}
              >
                <SelectTrigger
                  aria-label="Day"
                  aria-describedby="grade-rollover-hint"
                  className="w-20"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: rolloverDaysInMonth(rolloverMonth) }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {i + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p id="grade-rollover-hint" className="text-xs text-muted-foreground">
              Each child&apos;s grade advances by one on this date every year;
              12th graders are marked graduated (not deleted). Parents can
              still correct a grade, and Veracross sign-in updates it.
            </p>
            {rolloverYearShift !== 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {rolloverYearShift < 0
                  ? `${formatRollover(rolloverMonth, rolloverDay)} hasn't come yet this year, so once you save, every child's grade goes back by one until then.`
                  : `${formatRollover(rolloverMonth, rolloverDay)} has already passed this year, so once you save, every child's grade moves up by one within the hour.`}
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export function AppSettings({ settings, schoolId, schoolSlug }: SettingsFormProps) {
  const [disableAnimations, setDisableAnimations] = useState(
    settings.disable_animations
  );
  const [newDocumentPush, setNewDocumentPush] = useState(
    settings.new_document_push_enabled
  );
  const { saving, save } = useSaveSettings(schoolId);

  async function handleSave() {
    await save({
      disable_animations: disableAnimations,
      // Only sent when changed, so saving still works before migration 042.
      ...(newDocumentPush !== settings.new_document_push_enabled
        ? { new_document_push_enabled: newDocumentPush }
        : {}),
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-8">
      <SettingsPageHeader
        slug={schoolSlug}
        section="app"
        action={<SaveButton saving={saving} onSave={handleSave} />}
      />
      <div className="space-y-12">
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-ink">
              Appearance
            </h2>
            <p className="text-sm text-muted-foreground">
              Customize the look and feel of the app.
            </p>
          </div>
          <div id="setting-disable-animations" className="scroll-mt-6">
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
          </div>
        </section>

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-ink">
              Notifications
            </h2>
            <p className="text-sm text-muted-foreground">
              Push notifications parents get in the iPhone and Android app.
            </p>
          </div>
          <div id="setting-new-document-push" className="scroll-mt-6">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="new-document-push">
                  Notify parents about new documents
                </Label>
                <p className="text-xs text-muted-foreground">
                  Sends one push notification to parents in the app when new
                  uploaded or emailed documents are ready (at most once every
                  3 hours; website pages and edits don&apos;t notify).
                </p>
              </div>
              <Switch
                id="new-document-push"
                checked={newDocumentPush}
                onCheckedChange={setNewDocumentPush}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export function AssistantSettings({ settings, schoolId, schoolSlug }: SettingsFormProps) {
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
  const [newQuestion, setNewQuestion] = useState("");
  const { saving, save } = useSaveSettings(schoolId);

  async function handleSave() {
    await save({
      custom_system_prompt: customPrompt.trim() || null,
      ai_temperature: temperature,
      suggested_questions: questions,
      welcome_message: welcomeMessage.trim() || null,
    });
  }

  function addQuestion() {
    if (!newQuestion.trim()) return;
    setQuestions((prev) => [...prev, newQuestion.trim()]);
    setNewQuestion("");
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-8">
      <SettingsPageHeader
        slug={schoolSlug}
        section="assistant"
        action={<SaveButton saving={saving} onSave={handleSave} />}
      />
      <div className="space-y-12">
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-ink">
              AI Configuration
            </h2>
            <p className="text-sm text-muted-foreground">
              Customize how the AI assistant responds to parents.
            </p>
          </div>
          <div className="space-y-4">
            <div id="setting-custom-prompt" className="scroll-mt-6 space-y-2">
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
            <div id="setting-temperature" className="scroll-mt-6 space-y-3">
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
          </div>
        </section>

        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-ink">
              Chat Settings
            </h2>
            <p className="text-sm text-muted-foreground">
              Configure the chat experience for parents.
            </p>
          </div>
          <div className="space-y-4">
            <div id="setting-welcome-message" className="scroll-mt-6 space-y-2">
              <Label htmlFor="welcome-msg">Welcome Message</Label>
              <Textarea
                id="welcome-msg"
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                rows={2}
                placeholder="Welcome! I can help you find information about our school."
              />
            </div>
            <div id="setting-suggested-questions" className="scroll-mt-6 space-y-2">
              <Label>Suggested Questions</Label>
              <div className="space-y-2">
                {questions.map((q, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex-1 rounded-full border border-border px-3.5 py-1.5 text-sm text-ink">
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
          </div>
        </section>
      </div>
    </div>
  );
}
