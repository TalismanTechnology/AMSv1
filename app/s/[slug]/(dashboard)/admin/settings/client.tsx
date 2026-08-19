"use client";

import { useEffect, useState } from "react";
import { Plus, X, Copy, Check, RefreshCw, ExternalLink } from "lucide-react";
import { LogoSpinner } from "@/components/logo-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { TimeAgo } from "@/components/ui/time-ago";
import { updateSettings, updateEmailIngestion } from "@/actions/settings";
import {
  syncBlackbaudRoster,
  updateBlackbaudVerification,
} from "@/actions/blackbaud";
import { updateSsoSettings } from "@/actions/sso";
import { toast } from "sonner";
import type { Settings } from "@/lib/types";

interface EmailIngestionConfig {
  enabled: boolean;
  autoSort: boolean;
  allowedDomains: string[];
  token: string | null;
  inboundDomain: string | null;
}

export type BlackbaudCallbackResult = "connected" | "denied" | "error" | null;

export interface BlackbaudConnection {
  status: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  environmentId: string | null;
}

export interface BlackbaudConfig {
  verificationEnabled: boolean;
  rosterCount: number;
  connection: BlackbaudConnection | null;
}

export interface SsoConfig {
  enabled: boolean;
  domain: string;
  providerId: string;
  buttonLabel: string;
  acsUrl: string | null;
  metadataUrl: string | null;
}

interface SettingsClientProps {
  settings: Settings;
  schoolId: string;
  schoolSlug: string;
  joinCode: string | null;
  emailIngestion: EmailIngestionConfig;
  blackbaud: BlackbaudConfig;
  blackbaudCallback: BlackbaudCallbackResult;
  sso: SsoConfig;
}

export function SettingsClient({
  settings,
  schoolId,
  schoolSlug,
  joinCode: initialJoinCode,
  emailIngestion,
  blackbaud,
  blackbaudCallback,
  sso,
}: SettingsClientProps) {
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
    <div className="mx-auto max-w-2xl space-y-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-[-0.01em]">
            Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure your school&apos;s AskMySchool instance.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <LogoSpinner className="mr-2" />}
          Save all settings
        </Button>
      </div>

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
        </div>
      </section>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-ink">
            Registration &amp; Access
          </h2>
          <p className="text-sm text-muted-foreground">
            Control how parents join your school.
          </p>
        </div>
        <div className="space-y-5">
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
        </div>
      </section>

      <EmailIngestionSection schoolId={schoolId} config={emailIngestion} />

      <SsoSection schoolId={schoolId} config={sso} />

      <BlackbaudSection
        schoolId={schoolId}
        schoolSlug={schoolSlug}
        config={blackbaud}
        callback={blackbaudCallback}
      />

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

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-ink">
            Appearance
          </h2>
          <p className="text-sm text-muted-foreground">
            Customize the look and feel of the app.
          </p>
        </div>
        <div>
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

      <div className="pb-8" />
    </div>
  );
}

function SsoSection({
  schoolId,
  config,
}: {
  schoolId: string;
  config: SsoConfig;
}) {
  const [enabled, setEnabled] = useState(config.enabled);
  const [domain, setDomain] = useState(config.domain);
  const [providerId, setProviderId] = useState(config.providerId);
  const [buttonLabel, setButtonLabel] = useState(config.buttonLabel);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const hasRoute = Boolean(domain.trim() || providerId.trim());

  function copy(value: string, key: string) {
    navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleSave() {
    setSaving(true);
    const result = await updateSsoSettings(schoolId, {
      enabled,
      domain,
      providerId,
      buttonLabel,
    });
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Single sign-on settings saved");
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-ink">Single Sign-On</h2>
        <p className="text-sm text-muted-foreground">
          Let families sign in with the same account they already use for the
          school website, by pointing AskMySchool at your school&apos;s identity
          provider.
        </p>
      </div>

      <div className="space-y-5">
        {/* The provider must exist in Supabase before this panel can route to
            it; saying so here prevents a dead sign-in button. */}
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium text-ink">
            Registration is a one-time setup step
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Your identity provider has to be registered against our Supabase
            project before this school can route to it. Send the two URLs below
            to whoever administers your school&apos;s IdP, then record the
            resulting domain or provider ID here.
          </p>

          <dl className="mt-4 space-y-2">
            {[
              { key: "acs", label: "ACS URL", value: config.acsUrl },
              {
                key: "metadata",
                label: "Metadata / EntityID",
                value: config.metadataUrl,
              },
            ].map((row) => (
              <div key={row.key} className="space-y-1">
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd className="flex gap-2">
                  <Input
                    readOnly
                    value={row.value ?? "NEXT_PUBLIC_SUPABASE_URL not set"}
                    className="font-mono text-xs"
                    onFocus={(e) => e.target.select()}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    disabled={!row.value}
                    onClick={() => row.value && copy(row.value, row.key)}
                    aria-label={`Copy ${row.label}`}
                  >
                    {copied === row.key ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sso-domain">Sign-in domain</Label>
          <Input
            id="sso-domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="lincolnhigh.org"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            The email domain registered against your identity provider. Families
            with an address at this domain are sent to your school&apos;s login.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sso-provider-id">Provider ID</Label>
          <Input
            id="sso-provider-id"
            value={providerId}
            onChange={(e) => setProviderId(e.target.value)}
            placeholder="Optional — only if your IdP has no domain of its own"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            The UUID from{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
              supabase sso list
            </code>
            . Either a domain or a provider ID is required.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="sso-label">Button label</Label>
          <Input
            id="sso-label"
            value={buttonLabel}
            onChange={(e) => setButtonLabel(e.target.value)}
            placeholder="Continue with your school account"
          />
          <p className="text-xs text-muted-foreground">
            What families see on the sign-in button. Use the name they recognize
            from the school website.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="sso-enabled">Enable single sign-on</Label>
            <p className="text-xs text-muted-foreground">
              {hasRoute
                ? "Shows the sign-in button on your school's login page."
                : "Add a domain or provider ID first."}
            </p>
          </div>
          <Switch
            id="sso-enabled"
            checked={enabled}
            disabled={!hasRoute && !enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <LogoSpinner className="mr-2" />}
            Save SSO settings
          </Button>
        </div>
      </div>
    </section>
  );
}

const CALLBACK_MESSAGES: Record<
  Exclude<BlackbaudCallbackResult, null>,
  { tone: "good" | "bad"; title: string; body: string }
> = {
  connected: {
    tone: "good",
    title: "Blackbaud connected",
    body: "Run a sync to pull this school's parent roster across.",
  },
  denied: {
    tone: "bad",
    title: "Authorization declined",
    body: "The consent screen was cancelled, so nothing was connected.",
  },
  error: {
    tone: "bad",
    title: "Authorization failed",
    body: "Blackbaud rejected the request or the session expired. Try connecting again.",
  },
};

// status -> how the panel reads. Anything unrecognized falls through to the
// "unknown" row rather than rendering a blank dot.
const STATUS_PRESENTATION: Record<
  string,
  { label: string; dot: string; detail: string }
> = {
  connected: {
    label: "Connected",
    dot: "bg-emerald-500",
    detail: "Roster syncs nightly.",
  },
  expired: {
    label: "Authorization expired",
    dot: "bg-amber-500",
    detail: "Reconnect to restore roster syncing.",
  },
  error: {
    label: "Sync error",
    dot: "bg-red-500",
    detail: "The last sync did not complete.",
  },
};

function BlackbaudSection({
  schoolId,
  schoolSlug,
  config,
  callback,
}: {
  schoolId: string;
  schoolSlug: string;
  config: BlackbaudConfig;
  callback: BlackbaudCallbackResult;
}) {
  const [enabled, setEnabled] = useState(config.verificationEnabled);
  const [rosterCount, setRosterCount] = useState(config.rosterCount);
  const [savingToggle, setSavingToggle] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState(callback);

  // The callback lands here as ?blackbaud=... — read it once, then drop it so a
  // refresh or a shared URL doesn't replay a stale outcome.
  useEffect(() => {
    if (!callback) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("blackbaud");
    window.history.replaceState(null, "", url.toString());
  }, [callback]);

  const connection = config.connection;
  const presentation = connection
    ? STATUS_PRESENTATION[connection.status] ?? {
        label: connection.status,
        dot: "bg-muted-foreground",
        detail: "Unrecognized connection state.",
      }
    : null;

  async function handleToggle(next: boolean) {
    setEnabled(next);
    setSavingToggle(true);
    const result = await updateBlackbaudVerification(schoolId, next);
    setSavingToggle(false);

    if (result.error) {
      setEnabled(!next); // roll back — the write did not land
      toast.error(result.error);
      return;
    }
    toast.success(
      next ? "Roster verification required" : "Roster verification turned off"
    );
  }

  async function handleSync() {
    setSyncing(true);
    const result = await syncBlackbaudRoster(schoolId);
    setSyncing(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    setRosterCount(result.upserted ?? 0);
    toast.success(
      `Synced ${result.upserted ?? 0} parents${
        result.deactivated ? ` · ${result.deactivated} deactivated` : ""
      }`
    );
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-ink">Blackbaud</h2>
        <p className="text-sm text-muted-foreground">
          Connect your school&apos;s Blackbaud environment to verify parents
          against the official guardian roster before granting access.
        </p>
      </div>

      {notice && (
        <div
          role="status"
          className={`flex items-start justify-between gap-4 rounded-lg border bg-card p-4 ${
            CALLBACK_MESSAGES[notice].tone === "good"
              ? "border-emerald-500/40"
              : "border-red-500/40"
          }`}
        >
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-ink">
              {CALLBACK_MESSAGES[notice].title}
            </p>
            <p className="text-xs text-muted-foreground">
              {CALLBACK_MESSAGES[notice].body}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 shrink-0 p-0"
            onClick={() => setNotice(null)}
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div className="space-y-5">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`h-2 w-2 rounded-full ${
                    presentation ? presentation.dot : "bg-muted-foreground/50"
                  }`}
                />
                <span className="text-sm font-medium text-ink">
                  {presentation ? presentation.label : "Not connected"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {presentation
                  ? presentation.detail
                  : "No Blackbaud environment is linked to this school yet."}
              </p>
            </div>

            <div className="text-right">
              <p className="text-2xl font-semibold tabular-nums text-ink tracking-[-0.02em]">
                {rosterCount.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {rosterCount === 1 ? "parent on roster" : "parents on roster"}
              </p>
            </div>
          </div>

          {connection && (
            <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-xs">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Last synced</dt>
                <dd className="text-ink-soft">
                  {connection.lastSyncedAt ? (
                    <TimeAgo date={connection.lastSyncedAt} />
                  ) : (
                    "Never"
                  )}
                </dd>
              </div>
              {connection.environmentId && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Environment</dt>
                  <dd className="font-mono text-ink-soft">
                    {connection.environmentId}
                  </dd>
                </div>
              )}
              {connection.lastError && (
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-muted-foreground">Last error</dt>
                  <dd className="break-words text-right text-red-500">
                    {connection.lastError}
                  </dd>
                </div>
              )}
            </dl>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {/* Full page navigation on purpose — the route 302s to Blackbaud. */}
            <Button asChild variant={connection ? "outline" : "default"}>
              <a
                href={`/api/blackbaud/connect?school=${encodeURIComponent(
                  schoolSlug
                )}`}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {connection ? "Reconnect Blackbaud" : "Connect Blackbaud"}
              </a>
            </Button>
            <Button
              variant="outline"
              onClick={handleSync}
              disabled={!connection || syncing}
            >
              {syncing ? (
                <LogoSpinner className="mr-2" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Sync now
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="blackbaud-verification">
              Require roster match for access
            </Label>
            <p className="text-xs text-muted-foreground">
              Only people whose email appears on the synced Blackbaud roster are
              approved as parents.
            </p>
          </div>
          <Switch
            id="blackbaud-verification"
            checked={enabled}
            disabled={savingToggle || (!connection && !enabled)}
            onCheckedChange={handleToggle}
          />
        </div>
      </div>
    </section>
  );
}

function EmailIngestionSection({
  schoolId,
  config,
}: {
  schoolId: string;
  config: EmailIngestionConfig;
}) {
  const [enabled, setEnabled] = useState(config.enabled);
  const [autoSort, setAutoSort] = useState(config.autoSort);
  const [domains, setDomains] = useState<string[]>(config.allowedDomains);
  const [token, setToken] = useState<string | null>(config.token);
  const [newDomain, setNewDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const inboundAddress =
    token && config.inboundDomain ? `${token}@${config.inboundDomain}` : null;

  function addDomain() {
    const value = newDomain.trim().toLowerCase().replace(/^[@*]+\.?/, "");
    if (!value) return;
    if (domains.includes(value)) {
      setNewDomain("");
      return;
    }
    setDomains((prev) => [...prev, value]);
    setNewDomain("");
  }

  function removeDomain(index: number) {
    setDomains((prev) => prev.filter((_, i) => i !== index));
  }

  function copyAddress() {
    if (!inboundAddress) return;
    navigator.clipboard.writeText(inboundAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSave() {
    setSaving(true);
    const result = await updateEmailIngestion(schoolId, {
      enabled,
      autoSort,
      allowedDomains: domains,
    });
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    if (result.token) setToken(result.token);
    toast.success("Email settings saved");
  }

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-ink">Email Ingestion</h2>
        <p className="text-sm text-muted-foreground">
          Forward school emails to a private address and they become documents
          automatically — attachments and the message body, sorted by AI.
        </p>
      </div>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="email-ingestion-enabled">Enable email ingestion</Label>
            <p className="text-xs text-muted-foreground">
              Accept emails at your school&apos;s private inbound address.
            </p>
          </div>
          <Switch
            id="email-ingestion-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {inboundAddress && (
          <div className="space-y-2">
            <Label>Your inbound address</Label>
            <div className="flex gap-2">
              <Input
                readOnly
                value={inboundAddress}
                className="font-mono"
                onFocus={(e) => e.target.select()}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copyAddress}
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
              Forward or send school emails here. Only senders from the allowed
              domains below are accepted.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label>Allowed sender domains</Label>
          <div className="space-y-2">
            {domains.map((domain, i) => (
              <div key={domain} className="flex items-center gap-2">
                <span className="flex-1 rounded-full border border-border px-3.5 py-1.5 text-sm text-ink font-mono">
                  @{domain}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 shrink-0 p-0"
                  onClick={() => removeDomain(i)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {domains.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No domains yet. Add one to accept mail (e.g. lincolnhigh.org).
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="lincolnhigh.org"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addDomain();
                }
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={addDomain}
              disabled={!newDomain.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Only emails whose sender address ends with one of these domains are
            ingested. Subdomains are matched too.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="auto-sort">Auto-sort into categories &amp; folders</Label>
            <p className="text-xs text-muted-foreground">
              Let AI file unsorted documents into your existing categories and
              folders.
            </p>
          </div>
          <Switch id="auto-sort" checked={autoSort} onCheckedChange={setAutoSort} />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving && <LogoSpinner className="mr-2" />}
            Save email settings
          </Button>
        </div>
      </div>
    </section>
  );
}
