"use client";

import { useState, useCallback } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  generateBulkDocuments,
  generateBulkEvents,
  generateBulkAnnouncements,
  generateBulkCategories,
  generateBulkFolders,
  type BulkDocumentRow,
  type BulkEventRow,
  type BulkAnnouncementRow,
  type BulkCategoryRow,
  type BulkFolderRow,
} from "@/actions/dev-panel";
import {
  DOCUMENT_TITLES,
  DOCUMENT_DESCRIPTIONS,
  EVENT_TITLES,
  EVENT_DESCRIPTIONS,
  EVENT_LOCATIONS,
  ANNOUNCEMENT_TITLES,
  ANNOUNCEMENT_CONTENT,
  CATEGORY_NAMES,
  CATEGORY_DESCRIPTIONS,
  FOLDER_NAMES,
  FOLDER_CHILDREN,
  DOCUMENT_TAGS,
  COLORS,
  pickRandom,
  pickRandomN,
  randomDateInRange,
  randomTime,
  randomInt,
} from "../lib/school-content";

interface GenerateTabProps {
  schoolId: string;
}

interface Counts {
  categories: number;
  folders: number;
  documents: number;
  events: number;
  announcements: number;
}

type Step = keyof Counts;

const STEP_LABELS: Record<Step, string> = {
  categories: "Categories",
  folders: "Folders",
  documents: "Documents",
  events: "Events",
  announcements: "Announcements",
};

const STEP_ORDER: Step[] = ["categories", "folders", "documents", "events", "announcements"];

export function GenerateTab({ schoolId }: GenerateTabProps) {
  const [counts, setCounts] = useState<Counts>({
    categories: 5,
    folders: 3,
    documents: 5,
    events: 15,
    announcements: 5,
  });
  const [generating, setGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step | null>(null);
  const [results, setResults] = useState<Record<string, { success: boolean; count?: number; error?: string }>>({});

  const updateCount = (key: Step, value: string) => {
    const max = key === "documents" ? 20 : 200;
    const num = Math.max(0, Math.min(max, parseInt(value) || 0));
    setCounts((prev) => ({ ...prev, [key]: num }));
  };

  const buildCategoryRows = (count: number): BulkCategoryRow[] => {
    const names = pickRandomN(CATEGORY_NAMES, count);
    return names.map((name) => ({
      name,
      description: CATEGORY_DESCRIPTIONS[name] || null,
      color: pickRandom(COLORS),
    }));
  };

  const buildFolderRows = (count: number): { roots: BulkFolderRow[]; childrenMap: Record<string, string[]> } => {
    const names = pickRandomN(FOLDER_NAMES, count);
    const roots: BulkFolderRow[] = names.map((name) => ({ name }));
    const childrenMap: Record<string, string[]> = {};
    for (const name of names) {
      if (FOLDER_CHILDREN[name]) {
        childrenMap[name] = FOLDER_CHILDREN[name];
      }
    }
    return { roots, childrenMap };
  };

  const buildDocumentRows = (
    count: number,
    categoryIds: string[],
    folderIds: string[]
  ): BulkDocumentRow[] => {
    const rows: BulkDocumentRow[] = [];
    for (let i = 0; i < count; i++) {
      const idx = i % DOCUMENT_TITLES.length;
      const suffix = i >= DOCUMENT_TITLES.length ? ` (${Math.floor(i / DOCUMENT_TITLES.length) + 1})` : "";
      rows.push({
        title: DOCUMENT_TITLES[idx] + suffix,
        description: DOCUMENT_DESCRIPTIONS[idx] || "",
        file_name: `${DOCUMENT_TITLES[idx].toLowerCase().replace(/\s+/g, "-")}${suffix.replace(/\s+/g, "")}.pdf`,
        file_type: pickRandom(["pdf", "docx", "xlsx", "txt"]),
        tags: pickRandomN(DOCUMENT_TAGS, randomInt(1, 4)),
        category_id: categoryIds.length > 0 ? pickRandom(categoryIds) : null,
        folder_id: folderIds.length > 0 ? pickRandom(folderIds) : null,
      });
    }
    return rows;
  };

  const buildEventRows = (count: number): BulkEventRow[] => {
    const eventTypes = Object.keys(EVENT_TITLES);
    const rows: BulkEventRow[] = [];
    for (let i = 0; i < count; i++) {
      const type = pickRandom(eventTypes);
      const titles = EVENT_TITLES[type];
      const descriptions = EVENT_DESCRIPTIONS[type];
      const titleIdx = i % titles.length;
      const startHour = randomInt(8, 16);
      rows.push({
        title: titles[titleIdx],
        description: descriptions[titleIdx] || "",
        date: randomDateInRange(-7, 90),
        start_time: `${startHour.toString().padStart(2, "0")}:${Math.random() < 0.5 ? "00" : "30"}`,
        end_time: `${Math.min(startHour + randomInt(1, 3), 20).toString().padStart(2, "0")}:00`,
        location: pickRandom(EVENT_LOCATIONS),
        event_type: type,
      });
    }
    return rows;
  };

  const buildAnnouncementRows = (count: number): BulkAnnouncementRow[] => {
    const rows: BulkAnnouncementRow[] = [];
    for (let i = 0; i < count; i++) {
      // Distribution: 60% normal, 25% important, 15% urgent
      const rand = Math.random();
      const priority = rand < 0.6 ? "normal" : rand < 0.85 ? "important" : "urgent";
      const titles = ANNOUNCEMENT_TITLES[priority];
      const contents = ANNOUNCEMENT_CONTENT[priority];
      const idx = i % titles.length;

      // 70% published, 20% draft, 10% scheduled
      const statusRand = Math.random();
      const status = statusRand < 0.7 ? "published" : statusRand < 0.9 ? "draft" : "scheduled";

      rows.push({
        title: titles[idx],
        content: contents[idx],
        priority,
        pinned: priority === "urgent" && Math.random() < 0.5,
        status,
      });
    }
    return rows;
  };

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setResults({});
    let categoryIds: string[] = [];
    let folderIds: string[] = [];

    for (const step of STEP_ORDER) {
      if (counts[step] === 0) continue;
      setCurrentStep(step);

      try {
        if (step === "categories") {
          const rows = buildCategoryRows(counts.categories);
          const result = await generateBulkCategories(schoolId, rows);
          categoryIds = result.ids || [];
          setResults((prev) => ({ ...prev, categories: { success: !!result.success, count: categoryIds.length, error: result.error } }));
        } else if (step === "folders") {
          const { roots, childrenMap } = buildFolderRows(counts.folders);
          const rootResult = await generateBulkFolders(schoolId, roots);
          folderIds = rootResult.ids || [];

          // Insert children for root folders that have them
          if (Object.keys(childrenMap).length > 0 && folderIds.length > 0) {
            // We need to get the root folder IDs with names to map children
            // For simplicity, just add flat children to random root folders
            const childRows: BulkFolderRow[] = [];
            for (const [, children] of Object.entries(childrenMap)) {
              const parentId = pickRandom(folderIds);
              for (const childName of children) {
                childRows.push({ name: childName, parent_id: parentId });
              }
            }
            if (childRows.length > 0) {
              const childResult = await generateBulkFolders(schoolId, childRows);
              folderIds.push(...(childResult.ids || []));
            }
          }

          setResults((prev) => ({ ...prev, folders: { success: true, count: folderIds.length } }));
        } else if (step === "documents") {
          const rows = buildDocumentRows(counts.documents, categoryIds, folderIds);
          const result = await generateBulkDocuments(schoolId, rows);
          setResults((prev) => ({ ...prev, documents: { success: !!result.success, count: result.count, error: result.error } }));
        } else if (step === "events") {
          const rows = buildEventRows(counts.events);
          const result = await generateBulkEvents(schoolId, rows);
          setResults((prev) => ({ ...prev, events: { success: !!result.success, count: result.count, error: result.error } }));
        } else if (step === "announcements") {
          const rows = buildAnnouncementRows(counts.announcements);
          const result = await generateBulkAnnouncements(schoolId, rows);
          setResults((prev) => ({ ...prev, announcements: { success: !!result.success, count: result.count, error: result.error } }));
        }
      } catch (err) {
        setResults((prev) => ({
          ...prev,
          [step]: { success: false, error: err instanceof Error ? err.message : "Unknown error" },
        }));
      }
    }

    setCurrentStep(null);
    setGenerating(false);
  }, [counts, schoolId]);

  const totalItems = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold metallic-text mb-1">Generate Test Data</h3>
        <p className="text-xs text-muted-foreground">
          Specify how many of each entity type to create. Documents use AI to generate
          realistic content (max 20, takes longer).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {STEP_ORDER.map((step) => (
          <div key={step} className="space-y-1.5">
            <Label htmlFor={`gen-${step}`} className="text-xs">
              {STEP_LABELS[step]}
              {step === "documents" && (
                <span className="text-muted-foreground ml-1">(AI)</span>
              )}
            </Label>
            <Input
              id={`gen-${step}`}
              type="number"
              min={0}
              max={step === "documents" ? 20 : 200}
              value={counts[step]}
              onChange={(e) => updateCount(step, e.target.value)}
              disabled={generating}
              className="h-8 text-sm"
            />
          </div>
        ))}
      </div>

      <Button
        onClick={handleGenerate}
        disabled={generating || totalItems === 0}
        className="w-full"
      >
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            {currentStep === "documents"
              ? "Generating documents with AI..."
              : `Generating ${currentStep ? STEP_LABELS[currentStep] : ""}...`}
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            Generate {totalItems} Items
          </>
        )}
      </Button>

      {/* Results */}
      {Object.keys(results).length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">Results</h4>
          {STEP_ORDER.map((step) => {
            const r = results[step];
            if (!r) return null;
            return (
              <div
                key={step}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-xs"
              >
                <span>{STEP_LABELS[step]}</span>
                {r.success ? (
                  <Badge variant="outline" className="text-green-500 border-green-500/30">
                    {r.count} created
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-destructive border-destructive/30">
                    Error: {r.error}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
