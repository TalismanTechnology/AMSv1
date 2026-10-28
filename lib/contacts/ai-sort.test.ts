import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AI_SORT_MAX_CONTACTS,
  buildAiSortPrompt,
  contactLine,
  parseAiSortAnswer,
  proposeContactFolders,
  sanitizeContactSortProposal,
  type AiSortContact,
  type AiSortGenerate,
} from "./ai-sort";

const contacts: AiSortContact[] = [
  { id: "a", name: "Jane Smith", role: "School Nurse", topics: ["health"], division: null, folder_id: null },
  { id: "b", name: "Tom Lee", role: "Athletic Director", topics: ["athletics"], division: null, folder_id: "f-ath" },
  { id: "c", name: "", role: "Admissions Office", topics: ["admissions"], division: null, folder_id: null },
  { id: "d", name: "Ana Ruiz", role: "Head of Lower School", topics: [], division: "Lower School", folder_id: null },
];
const folders = [{ id: "f-ath", name: "Athletics" }];

test("contact lines carry name, role, division and topic labels but no contact details", () => {
  const line = contactLine({ ...contacts[0], division: "Upper School" }, 1);
  assert.equal(line, "1. Jane Smith — School Nurse | Division: Upper School | Topics: Health & nurse");
  const prompt = buildAiSortPrompt(contacts, folders);
  assert.match(prompt, /- "Athletics"/);
  assert.match(prompt, /4\. Ana Ruiz — Head of Lower School \| Division: Lower School/);
  assert.doesNotMatch(prompt, /@|\d{3}-\d{4}/);
  assert.match(buildAiSortPrompt(contacts, []), /no folders yet/);
});

test("the model is asked once and its numbered answer mapped back to ids", async () => {
  const seen: Parameters<AiSortGenerate>[0][] = [];
  const generate: AiSortGenerate = async (args) => {
    seen.push(args);
    return {
      folders: ["Health Services", "Athletics", "Admissions", "Lower School Office"],
      assignments: [
        { n: 1, folder: "Health Services" },
        { n: 2, folder: "athletics" },
        { n: 3, folder: "Admissions" },
        { n: 4, folder: "Lower School Office" },
        { n: 9, folder: "Admissions" }, // no such contact
        { n: 1.5, folder: "Admissions" }, // not a number we gave
        { n: 3, folder: "Made Up" }, // not in the folder list
      ],
    };
  };
  const proposal = await proposeContactFolders({ contacts, existingFolders: folders }, { generate });
  assert.equal(seen.length, 1);
  assert.match(seen[0].system, /Reuse an existing folder name/);
  assert.match(seen[0].prompt, /Jane Smith/);
  assert.deepEqual(proposal.assignments, [
    { contactId: "a", folder: "Health Services" },
    { contactId: "b", folder: "athletics" },
    { contactId: "c", folder: "Admissions" },
    { contactId: "d", folder: "Lower School Office" },
  ]);
});

test("no contacts → no model call", async () => {
  let called = false;
  const result = await proposeContactFolders(
    { contacts: [], existingFolders: [] },
    { generate: async () => ((called = true), { folders: [], assignments: [] }) }
  );
  assert.deepEqual(result, { assignments: [] });
  assert.equal(called, false);
});

test("at most AI_SORT_MAX_CONTACTS go to the model", async () => {
  const many = Array.from({ length: AI_SORT_MAX_CONTACTS + 5 }, (_, i) => ({
    id: `c${i}`, name: `Person ${i}`, role: "Teacher", topics: [],
  }));
  let lines = 0;
  await proposeContactFolders(
    { contacts: many, existingFolders: [] },
    { generate: async ({ prompt }) => ((lines = prompt.split("\n").filter((l) => /^\d+\. /.test(l)).length), { folders: [], assignments: [] }) }
  );
  assert.equal(lines, AI_SORT_MAX_CONTACTS);
});

test("a model failure is thrown to the caller", async () => {
  await assert.rejects(
    proposeContactFolders({ contacts, existingFolders: [] }, { generate: async () => { throw new Error("503"); } }),
    /503/
  );
});

test("an empty folder list accepts folders named in assignments", () => {
  const p = parseAiSortAnswer({ folders: [], assignments: [{ n: 1, folder: " Health " }] }, contacts);
  assert.deepEqual(p.assignments, [{ contactId: "a", folder: "Health" }]);
});

test("sanitize: reuses existing folders by name, skips no-op moves, unknown ids and repeats", () => {
  const plan = sanitizeContactSortProposal({
    contacts,
    folders,
    proposal: {
      assignments: [
        { contactId: "a", folder: "Health Services" },
        { contactId: "b", folder: "ATHLETICS" }, // already there
        { contactId: "c", folder: "Admissions" },
        { contactId: "d", folder: "athletics" },
        { contactId: "a", folder: "Admissions" }, // repeat
        { contactId: "zzz", folder: "Admissions" }, // another school's / unknown
        { contactId: "c", folder: "   " },
      ],
    },
  });
  assert.deepEqual(
    plan.moves.map((m) => [m.contactId, m.folder, m.label]),
    [
      ["a", "Health Services", "Jane Smith"],
      ["c", "Admissions", "Admissions Office"],
      ["d", "Athletics", "Ana Ruiz"],
    ]
  );
  assert.deepEqual(
    plan.folders.map((f) => [f.name, f.existingId, f.count]),
    [
      ["Admissions", null, 1],
      ["Athletics", "f-ath", 1],
      ["Health Services", null, 1],
    ]
  );
  assert.deepEqual(
    plan.skipped.map((s) => [s.contactId, s.reason]).sort(),
    [
      ["a", "assigned twice"],
      ["b", "already in that folder"],
      ["c", "assigned twice"],
      ["zzz", "not a contact of this school"],
    ].sort()
  );
});

test("sanitize: keeps only the most used folders", () => {
  const plan = sanitizeContactSortProposal({
    contacts,
    folders,
    maxFolders: 1,
    proposal: {
      assignments: [
        { contactId: "a", folder: "Front Office" },
        { contactId: "c", folder: "Front Office" },
        { contactId: "d", folder: "Lower School" },
      ],
    },
  });
  assert.deepEqual(plan.folders.map((f) => f.name), ["Front Office"]);
  assert.deepEqual(plan.skipped, [{ contactId: "d", reason: "too many folders proposed" }]);
});
