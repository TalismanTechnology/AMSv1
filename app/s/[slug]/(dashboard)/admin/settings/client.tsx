"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  X,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  School,
  Sparkles,
  Mail,
  Plug,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LogoSpinner } from "@/components/logo-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TimeAgo } from "@/components/ui/time-ago";
import { updateSettings, updateEmailIngestion } from "@/actions/settings";
import {
  syncBlackbaudRoster,
} from "@/actions/blackbaud";
import {
  BlackbaudCalendarFeeds,
  type FeedWithMapping,
} from "@/components/admin/blackbaud-calendar-feeds";
import { calendarColorClasses } from "@/lib/event-calendars";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { EventCalendar, Settings } from "@/lib/types";
import type { InboundAddresses } from "@/lib/email/addresses";

export interface EmailIngestionLogEntry {
  id: string;
  fromAddress: string | null;
  subject: string | null;
  status: string;
  reason: string | null;
  documentCount: number;
  createdAt: string;
}

interface EmailIngestionConfig extends InboundAddresses {
  enabled: boolean;
  autoSort: boolean;
  allowedDomains: string[];
  /** Set when the addresses couldn't be loaded, saying why. */
  addressesError: string | null;
  inboundDomain: string | null;
  recent: EmailIngestionLogEntry[];
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
  // Calendar feeds are independent of the OAuth connection above: Blackbaud
  // exposes school calendars as iCal subscriptions, not through the SKY API,
  // so a school can sync events without authorizing the app at all.
  calendarFeeds: FeedWithMapping[];
  eventCalendars: EventCalendar[];
}

const SETTINGS_TABS = ["general", "assistant", "email", "blackbaud"] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

// Tabs whose fields are saved by the header's save button. Email has its own
// save button and Blackbaud saves as you go.
const SAVED_BY_HEADER: readonly SettingsTab[] = ["general", "assistant"];

function isSettingsTab(value: string | null | undefined): value is SettingsTab {
  return SETTINGS_TABS.includes(value as SettingsTab);
}

interface SettingsClientProps {
  settings: Settings;
  schoolId: string;
  schoolSlug: string;
  emailIngestion: EmailIngestionConfig;
  blackbaud: BlackbaudConfig;
  blackbaudCallback: BlackbaudCallbackResult;
  /** The ?tab= value from the URL, so a refresh keeps the open tab. */
  initialTab?: string;
}

export function SettingsClient({
  settings,
  schoolId,
  schoolSlug,
  emailIngestion,
  blackbaud,
  blackbaudCallback,
  initialTab,
}: SettingsClientProps) {
  // Returning from Blackbaud's consent screen opens the Blackbaud tab so the
  // outcome notice is visible.
  const [tab, setTab] = useState<SettingsTab>(
    blackbaudCallback
      ? "blackbaud"
      : isSettingsTab(initialTab)
        ? initialTab
        : "general"
  );
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
  const [newQuestion, setNewQuestion] = useState("");
  const [saving, setSaving] = useState(false);
  async function handleSave() {
    setSaving(true);
    const result = await updateSettings(schoolId, {
      school_name: schoolName.trim() || "AskMySchool",
      contact_info: contactInfo.trim() || null,
      custom_system_prompt: customPrompt.trim() || null,
      ai_temperature: temperature,
      suggested_questions: questions,
      welcome_message: welcomeMessage.trim() || null,
      disable_animations: disableAnimations,
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

  function changeTab(value: string) {
    if (!isSettingsTab(value)) return;
    setTab(value);
    const url = new URL(window.location.href);
    if (value === "general") url.searchParams.delete("tab");
    else url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url.toString());
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 pb-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-[-0.01em]">
            Settings
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure your school&apos;s AskMySchool instance.
          </p>
        </div>
        {SAVED_BY_HEADER.includes(tab) && (
          <Button onClick={handleSave} disabled={saving}>
            {saving && <LogoSpinner className="mr-2" />}
            Save settings
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={changeTab} className="gap-8">
        <div className="overflow-x-auto border-b border-border">
          <TabsList variant="line" className="h-10">
            <TabsTrigger value="general" className="px-3">
              <School />
              General
            </TabsTrigger>
            <TabsTrigger value="assistant" className="px-3">
              <Sparkles />
              Assistant
            </TabsTrigger>
            <TabsTrigger value="email" className="px-3">
              <Mail />
              Email
            </TabsTrigger>
            <TabsTrigger value="blackbaud" className="px-3">
              <Plug />
              Blackbaud
            </TabsTrigger>
          </TabsList>
        </div>

        {/* forceMount keeps each tab's unsaved edits when switching away. */}
        <TabsContent
          value="general"
          forceMount
          className="space-y-12 data-[state=inactive]:hidden"
        >
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
        </TabsContent>

        <TabsContent
          value="assistant"
          forceMount
          className="space-y-12 data-[state=inactive]:hidden"
        >
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
        </TabsContent>

        <TabsContent
          value="email"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <EmailIngestionSection
            schoolId={schoolId}
            config={emailIngestion}
          />
        </TabsContent>

        <TabsContent
          value="blackbaud"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <BlackbaudSection
            schoolId={schoolId}
            schoolSlug={schoolSlug}
            config={blackbaud}
            callback={blackbaudCallback}
          />
        </TabsContent>
      </Tabs>
    </div>
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
  const [rosterCount, setRosterCount] = useState(config.rosterCount);
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

        <p className="text-xs text-muted-foreground">
          Parents sign in with Blackbaud. Only accounts your Blackbaud records
          mark as parents can get in.
        </p>

        <BlackbaudCalendarFeeds
          schoolId={schoolId}
          schoolSlug={schoolSlug}
          feeds={config.calendarFeeds}
          calendars={config.eventCalendars}
        />
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
  const [addresses, setAddresses] = useState<InboundAddresses>(config);
  const [newDomain, setNewDomain] = useState("");
  const [saving, setSaving] = useState(false);

  const addressFor = (t: string | null) =>
    t && config.inboundDomain ? `${t}@${config.inboundDomain}` : null;
  const inboundAddress = addressFor(addresses.wholeSchoolToken);

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
    if (result.addresses) setAddresses(result.addresses);
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
              Accept emails at your school&apos;s private inbound addresses.
            </p>
          </div>
          <Switch
            id="email-ingestion-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
        </div>

        {(enabled || addresses.wholeSchoolToken) && (
          <div className="space-y-4 rounded-xl border border-border p-4">
            <div className="space-y-1">
              <Label>Where to send emails</Label>
              <p className="text-xs text-muted-foreground">
                Forward or send school emails to these addresses. Each one
                files what it receives into its own division.{" "}
                {domains.length
                  ? "Only senders from the allowed domains below are accepted."
                  : "Anyone who has an address can add documents, so keep them private."}
              </p>
            </div>
            {config.addressesError ? (
              <AddressNotice>{config.addressesError}</AddressNotice>
            ) : !config.inboundDomain ? (
              <AddressNotice>
                Addresses can&apos;t be shown because INBOUND_EMAIL_DOMAIN
                isn&apos;t set on the server. Add it under Vercel → Settings →
                Environment Variables and redeploy.
              </AddressNotice>
            ) : !inboundAddress ? (
              <AddressNotice>
                Save email settings to create your addresses.
              </AddressNotice>
            ) : (
              <>
                {!enabled && (
                  <AddressNotice>
                    Email ingestion is off, so mail sent to these addresses is
                    turned away until you switch it on and save.
                  </AddressNotice>
                )}
                <AddressRow
                  label="Whole school"
                  hint="The AI decides which division each email belongs to."
                  address={inboundAddress}
                />
                {addresses.divisions.map((division) => {
                  const token = addresses.divisionAddresses.find(
                    (a) => a.divisionId === division.id
                  )?.token;
                  const address = token ? addressFor(token) : null;
                  if (!address) return null;
                  return (
                    <AddressRow
                      key={division.id}
                      label={division.name}
                      hint={`Everything sent here is filed under ${division.name}.`}
                      color={division.color}
                      address={address}
                    />
                  );
                })}
              </>
            )}
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
                No domains: mail from any sender is accepted. Add one (e.g.
                lincolnhigh.org) to only accept your school&apos;s staff.
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
            When set, only emails whose sender address ends with one of these
            domains are ingested. Subdomains are matched too.
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

        <RecentEmails entries={config.recent} />
      </div>
    </section>
  );
}

/** A short, highlighted message in place of the addresses. */
function AddressNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-ink-soft">
      {children}
    </p>
  );
}

function AddressRow({
  label,
  hint,
  color,
  address,
}: {
  label: string;
  /** Where mail sent to this address ends up. */
  hint?: string;
  /** Division color; omitted for the whole-school address. */
  color?: string;
  address: string;
}) {
  const [copied, setCopied] = useState(false);

  function copyAddress() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
        {color && (
          <span
            className={cn("h-2 w-2 rounded-full", calendarColorClasses(color).dot)}
          />
        )}
        {label}
        {hint && <span className="font-normal text-muted-foreground">· {hint}</span>}
      </p>
      <div className="flex gap-2">
        <Input
          readOnly
          value={address}
          aria-label={`${label} inbound address`}
          className="font-mono"
          onFocus={(e) => e.target.select()}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={copyAddress}
          className="shrink-0"
          aria-label={`Copy ${label} address`}
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

const EMAIL_STATUS: Record<string, { label: string; className: string }> = {
  accepted: { label: "Added", className: "bg-success/15 text-success" },
  processing: { label: "Processing", className: "bg-amber-500/15 text-amber-500" },
  rejected_domain: {
    label: "Sender not allowed",
    className: "bg-destructive/15 text-destructive",
  },
  rejected_disabled: {
    label: "Ingestion off",
    className: "bg-secondary text-secondary-foreground",
  },
  duplicate: { label: "Duplicate", className: "bg-secondary text-secondary-foreground" },
  error: { label: "Failed", className: "bg-destructive/15 text-destructive" },
};

function RecentEmails({ entries }: { entries: EmailIngestionLogEntry[] }) {
  return (
    <div className="space-y-2 border-t border-border pt-5">
      <div className="space-y-0.5">
        <Label>Recent emails</Label>
        <p className="text-xs text-muted-foreground">
          The last 20 emails sent to your inbound addresses and what happened
          to each.
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No emails received yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {entries.map((entry) => {
            const status = EMAIL_STATUS[entry.status] ?? {
              label: entry.status,
              className: "bg-secondary text-secondary-foreground",
            };
            const detail =
              entry.status === "accepted"
                ? `${entry.documentCount} document${entry.documentCount === 1 ? "" : "s"} added`
                : entry.reason;
            return (
              <li
                key={entry.id}
                className="flex flex-col gap-1 px-3.5 py-2.5 sm:flex-row sm:items-center sm:gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">
                    {entry.subject || "(no subject)"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {entry.fromAddress ?? "Unknown sender"}
                    {detail ? ` · ${detail}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge className={status.className}>{status.label}</Badge>
                  <span className="text-xs text-muted-foreground">
                    <TimeAgo date={entry.createdAt} />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
