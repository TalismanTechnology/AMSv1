import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local (Next.js does this automatically, but tsx doesn't)
const envPath = resolve(process.cwd(), ".env.local");
try {
  const envFile = readFileSync(envPath, "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  console.warn("Warning: Could not read .env.local — make sure env vars are set");
}

import { createAdminClient } from "@/lib/supabase/admin";
import { splitTextIntoChunks } from "@/lib/ai/chunking";
import { generateEmbeddings } from "@/lib/ai/embeddings";
import { generateSummary } from "@/lib/ai/summary";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SCHOOL_NAME = "Westfield Academy";
const SCHOOL_SLUG = "westfield";
const CHUNK_BATCH_SIZE = 5;

const args = process.argv.slice(2);
const shouldClean = args.includes("--clean");
const skipDocuments = args.includes("--skip-documents");
const concurrencyArg = args.find((a) => a.startsWith("--concurrency="));
const CONCURRENCY = concurrencyArg
  ? parseInt(concurrencyArg.split("=")[1])
  : 3;

// 30-minute safety timeout
const timer = setTimeout(() => {
  console.error("TIMEOUT: Script exceeded 30 minutes. Exiting.");
  process.exit(2);
}, 30 * 60 * 1000);
timer.unref();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      if (attempt === maxRetries) throw err;
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `  [retry ${attempt + 1}/${maxRetries}] ${label}: ${msg} — waiting ${Math.round(delay)}ms`
      );
      await sleep(delay);
    }
  }
  throw new Error("Unreachable");
}

// ---------------------------------------------------------------------------
// Manifests
// ---------------------------------------------------------------------------

interface CategoryDef {
  name: string;
  description: string;
  color: string;
}

const CATEGORIES: CategoryDef[] = [
  { name: "Academic Policies", description: "Grading, curriculum, and academic standards", color: "#6366f1" },
  { name: "Student Life", description: "Clubs, extracurriculars, and student activities", color: "#8b5cf6" },
  { name: "Health & Safety", description: "Health protocols, emergency procedures, safety guidelines", color: "#ef4444" },
  { name: "Transportation", description: "Bus routes, carpool, drop-off/pickup procedures", color: "#f59e0b" },
  { name: "Athletics", description: "Sports teams, schedules, eligibility, and facilities", color: "#22c55e" },
  { name: "Administration", description: "Enrollment, registration, tuition, and school operations", color: "#3b82f6" },
  { name: "Technology", description: "Device policies, acceptable use, digital learning tools", color: "#06b6d4" },
  { name: "Special Programs", description: "Gifted, special education, ESL, and intervention services", color: "#ec4899" },
  { name: "Nutrition & Dining", description: "Lunch menus, cafeteria policies, dietary accommodations", color: "#f97316" },
  { name: "Parent Resources", description: "Volunteer info, PTA, communication guides, parent handbooks", color: "#14b8a6" },
];

interface FolderDef {
  name: string;
  children: string[];
}

const FOLDERS: FolderDef[] = [
  { name: "2025-2026 School Year", children: ["First Semester", "Second Semester"] },
  { name: "Elementary School (K-5)", children: ["Kindergarten", "Grades 1-5"] },
  { name: "Middle School (6-8)", children: ["Grade 6", "Grade 7-8"] },
  { name: "High School (9-12)", children: ["Freshman-Sophomore", "Junior-Senior"] },
  { name: "Policies & Handbooks", children: ["Student Handbook", "Staff Policies"] },
  { name: "Health & Safety", children: ["Emergency Plans", "Health Forms"] },
  { name: "Athletics & Activities", children: ["Fall Sports", "Spring Sports"] },
  { name: "Financial Information", children: ["Tuition & Fees", "Financial Aid"] },
  { name: "Curriculum & Academics", children: ["Course Catalogs", "Testing & Assessment"] },
  { name: "Community & Events", children: ["PTA", "School Events"] },
];

interface EventDef {
  title: string;
  description: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  event_type: string;
}

const EVENTS: EventDef[] = [
  { title: "New Teacher Orientation", description: "Orientation session for new faculty and staff members", date: "2025-08-04", start_time: "08:00", end_time: "15:00", location: "Main Office Conference Room", event_type: "meeting" },
  { title: "Back-to-School Night (Elementary)", description: "Meet your child's teacher and learn about the year ahead", date: "2025-08-14", start_time: "18:00", end_time: "20:00", location: "Elementary Wing", event_type: "meeting" },
  { title: "First Day of School", description: "First day of the 2025-2026 school year for all students", date: "2025-08-18", start_time: "07:45", end_time: "14:30", location: "Westfield Academy Campus", event_type: "academic" },
  { title: "Back-to-School Night (Middle & High)", description: "Follow your student's schedule and meet all their teachers", date: "2025-08-21", start_time: "18:00", end_time: "20:30", location: "Main Gymnasium", event_type: "meeting" },
  { title: "Labor Day - No School", description: "School closed for Labor Day", date: "2025-09-01", start_time: null, end_time: null, location: null, event_type: "holiday" },
  { title: "Fall Picture Day", description: "Individual and class photos for all students", date: "2025-09-10", start_time: "08:00", end_time: "14:00", location: "Auditorium Lobby", event_type: "general" },
  { title: "PTA Welcome Meeting", description: "First PTA meeting of the year - all parents welcome", date: "2025-09-16", start_time: "19:00", end_time: "20:30", location: "Media Center", event_type: "meeting" },
  { title: "Varsity Football Home Opener", description: "Eagles varsity football vs. Ridgewood High", date: "2025-09-19", start_time: "19:00", end_time: "21:30", location: "Westfield Stadium", event_type: "sports" },
  { title: "Homecoming Week", description: "Spirit Week activities Mon-Fri leading up to the homecoming game", date: "2025-09-22", start_time: "07:45", end_time: "14:30", location: "Westfield Academy Campus", event_type: "general" },
  { title: "Homecoming Game and Dance", description: "Varsity football game followed by the homecoming dance", date: "2025-09-26", start_time: "19:00", end_time: "23:00", location: "Stadium and Gymnasium", event_type: "sports" },
  { title: "Fall Book Fair", description: "Scholastic book fair - runs all week through Oct 10", date: "2025-10-06", start_time: "08:00", end_time: "16:00", location: "Library Media Center", event_type: "academic" },
  { title: "Columbus Day - No School", description: "School closed for Columbus Day / Indigenous Peoples Day", date: "2025-10-13", start_time: null, end_time: null, location: null, event_type: "holiday" },
  { title: "High School College Fair", description: "Representatives from 50+ colleges and universities", date: "2025-10-16", start_time: "18:00", end_time: "20:00", location: "Main Gymnasium", event_type: "academic" },
  { title: "Fall Concert: Band and Choir", description: "Performances by middle and high school band and choir", date: "2025-10-23", start_time: "19:00", end_time: "20:30", location: "Performing Arts Center", event_type: "arts" },
  { title: "Halloween Parade (Elementary)", description: "Annual costume parade for K-5 students", date: "2025-10-31", start_time: "13:30", end_time: "14:30", location: "Elementary Playground", event_type: "general" },
  { title: "End of First Quarter", description: "Last day of the first grading period", date: "2025-10-31", start_time: "07:45", end_time: "14:30", location: "Westfield Academy Campus", event_type: "academic" },
  { title: "Parent-Teacher Conferences (Elementary)", description: "Half day for students - afternoon/evening conferences", date: "2025-11-06", start_time: "12:00", end_time: "19:00", location: "Elementary Classrooms", event_type: "meeting" },
  { title: "Parent-Teacher Conferences (MS/HS)", description: "Half day for students - afternoon/evening conferences", date: "2025-11-07", start_time: "12:00", end_time: "19:00", location: "Middle & High School Wings", event_type: "meeting" },
  { title: "Veterans Day Assembly", description: "School-wide assembly honoring veterans", date: "2025-11-11", start_time: "09:00", end_time: "10:00", location: "Auditorium", event_type: "general" },
  { title: "Thanksgiving Break", description: "School closed Nov 24-28 for Thanksgiving break", date: "2025-11-24", start_time: null, end_time: null, location: null, event_type: "holiday" },
  { title: "Winter Art Show", description: "Student artwork on display from all grade levels", date: "2025-12-04", start_time: "17:00", end_time: "19:30", location: "Art Gallery & Hallways", event_type: "arts" },
  { title: "Holiday Concert", description: "Winter holiday performance by all music ensembles", date: "2025-12-11", start_time: "19:00", end_time: "20:30", location: "Performing Arts Center", event_type: "arts" },
  { title: "Semester 1 Final Exams Begin (HS)", description: "Modified schedule for high school final exams (Dec 15-19)", date: "2025-12-15", start_time: "08:00", end_time: "12:00", location: "High School Wing", event_type: "academic" },
  { title: "Winter Break Begins", description: "School closed Dec 20 - Jan 2 for winter break", date: "2025-12-20", start_time: null, end_time: null, location: null, event_type: "holiday" },
  { title: "School Resumes", description: "First day back from winter break", date: "2026-01-05", start_time: "07:45", end_time: "14:30", location: "Westfield Academy Campus", event_type: "academic" },
  { title: "Martin Luther King Jr. Day - No School", description: "School closed in observance of MLK Day", date: "2026-01-19", start_time: null, end_time: null, location: null, event_type: "holiday" },
  { title: "Science Fair (Elementary & Middle)", description: "Student science projects on display and judged", date: "2026-01-29", start_time: "17:00", end_time: "19:30", location: "Main Gymnasium", event_type: "academic" },
  { title: "100th Day of School Celebration (K-2)", description: "Fun activities celebrating 100 days of learning", date: "2026-02-03", start_time: "08:00", end_time: "14:30", location: "Elementary Classrooms", event_type: "general" },
  { title: "Groundhog Day Fun Run Fundraiser", description: "Annual fun run to raise money for playground improvements", date: "2026-02-06", start_time: "09:00", end_time: "11:00", location: "Athletic Fields", event_type: "general" },
  { title: "Presidents Day - No School", description: "School closed for Presidents Day", date: "2026-02-16", start_time: null, end_time: null, location: null, event_type: "holiday" },
  { title: "Black History Month Assembly", description: "Student-led assembly celebrating Black History Month", date: "2026-02-20", start_time: "09:00", end_time: "10:00", location: "Auditorium", event_type: "general" },
  { title: "Spring Musical: Grease Jr.", description: "Middle school spring musical production (Fri-Sat shows)", date: "2026-03-06", start_time: "19:00", end_time: "21:00", location: "Performing Arts Center", event_type: "arts" },
  { title: "End of Third Quarter", description: "Last day of the third grading period", date: "2026-03-13", start_time: "07:45", end_time: "14:30", location: "Westfield Academy Campus", event_type: "academic" },
  { title: "Spring Break", description: "School closed Mar 16-20 for spring break", date: "2026-03-16", start_time: null, end_time: null, location: null, event_type: "holiday" },
  { title: "PSAT/SAT School Day", description: "PSAT for 10th graders, SAT for 11th graders", date: "2026-03-25", start_time: "08:00", end_time: "12:30", location: "High School Wing", event_type: "academic" },
  { title: "Kindergarten Registration Open House", description: "Info session for parents enrolling kindergarteners for 2026-2027", date: "2026-04-02", start_time: "09:00", end_time: "11:00", location: "Elementary Office", event_type: "meeting" },
  { title: "Spring Picture Day", description: "Spring individual and class photos", date: "2026-04-08", start_time: "08:00", end_time: "14:00", location: "Auditorium Lobby", event_type: "general" },
  { title: "Earth Day Service Projects", description: "Campus beautification and environmental service projects", date: "2026-04-22", start_time: "08:00", end_time: "14:30", location: "Campus Grounds", event_type: "general" },
  { title: "AP Exams Begin", description: "AP exam window runs May 4-15", date: "2026-05-04", start_time: "08:00", end_time: "12:00", location: "Testing Center", event_type: "academic" },
  { title: "Spring Sports Championship Day", description: "Conference championship events for spring sports", date: "2026-05-09", start_time: "09:00", end_time: "15:00", location: "Athletic Complex", event_type: "sports" },
  { title: "Teacher Appreciation Week", description: "Week-long celebration honoring teachers and staff", date: "2026-05-04", start_time: "07:45", end_time: "14:30", location: "Westfield Academy Campus", event_type: "general" },
  { title: "Spring Concert", description: "End-of-year performances by all music ensembles", date: "2026-05-14", start_time: "19:00", end_time: "20:30", location: "Performing Arts Center", event_type: "arts" },
  { title: "Senior Prom", description: "Senior prom for juniors and seniors", date: "2026-05-16", start_time: "19:00", end_time: "23:00", location: "Grand Ballroom, Westfield Hotel", event_type: "general" },
  { title: "Memorial Day - No School", description: "School closed for Memorial Day", date: "2026-05-25", start_time: null, end_time: null, location: null, event_type: "holiday" },
  { title: "Senior Awards Night", description: "Scholarship and departmental awards for graduating seniors", date: "2026-05-28", start_time: "18:30", end_time: "20:00", location: "Auditorium", event_type: "academic" },
  { title: "Last Day of School (Seniors)", description: "Senior finals completed, last day for Class of 2026", date: "2026-05-29", start_time: "07:45", end_time: "12:00", location: "Westfield Academy Campus", event_type: "academic" },
  { title: "Graduation Ceremony", description: "Commencement ceremony for the Class of 2026", date: "2026-06-01", start_time: "10:00", end_time: "12:00", location: "Westfield Stadium", event_type: "academic" },
  { title: "Elementary Field Day", description: "Fun outdoor activities and games for K-5 students", date: "2026-06-04", start_time: "09:00", end_time: "14:00", location: "Athletic Fields", event_type: "sports" },
  { title: "Last Day of School", description: "Last day of the 2025-2026 school year - half day for all", date: "2026-06-06", start_time: "07:45", end_time: "12:00", location: "Westfield Academy Campus", event_type: "academic" },
  { title: "Summer School Begins", description: "Summer school and credit recovery sessions begin", date: "2026-06-16", start_time: "08:00", end_time: "12:30", location: "Westfield Academy Campus", event_type: "academic" },
];

interface AnnouncementDef {
  title: string;
  content: string;
  priority: string;
  pinned: boolean;
}

const ANNOUNCEMENTS: AnnouncementDef[] = [
  {
    title: "Spring Break Reminder: March 16-20",
    content: "Reminder that school will be closed March 16-20 for spring break. Please make sure to take home all belongings from lockers before Friday, March 13. After-care will not be available during break. Regular schedule resumes Monday, March 23.",
    priority: "important",
    pinned: true,
  },
  {
    title: "Kindergarten Registration Now Open for 2026-2027",
    content: "Registration for the 2026-2027 kindergarten class is now open. Children must be 5 years old by September 1, 2026. Visit the elementary office or our website to complete the registration packet. An open house is scheduled for April 2nd from 9:00-11:00 AM. Bring your child's birth certificate and proof of residency.",
    priority: "normal",
    pinned: false,
  },
  {
    title: "URGENT: Updated Bus Route 7 Effective Immediately",
    content: "Due to road construction on Oak Valley Road, Bus Route 7 has been temporarily rerouted. The Maple Street and Elm Drive stops have been moved to the corner of Maple and 3rd Avenue. Please check the updated route map on the parent portal. This change is expected to last through the end of March. Contact the transportation office at ext. 205 with questions.",
    priority: "urgent",
    pinned: true,
  },
  {
    title: "Spring Musical Tickets on Sale Now",
    content: "Tickets for the middle school spring musical production of Grease Jr. are now available. Show dates are March 6-7 at 7:00 PM in the Performing Arts Center. Tickets are $8 for adults and $5 for students. Purchase online through the school store or at the main office. These shows sell out fast!",
    priority: "normal",
    pinned: false,
  },
  {
    title: "Annual Fun Run Fundraiser - February 6th",
    content: "Our annual Groundhog Day Fun Run is coming up on February 6th! All proceeds support the playground improvement project. Students can collect pledges from family and friends. The top fundraising class wins a pizza party! Volunteer parents are needed to help at water stations - sign up through the PTA volunteer portal.",
    priority: "important",
    pinned: false,
  },
];

interface DocumentDef {
  title: string;
  description: string;
  tags: string[];
  category: string;
  folder: string; // "Root/Child" or "Root"
}

const DOCUMENTS: DocumentDef[] = [
  // --- Academic Policies (20) ---
  { title: "Westfield Academy Student Handbook 2025-2026", description: "Comprehensive handbook covering all student expectations, rules, and procedures", tags: ["handbook", "rules", "conduct"], category: "Academic Policies", folder: "Policies & Handbooks/Student Handbook" },
  { title: "Grading Policy and GPA Calculation Guide", description: "Detailed explanation of grading scales, GPA calculations, and honor roll criteria", tags: ["grading", "gpa", "honor roll"], category: "Academic Policies", folder: "Curriculum & Academics/Testing & Assessment" },
  { title: "Academic Integrity and Plagiarism Policy", description: "Guidelines on academic honesty, cheating, plagiarism, and consequences", tags: ["integrity", "plagiarism", "cheating"], category: "Academic Policies", folder: "Policies & Handbooks/Student Handbook" },
  { title: "Homework and Late Work Policy", description: "Expectations for homework completion, late submission penalties, and extensions", tags: ["homework", "late work", "deadlines"], category: "Academic Policies", folder: "Curriculum & Academics/Course Catalogs" },
  { title: "Advanced Placement (AP) Program Guide", description: "Overview of AP courses offered, exam registration, and AP scholar awards", tags: ["AP", "advanced placement", "college credit"], category: "Academic Policies", folder: "High School (9-12)/Junior-Senior" },
  { title: "Honors Program Eligibility Requirements", description: "Criteria for admission and continuation in the honors track", tags: ["honors", "eligibility", "advanced"], category: "Academic Policies", folder: "High School (9-12)/Freshman-Sophomore" },
  { title: "Middle School Promotion Requirements", description: "Academic criteria students must meet to advance to the next grade", tags: ["promotion", "requirements", "middle school"], category: "Academic Policies", folder: "Middle School (6-8)/Grade 7-8" },
  { title: "Elementary Report Card Explanation Guide", description: "Guide helping parents understand elementary report card standards and marks", tags: ["report card", "elementary", "grades"], category: "Academic Policies", folder: "Elementary School (K-5)/Grades 1-5" },
  { title: "High School Graduation Requirements", description: "Complete list of credits, courses, and service hours needed to graduate", tags: ["graduation", "credits", "diploma"], category: "Academic Policies", folder: "High School (9-12)/Junior-Senior" },
  { title: "Final Exam Schedule and Exemption Policy", description: "When finals are held and which students qualify for exemptions", tags: ["finals", "exams", "exemptions"], category: "Academic Policies", folder: "2025-2026 School Year/First Semester" },
  { title: "Standardized Testing Calendar 2025-2026", description: "Schedule of all MAP, PSAT, SAT, ACT, and state assessments", tags: ["testing", "standardized", "SAT", "ACT"], category: "Academic Policies", folder: "Curriculum & Academics/Testing & Assessment" },
  { title: "Course Registration Guide for 2025-2026", description: "Step-by-step instructions for selecting courses and electives", tags: ["registration", "courses", "electives"], category: "Academic Policies", folder: "Curriculum & Academics/Course Catalogs" },
  { title: "Attendance Policy and Excused Absence Procedures", description: "Rules for attendance, tardy counts, and how to excuse an absence", tags: ["attendance", "absence", "tardy"], category: "Academic Policies", folder: "Policies & Handbooks/Student Handbook" },
  { title: "Kindergarten Readiness and Curriculum Overview", description: "What incoming kindergarteners will learn and how to prepare", tags: ["kindergarten", "readiness", "curriculum"], category: "Academic Policies", folder: "Elementary School (K-5)/Kindergarten" },
  { title: "Dual Enrollment Program with Westfield Community College", description: "Procedures for high school students taking college courses", tags: ["dual enrollment", "college", "credits"], category: "Academic Policies", folder: "High School (9-12)/Junior-Senior" },
  { title: "Summer Reading List 2025", description: "Required and recommended summer reading for all grade levels", tags: ["summer reading", "books", "literacy"], category: "Academic Policies", folder: "Curriculum & Academics/Course Catalogs" },
  { title: "Academic Probation and Intervention Plan", description: "What happens when a student falls below the GPA threshold", tags: ["probation", "intervention", "academic support"], category: "Academic Policies", folder: "Curriculum & Academics/Testing & Assessment" },
  { title: "Parent-Teacher Conference Guidelines", description: "How conferences are scheduled, what to expect, and preparation tips", tags: ["conferences", "parents", "teachers"], category: "Academic Policies", folder: "Community & Events/PTA" },
  { title: "Field Trip Policy and Permission Form Guide", description: "Policies for school-sponsored field trips and required forms", tags: ["field trips", "permission", "off-campus"], category: "Academic Policies", folder: "Policies & Handbooks/Student Handbook" },
  { title: "Library Media Center Policies", description: "Checkout limits, overdue rules, digital resource access, and study room usage", tags: ["library", "media center", "books"], category: "Academic Policies", folder: "Curriculum & Academics/Course Catalogs" },

  // --- Student Life (15) ---
  { title: "Student Club Directory 2025-2026", description: "Complete list of student clubs with advisors, meeting times, and descriptions", tags: ["clubs", "activities", "extracurricular"], category: "Student Life", folder: "Community & Events/School Events" },
  { title: "Student Government Constitution and Bylaws", description: "Rules governing student council elections, roles, and responsibilities", tags: ["student government", "elections", "leadership"], category: "Student Life", folder: "Policies & Handbooks/Student Handbook" },
  { title: "Community Service and Volunteer Hours Tracking", description: "Requirements for service hours and how to log and verify them", tags: ["service hours", "volunteer", "community"], category: "Student Life", folder: "Community & Events/PTA" },
  { title: "School Dance and Social Event Guidelines", description: "Rules and expectations for school-sponsored social events", tags: ["dances", "events", "social"], category: "Student Life", folder: "Community & Events/School Events" },
  { title: "Senior Year Milestone Calendar", description: "Key dates for seniors: cap/gown orders, prom, yearbook, graduation rehearsal", tags: ["senior", "graduation", "prom", "yearbook"], category: "Student Life", folder: "High School (9-12)/Junior-Senior" },
  { title: "Yearbook Information and Photo Submission Guide", description: "How to purchase yearbooks and submit photos for inclusion", tags: ["yearbook", "photos", "memories"], category: "Student Life", folder: "Community & Events/School Events" },
  { title: "Student Dress Code Policy", description: "Detailed dress code expectations with visual examples", tags: ["dress code", "uniform", "clothing"], category: "Student Life", folder: "Policies & Handbooks/Student Handbook" },
  { title: "Bullying Prevention and Reporting Procedures", description: "How bullying is defined, how to report it, and school response procedures", tags: ["bullying", "prevention", "reporting"], category: "Student Life", folder: "Health & Safety/Emergency Plans" },
  { title: "Cell Phone and Electronic Device Policy", description: "Rules for phone use during school hours and consequences for violations", tags: ["phones", "devices", "electronics"], category: "Student Life", folder: "Policies & Handbooks/Student Handbook" },
  { title: "Morning Drop-Off and Afternoon Pickup Procedures", description: "Detailed traffic flow, timing, and safety instructions for arrivals and departures", tags: ["drop-off", "pickup", "traffic"], category: "Student Life", folder: "2025-2026 School Year/First Semester" },
  { title: "After-School Enrichment Programs", description: "Descriptions of after-school programs including STEM club, art, and tutoring", tags: ["after school", "enrichment", "tutoring"], category: "Student Life", folder: "Elementary School (K-5)/Grades 1-5" },
  { title: "Middle School Elective Course Descriptions", description: "Overview of elective options available to 6th-8th grade students", tags: ["electives", "middle school", "courses"], category: "Student Life", folder: "Middle School (6-8)/Grade 6" },
  { title: "Student Parking Lot Rules and Permit Application", description: "How to apply for a parking permit and lot rules for student drivers", tags: ["parking", "driving", "permits"], category: "Student Life", folder: "High School (9-12)/Freshman-Sophomore" },
  { title: "Spirit Week and Homecoming Planning Guide", description: "Schedule and themes for Spirit Week, pep rally, and homecoming game", tags: ["spirit week", "homecoming", "school spirit"], category: "Student Life", folder: "Community & Events/School Events" },
  { title: "Lost and Found Procedures", description: "Where lost items are kept, how to claim them, and donation timeline", tags: ["lost and found", "property", "claims"], category: "Student Life", folder: "Policies & Handbooks/Student Handbook" },

  // --- Health & Safety (18) ---
  { title: "Emergency Procedures and Evacuation Plan", description: "School-wide emergency protocols for fire, lockdown, severe weather, and earthquake", tags: ["emergency", "evacuation", "safety"], category: "Health & Safety", folder: "Health & Safety/Emergency Plans" },
  { title: "Student Immunization Requirements 2025-2026", description: "Required vaccinations for enrollment by grade level", tags: ["immunizations", "vaccines", "health"], category: "Health & Safety", folder: "Health & Safety/Health Forms" },
  { title: "Medication Administration Policy", description: "How to authorize the school nurse to administer prescription or OTC medications", tags: ["medication", "nurse", "prescriptions"], category: "Health & Safety", folder: "Health & Safety/Health Forms" },
  { title: "Allergy and Anaphylaxis Action Plan", description: "Procedures for managing student allergies and epinephrine administration", tags: ["allergies", "anaphylaxis", "epipen"], category: "Health & Safety", folder: "Health & Safety/Health Forms" },
  { title: "Concussion Protocol and Return-to-Play Guidelines", description: "Steps taken when a student athlete is suspected of having a concussion", tags: ["concussion", "sports", "return to play"], category: "Health & Safety", folder: "Athletics & Activities/Fall Sports" },
  { title: "Mental Health Resources and Counseling Services", description: "Available counseling, crisis hotlines, and mental wellness programs", tags: ["mental health", "counseling", "wellness"], category: "Health & Safety", folder: "Health & Safety/Health Forms" },
  { title: "COVID-19 and Infectious Disease Guidelines", description: "Updated illness policies, isolation periods, and when to keep students home", tags: ["illness", "COVID", "infectious disease"], category: "Health & Safety", folder: "Health & Safety/Emergency Plans" },
  { title: "School Nurse Services and Hours", description: "What the school nurse can and cannot do, office hours, and contact info", tags: ["nurse", "health office", "first aid"], category: "Health & Safety", folder: "Health & Safety/Health Forms" },
  { title: "Severe Weather and School Closure Procedures", description: "How decisions are made about closures, delays, and early dismissals", tags: ["weather", "closures", "delays"], category: "Health & Safety", folder: "Health & Safety/Emergency Plans" },
  { title: "Student Accident and Injury Report Process", description: "What happens when a student is injured at school and how parents are notified", tags: ["injury", "accidents", "incident report"], category: "Health & Safety", folder: "Health & Safety/Health Forms" },
  { title: "Fire Drill and Safety Inspection Schedule", description: "Schedule of monthly fire drills and annual safety inspections", tags: ["fire drill", "inspections", "safety"], category: "Health & Safety", folder: "Health & Safety/Emergency Plans" },
  { title: "Food Allergy Awareness Guidelines for Parents", description: "How the school accommodates food allergies in classrooms and cafeteria", tags: ["food allergy", "cafeteria", "accommodations"], category: "Health & Safety", folder: "Health & Safety/Health Forms" },
  { title: "School Security and Visitor Check-In Policy", description: "Procedures for entering the building, ID requirements, and security protocols", tags: ["security", "visitors", "check-in"], category: "Health & Safety", folder: "Policies & Handbooks/Student Handbook" },
  { title: "Asthma Action Plan Template", description: "Template and instructions for parents to complete for asthmatic students", tags: ["asthma", "action plan", "respiratory"], category: "Health & Safety", folder: "Health & Safety/Health Forms" },
  { title: "Student Wellness Policy", description: "School commitment to physical activity, nutrition education, and health screenings", tags: ["wellness", "health", "fitness"], category: "Health & Safety", folder: "Health & Safety/Health Forms" },
  { title: "AED Location Map and CPR Training Program", description: "Where AEDs are located in the building and staff CPR certification program", tags: ["AED", "CPR", "cardiac"], category: "Health & Safety", folder: "Health & Safety/Emergency Plans" },
  { title: "Substance Abuse Prevention and Drug Testing Policy", description: "School stance on drugs, alcohol, and vaping including testing procedures", tags: ["drugs", "vaping", "substance abuse"], category: "Health & Safety", folder: "Policies & Handbooks/Student Handbook" },
  { title: "Head Lice Policy and Treatment Guidelines", description: "School response to lice cases and when students may return", tags: ["lice", "health", "treatment"], category: "Health & Safety", folder: "Health & Safety/Health Forms" },

  // --- Transportation (10) ---
  { title: "Bus Routes and Schedules 2025-2026", description: "Complete bus route maps, stop locations, and timing for all routes", tags: ["bus", "routes", "schedules"], category: "Transportation", folder: "2025-2026 School Year/First Semester" },
  { title: "School Bus Safety Rules and Expectations", description: "Behavioral expectations while riding the bus and consequences for violations", tags: ["bus safety", "rules", "behavior"], category: "Transportation", folder: "Policies & Handbooks/Student Handbook" },
  { title: "Carpool Lane Procedures and Map", description: "How the carpool lane works, numbering system, and traffic flow", tags: ["carpool", "drop-off", "traffic"], category: "Transportation", folder: "2025-2026 School Year/First Semester" },
  { title: "Bus Route Change Request Form Instructions", description: "How to request a bus stop change or alternative transportation arrangement", tags: ["bus change", "request", "transportation"], category: "Transportation", folder: "2025-2026 School Year/First Semester" },
  { title: "Inclement Weather Transportation Changes", description: "How bus schedules are affected during snow, ice, or severe weather", tags: ["weather", "bus", "delays"], category: "Transportation", folder: "Health & Safety/Emergency Plans" },
  { title: "Student Driver Parking and Traffic Guidelines", description: "Rules for student drivers including speed limits, lot assignments, and violations", tags: ["student drivers", "parking", "safety"], category: "Transportation", folder: "High School (9-12)/Freshman-Sophomore" },
  { title: "Before and After School Care Transportation", description: "Bus service to and from the before/after care program at Westfield", tags: ["before care", "after care", "bus"], category: "Transportation", folder: "Elementary School (K-5)/Kindergarten" },
  { title: "Walking and Biking to School Safety Guidelines", description: "Safe routes, crossing guard locations, and bicycle parking", tags: ["walking", "biking", "safety"], category: "Transportation", folder: "2025-2026 School Year/First Semester" },
  { title: "Field Trip Transportation Waiver and Procedures", description: "Transportation arrangements and parent waiver requirements for field trips", tags: ["field trip", "bus", "waiver"], category: "Transportation", folder: "Policies & Handbooks/Student Handbook" },
  { title: "Late Bus Schedule for After-School Activities", description: "Schedule and routes for the activity bus running after sports and clubs", tags: ["late bus", "activities", "transportation"], category: "Transportation", folder: "Athletics & Activities/Fall Sports" },

  // --- Athletics (15) ---
  { title: "Fall Sports Schedule: Football, Soccer, Cross Country, Volleyball", description: "Game dates, times, and locations for all fall varsity and JV sports", tags: ["fall sports", "football", "soccer"], category: "Athletics", folder: "Athletics & Activities/Fall Sports" },
  { title: "Winter Sports Schedule: Basketball, Wrestling, Swimming", description: "Game dates, times, and locations for all winter sports", tags: ["winter sports", "basketball", "wrestling"], category: "Athletics", folder: "Athletics & Activities/Fall Sports" },
  { title: "Spring Sports Schedule: Baseball, Softball, Track, Tennis, Lacrosse", description: "Game dates, times, and locations for all spring sports", tags: ["spring sports", "baseball", "track"], category: "Athletics", folder: "Athletics & Activities/Spring Sports" },
  { title: "Athletic Physical Examination Requirements", description: "Required pre-participation physical form and deadlines", tags: ["physical", "sports clearance", "eligibility"], category: "Athletics", folder: "Athletics & Activities/Fall Sports" },
  { title: "Student Athlete Academic Eligibility Policy", description: "GPA and conduct requirements to maintain athletic eligibility", tags: ["eligibility", "GPA", "academics"], category: "Athletics", folder: "Athletics & Activities/Fall Sports" },
  { title: "Athletic Booster Club Membership and Donations", description: "How to join the boosters, fundraising events, and sponsorship levels", tags: ["boosters", "fundraising", "donations"], category: "Athletics", folder: "Community & Events/PTA" },
  { title: "Weight Room and Fitness Center Rules", description: "Hours, supervision requirements, and safety rules for the weight room", tags: ["weight room", "fitness", "training"], category: "Athletics", folder: "Athletics & Activities/Fall Sports" },
  { title: "Sports Equipment and Uniform Distribution", description: "When and where to pick up uniforms and equipment for each sport", tags: ["uniforms", "equipment", "distribution"], category: "Athletics", folder: "Athletics & Activities/Fall Sports" },
  { title: "Concession Stand Volunteer Sign-Up Guide", description: "How parents can volunteer to work the concession stand at home games", tags: ["concessions", "volunteer", "games"], category: "Athletics", folder: "Community & Events/PTA" },
  { title: "Middle School Intramural Sports Program", description: "Overview of non-competitive intramural options for middle school students", tags: ["intramural", "middle school", "recreation"], category: "Athletics", folder: "Middle School (6-8)/Grade 6" },
  { title: "Westfield Academy Athletic Hall of Fame", description: "History of the hall of fame, nomination criteria, and past inductees", tags: ["hall of fame", "history", "athletics"], category: "Athletics", folder: "Athletics & Activities/Fall Sports" },
  { title: "Swimming Pool Schedule and Open Swim Hours", description: "Pool availability for PE classes, swim team, and community open swim", tags: ["pool", "swimming", "open swim"], category: "Athletics", folder: "Athletics & Activities/Spring Sports" },
  { title: "Athletic Trainer Services and Injury Prevention", description: "Role of the athletic trainer, hours, and injury prevention programs", tags: ["trainer", "injury prevention", "sports medicine"], category: "Athletics", folder: "Athletics & Activities/Fall Sports" },
  { title: "Sportsmanship Code of Conduct", description: "Expected behavior for athletes, parents, and spectators at events", tags: ["sportsmanship", "conduct", "behavior"], category: "Athletics", folder: "Athletics & Activities/Fall Sports" },
  { title: "Youth Summer Sports Camps Information", description: "Summer camp offerings for rising K-12 athletes at Westfield", tags: ["summer camps", "youth sports", "training"], category: "Athletics", folder: "Athletics & Activities/Spring Sports" },

  // --- Administration (18) ---
  { title: "New Student Enrollment Checklist", description: "Step-by-step guide for enrolling a new student at Westfield Academy", tags: ["enrollment", "registration", "new student"], category: "Administration", folder: "Financial Information/Tuition & Fees" },
  { title: "Tuition and Fee Schedule 2025-2026", description: "Breakdown of tuition, technology fees, activity fees, and payment deadlines", tags: ["tuition", "fees", "payment"], category: "Administration", folder: "Financial Information/Tuition & Fees" },
  { title: "Financial Aid and Scholarship Application Guide", description: "How to apply for financial assistance and available scholarship programs", tags: ["financial aid", "scholarship", "assistance"], category: "Administration", folder: "Financial Information/Financial Aid" },
  { title: "School Calendar 2025-2026", description: "Official calendar with all school days, holidays, breaks, and teacher workdays", tags: ["calendar", "holidays", "schedule"], category: "Administration", folder: "2025-2026 School Year/First Semester" },
  { title: "Westfield Academy Faculty and Staff Directory", description: "Contact information for administrators, teachers, counselors, and support staff", tags: ["directory", "staff", "contact"], category: "Administration", folder: "2025-2026 School Year/First Semester" },
  { title: "School Board Meeting Schedule and Agenda Access", description: "When and where the school board meets, and how to view agendas/minutes", tags: ["school board", "meetings", "governance"], category: "Administration", folder: "Community & Events/PTA" },
  { title: "Student Records and Transcript Request Procedures", description: "How to request official transcripts, records transfers, and FERPA information", tags: ["transcripts", "records", "FERPA"], category: "Administration", folder: "Policies & Handbooks/Student Handbook" },
  { title: "Westfield Academy Mission, Vision, and Core Values", description: "The school's founding principles, mission statement, and strategic goals", tags: ["mission", "vision", "values"], category: "Administration", folder: "2025-2026 School Year/First Semester" },
  { title: "Annual Fund and Giving Campaign Information", description: "Details about the annual fund drive, donor levels, and how contributions are used", tags: ["annual fund", "donations", "giving"], category: "Administration", folder: "Financial Information/Financial Aid" },
  { title: "School Map and Building Directory", description: "Floor plans, room numbers, and facility locations for the Westfield campus", tags: ["campus map", "building", "rooms"], category: "Administration", folder: "2025-2026 School Year/First Semester" },
  { title: "Class Size Policy and Teacher-Student Ratios", description: "Maximum class sizes by grade level and how overages are handled", tags: ["class size", "ratios", "staffing"], category: "Administration", folder: "Curriculum & Academics/Course Catalogs" },
  { title: "School Photo Day Information", description: "When photo day is, how to order photos, and retake dates", tags: ["photos", "picture day", "orders"], category: "Administration", folder: "Community & Events/School Events" },
  { title: "Inclement Weather Makeup Day Schedule", description: "How snow days and closures are made up during the school year", tags: ["snow days", "makeup", "closures"], category: "Administration", folder: "2025-2026 School Year/Second Semester" },
  { title: "Re-Enrollment and Intent to Return Process", description: "Deadline and process for current families to confirm enrollment for next year", tags: ["re-enrollment", "intent", "returning"], category: "Administration", folder: "Financial Information/Tuition & Fees" },
  { title: "Withdrawal and Transfer Out Procedures", description: "Steps required when a student is leaving Westfield Academy", tags: ["withdrawal", "transfer", "leaving"], category: "Administration", folder: "Financial Information/Tuition & Fees" },
  { title: "Classroom Supply Lists by Grade Level", description: "Required supplies for each grade and where to purchase pre-packaged kits", tags: ["supply lists", "school supplies", "materials"], category: "Administration", folder: "Elementary School (K-5)/Grades 1-5" },
  { title: "Back-to-School Night Information Packet", description: "Schedule, classroom locations, and what parents can expect at back-to-school night", tags: ["back to school", "open house", "meet teacher"], category: "Administration", folder: "Community & Events/School Events" },
  { title: "Office Hours and Administrative Contact Information", description: "Main office hours, phone numbers, email addresses, and who to contact for what", tags: ["office hours", "contact", "administration"], category: "Administration", folder: "2025-2026 School Year/First Semester" },

  // --- Technology (12) ---
  { title: "Student Acceptable Use Policy for Technology", description: "Rules for using school-provided devices, internet, and software", tags: ["AUP", "technology", "internet"], category: "Technology", folder: "Policies & Handbooks/Student Handbook" },
  { title: "1:1 Chromebook Program Guide", description: "Information about the device distribution, care, and return process", tags: ["Chromebook", "1:1", "devices"], category: "Technology", folder: "Curriculum & Academics/Course Catalogs" },
  { title: "Parent Portal (PowerSchool) User Guide", description: "How to log in, check grades, view attendance, and set up notifications", tags: ["PowerSchool", "parent portal", "grades"], category: "Technology", folder: "Curriculum & Academics/Testing & Assessment" },
  { title: "Google Classroom Guide for Parents", description: "How to view assignments, due dates, and communicate with teachers through Google Classroom", tags: ["Google Classroom", "assignments", "digital"], category: "Technology", folder: "Curriculum & Academics/Course Catalogs" },
  { title: "Student Email and Google Workspace Account Setup", description: "How student Google accounts work, email rules, and storage limits", tags: ["email", "Google Workspace", "accounts"], category: "Technology", folder: "Policies & Handbooks/Staff Policies" },
  { title: "Digital Citizenship Curriculum Overview", description: "What students learn about online safety, privacy, and responsible digital behavior", tags: ["digital citizenship", "online safety", "privacy"], category: "Technology", folder: "Curriculum & Academics/Course Catalogs" },
  { title: "School WiFi Network Access Instructions", description: "How to connect personal devices to the guest WiFi network on campus", tags: ["WiFi", "network", "connectivity"], category: "Technology", folder: "Policies & Handbooks/Staff Policies" },
  { title: "Device Damage and Repair Procedures", description: "What to do if a school-issued device is damaged, lost, or stolen", tags: ["device repair", "damage", "insurance"], category: "Technology", folder: "Financial Information/Tuition & Fees" },
  { title: "Online Learning Platform Access Guide", description: "How to access Canvas, Khan Academy, IXL, and other digital learning tools", tags: ["online learning", "Canvas", "IXL"], category: "Technology", folder: "Curriculum & Academics/Course Catalogs" },
  { title: "Social Media Guidelines for Students and Families", description: "School guidelines on social media use related to school events and students", tags: ["social media", "guidelines", "online"], category: "Technology", folder: "Policies & Handbooks/Student Handbook" },
  { title: "Assistive Technology Resources for Students with Disabilities", description: "Available assistive technology and how to request accommodations", tags: ["assistive technology", "disabilities", "accommodations"], category: "Technology", folder: "Curriculum & Academics/Course Catalogs" },
  { title: "Cyberbullying Policy and Reporting", description: "Definition of cyberbullying, how to report it, and school response process", tags: ["cyberbullying", "reporting", "online safety"], category: "Technology", folder: "Policies & Handbooks/Student Handbook" },

  // --- Special Programs (15) ---
  { title: "Gifted and Talented Program Overview", description: "Identification criteria, services provided, and program structure", tags: ["gifted", "talented", "enrichment"], category: "Special Programs", folder: "Curriculum & Academics/Course Catalogs" },
  { title: "Special Education Services and IEP Process", description: "Overview of special education services, IEP development, and parent rights", tags: ["special education", "IEP", "IDEA"], category: "Special Programs", folder: "Curriculum & Academics/Course Catalogs" },
  { title: "Section 504 Plan Information for Parents", description: "How 504 plans work, eligibility, and the accommodation process", tags: ["504 plan", "accommodations", "disability"], category: "Special Programs", folder: "Policies & Handbooks/Student Handbook" },
  { title: "English as a Second Language (ESL) Program", description: "Services for English language learners, testing, and exit criteria", tags: ["ESL", "ELL", "English learner"], category: "Special Programs", folder: "Curriculum & Academics/Course Catalogs" },
  { title: "Response to Intervention (RTI) Process", description: "Multi-tiered support system for students struggling academically or behaviorally", tags: ["RTI", "intervention", "support"], category: "Special Programs", folder: "Curriculum & Academics/Testing & Assessment" },
  { title: "School Counseling Services and College Planning", description: "Counselor roles, scheduling, college application support, and social-emotional services", tags: ["counseling", "college planning", "SEL"], category: "Special Programs", folder: "High School (9-12)/Junior-Senior" },
  { title: "Speech and Language Therapy Services", description: "How speech therapy services are provided, referral process, and eligibility", tags: ["speech therapy", "language", "therapy"], category: "Special Programs", folder: "Elementary School (K-5)/Kindergarten" },
  { title: "Occupational Therapy Services at Westfield", description: "Overview of OT services available for students with fine motor or sensory needs", tags: ["occupational therapy", "OT", "sensory"], category: "Special Programs", folder: "Elementary School (K-5)/Kindergarten" },
  { title: "Peer Tutoring and Academic Mentorship Program", description: "How students can sign up to be tutors or get matched with peer mentors", tags: ["tutoring", "mentorship", "peer support"], category: "Special Programs", folder: "Community & Events/School Events" },
  { title: "SAT/ACT Preparation Resources and Test Dates", description: "Free prep resources, test registration guidance, and fee waiver information", tags: ["SAT prep", "ACT prep", "testing"], category: "Special Programs", folder: "High School (9-12)/Junior-Senior" },
  { title: "Early Childhood Transition from Pre-K to Kindergarten", description: "How Westfield supports the transition from pre-K programs to kindergarten", tags: ["pre-K", "transition", "kindergarten"], category: "Special Programs", folder: "Elementary School (K-5)/Kindergarten" },
  { title: "Dyslexia Screening and Support Program", description: "Westfield's approach to early dyslexia identification and intervention", tags: ["dyslexia", "screening", "reading"], category: "Special Programs", folder: "Elementary School (K-5)/Grades 1-5" },
  { title: "College and Career Readiness Programs", description: "Internships, job shadowing, career fairs, and college visit opportunities", tags: ["college readiness", "career", "internships"], category: "Special Programs", folder: "High School (9-12)/Junior-Senior" },
  { title: "Behavioral Intervention and Positive Behavior Supports", description: "PBIS framework, behavior plans, and reward systems used at Westfield", tags: ["PBIS", "behavior", "positive support"], category: "Special Programs", folder: "Policies & Handbooks/Student Handbook" },
  { title: "Summer School and Credit Recovery Programs", description: "Eligibility, courses offered, schedules, and registration for summer school", tags: ["summer school", "credit recovery", "remediation"], category: "Special Programs", folder: "2025-2026 School Year/Second Semester" },

  // --- Nutrition & Dining (12) ---
  { title: "Monthly Lunch Menu - September 2025", description: "Daily menu with entrees, sides, and nutritional information for September", tags: ["lunch menu", "September", "cafeteria"], category: "Nutrition & Dining", folder: "2025-2026 School Year/First Semester" },
  { title: "Monthly Lunch Menu - October 2025", description: "Daily menu with entrees, sides, and nutritional information for October", tags: ["lunch menu", "October", "cafeteria"], category: "Nutrition & Dining", folder: "2025-2026 School Year/First Semester" },
  { title: "Monthly Lunch Menu - November 2025", description: "Daily menu with entrees, sides, and nutritional information for November", tags: ["lunch menu", "November", "cafeteria"], category: "Nutrition & Dining", folder: "2025-2026 School Year/First Semester" },
  { title: "Monthly Lunch Menu - January 2026", description: "Daily menu with entrees, sides, and nutritional information for January", tags: ["lunch menu", "January", "cafeteria"], category: "Nutrition & Dining", folder: "2025-2026 School Year/Second Semester" },
  { title: "Monthly Lunch Menu - February 2026", description: "Daily menu with entrees, sides, and nutritional information for February", tags: ["lunch menu", "February", "cafeteria"], category: "Nutrition & Dining", folder: "2025-2026 School Year/Second Semester" },
  { title: "Free and Reduced Lunch Application Guide", description: "Eligibility criteria, application process, and privacy information", tags: ["free lunch", "reduced lunch", "NSLP"], category: "Nutrition & Dining", folder: "Financial Information/Financial Aid" },
  { title: "Cafeteria Rules and Lunch Period Schedule", description: "Lunch times by grade, behavior expectations, and seating arrangements", tags: ["cafeteria", "lunch period", "rules"], category: "Nutrition & Dining", folder: "Policies & Handbooks/Student Handbook" },
  { title: "Dietary Accommodation Request Form Instructions", description: "How to request accommodations for medical dietary needs, religious restrictions, or allergies", tags: ["dietary", "accommodations", "allergies"], category: "Nutrition & Dining", folder: "Health & Safety/Health Forms" },
  { title: "School Breakfast Program Information", description: "Breakfast menu, hours, and how to participate in the morning meal program", tags: ["breakfast", "morning meals", "nutrition"], category: "Nutrition & Dining", folder: "2025-2026 School Year/First Semester" },
  { title: "Vending Machine Policy and Healthy Snack Options", description: "What is sold in vending machines, when they are accessible, and nutrition standards", tags: ["vending", "snacks", "nutrition"], category: "Nutrition & Dining", folder: "Policies & Handbooks/Student Handbook" },
  { title: "Food Service Allergy Notification System", description: "How the cafeteria communicates allergen information and prevents cross-contamination", tags: ["allergens", "food service", "safety"], category: "Nutrition & Dining", folder: "Health & Safety/Health Forms" },
  { title: "Classroom Birthday and Celebration Food Policy", description: "Rules for bringing food to school for celebrations, approved items, and alternatives", tags: ["birthday", "celebrations", "food"], category: "Nutrition & Dining", folder: "Elementary School (K-5)/Grades 1-5" },

  // --- Parent Resources (15) ---
  { title: "PTA Membership and Meeting Schedule 2025-2026", description: "How to join, meeting dates, and volunteer opportunities through the PTA", tags: ["PTA", "membership", "volunteer"], category: "Parent Resources", folder: "Community & Events/PTA" },
  { title: "Parent Volunteer Opportunities and Background Check Requirements", description: "How to get cleared to volunteer and current opportunities", tags: ["volunteer", "background check", "clearance"], category: "Parent Resources", folder: "Community & Events/PTA" },
  { title: "Communication Channels: How the School Contacts You", description: "Overview of email, app, text, and social media communication methods", tags: ["communication", "email", "notifications"], category: "Parent Resources", folder: "2025-2026 School Year/First Semester" },
  { title: "New Parent Orientation Welcome Packet", description: "Essential information for families new to Westfield Academy", tags: ["new parent", "orientation", "welcome"], category: "Parent Resources", folder: "2025-2026 School Year/First Semester" },
  { title: "Room Parent Guide and Responsibilities", description: "What room parents do, how to sign up, and coordination with teachers", tags: ["room parent", "volunteer", "classroom"], category: "Parent Resources", folder: "Community & Events/PTA" },
  { title: "Fundraising Events Calendar and Participation Guide", description: "Annual fundraisers including the auction, fun run, and book fair", tags: ["fundraising", "events", "donations"], category: "Parent Resources", folder: "Community & Events/PTA" },
  { title: "Parent Feedback and Complaint Resolution Process", description: "How to provide feedback, file complaints, and the escalation process", tags: ["feedback", "complaints", "resolution"], category: "Parent Resources", folder: "Policies & Handbooks/Student Handbook" },
  { title: "School Store Hours and Merchandise Catalog", description: "Spirit wear, school supplies, and other items available at the school store", tags: ["school store", "merchandise", "spirit wear"], category: "Parent Resources", folder: "Community & Events/School Events" },
  { title: "Tutoring and Homework Help Resources", description: "External tutoring options, homework hotlines, and free online resources", tags: ["tutoring", "homework help", "resources"], category: "Parent Resources", folder: "Curriculum & Academics/Course Catalogs" },
  { title: "Multi-Language Translation Services Available", description: "Languages supported for school communications and how to request translation", tags: ["translation", "languages", "accessibility"], category: "Parent Resources", folder: "2025-2026 School Year/First Semester" },
  { title: "Guide to Understanding Your Child's Standardized Test Scores", description: "How to read MAP, state test, PSAT, and SAT/ACT score reports", tags: ["test scores", "MAP", "results"], category: "Parent Resources", folder: "Curriculum & Academics/Testing & Assessment" },
  { title: "Snow Day and Delay Communication Procedures", description: "How and when the school communicates closures and delays", tags: ["snow day", "communication", "delays"], category: "Parent Resources", folder: "Health & Safety/Emergency Plans" },
  { title: "Summer Programs and Camp Recommendations", description: "Westfield-sponsored and partner summer programs and camps", tags: ["summer programs", "camps", "enrichment"], category: "Parent Resources", folder: "2025-2026 School Year/Second Semester" },
  { title: "FERPA Rights and Directory Information Opt-Out", description: "Explanation of parent rights under FERPA and how to opt out of directory info sharing", tags: ["FERPA", "privacy", "opt-out"], category: "Parent Resources", folder: "Policies & Handbooks/Student Handbook" },
  { title: "Westfield Academy History and Traditions", description: "History of the school, traditions like the Founder's Day assembly, and school song", tags: ["history", "traditions", "culture"], category: "Parent Resources", folder: "Community & Events/School Events" },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== Westfield Academy Demo Seed ===");
  console.log(`Documents: ${DOCUMENTS.length} | Events: ${EVENTS.length} | Announcements: ${ANNOUNCEMENTS.length}`);
  console.log(`Concurrency: ${CONCURRENCY} | Clean: ${shouldClean} | Skip docs: ${skipDocuments}`);
  console.log("");

  const admin = createAdminClient();

  // 1. Upsert school
  const schoolId = await upsertSchool(admin);

  // 2. Upsert settings
  await upsertSettings(admin, schoolId);

  // 3. Clean if requested
  if (shouldClean) {
    await cleanDemoData(admin, schoolId);
  }

  // 4. Categories
  const categoryMap = await seedCategories(admin, schoolId);

  // 5. Folders
  const folderMap = await seedFolders(admin, schoolId);

  // 6. Events
  await seedEvents(admin, schoolId);

  // 7. Announcements
  await seedAnnouncements(admin, schoolId);

  // 8. Documents
  if (!skipDocuments) {
    await seedDocuments(admin, schoolId, categoryMap, folderMap);
  } else {
    console.log("\n[skip] Skipping document generation (--skip-documents)");
  }

  // 9. Summary
  await printSummary(admin, schoolId);
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

async function upsertSchool(admin: SupabaseAdmin): Promise<string> {
  const { data: existing } = await admin
    .from("schools")
    .select("id, name")
    .eq("slug", SCHOOL_SLUG)
    .single();

  if (existing) {
    // Update name if it doesn't match
    if (existing.name !== SCHOOL_NAME) {
      await admin
        .from("schools")
        .update({ name: SCHOOL_NAME, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      console.log(`[school] Renamed "${existing.name}" → "${SCHOOL_NAME}" (${existing.id})`);
    } else {
      console.log(`[school] Found existing "${SCHOOL_NAME}" (${existing.id})`);
    }
    return existing.id;
  }

  const { data: school, error } = await admin
    .from("schools")
    .insert({ name: SCHOOL_NAME, slug: SCHOOL_SLUG })
    .select("id")
    .single();

  if (error || !school) throw new Error(`Failed to create school: ${error?.message}`);
  console.log(`[school] Created "${SCHOOL_NAME}" (${school.id})`);
  return school.id;
}

async function upsertSettings(admin: SupabaseAdmin, schoolId: string) {
  const { data: existing } = await admin
    .from("settings")
    .select("school_id")
    .eq("school_id", schoolId)
    .single();

  if (existing) {
    console.log("[settings] Already exists");
    return;
  }

  const { error } = await admin.from("settings").insert({
    school_id: schoolId,
    school_name: SCHOOL_NAME,
    welcome_message: "Welcome to Westfield Academy! Ask me anything about our school — policies, events, schedules, and more.",
    suggested_questions: JSON.stringify([
      "What are the graduation requirements?",
      "When is spring break?",
      "How do I apply for financial aid?",
      "What clubs are available?",
      "What are the bus routes?",
    ]),
  });

  if (error) throw new Error(`Failed to create settings: ${error.message}`);
  console.log("[settings] Created with welcome message and suggested questions");
}

async function cleanDemoData(admin: SupabaseAdmin, schoolId: string) {
  console.log("[clean] Deleting all existing demo data...");

  const tables = [
    "chat_feedback",
    "document_chunks",
    "chat_messages",
    "chat_sessions",
    "analytics_events",
    "audit_log",
    "notifications",
    "announcement_dismissals",
    "documents",
    "announcements",
    "events",
    "categories",
    "folders",
  ];

  for (const table of tables) {
    await admin.from(table).delete().eq("school_id", schoolId);
  }

  // Clean storage
  const { data: files } = await admin.storage
    .from("documents")
    .list(schoolId, { limit: 1000 });

  if (files?.length) {
    const paths = files.map((f) => `${schoolId}/${f.name}`);
    // Delete in batches of 100
    for (let i = 0; i < paths.length; i += 100) {
      await admin.storage.from("documents").remove(paths.slice(i, i + 100));
    }
    console.log(`[clean] Removed ${files.length} storage files`);
  }

  console.log("[clean] Done");
}

async function seedCategories(
  admin: SupabaseAdmin,
  schoolId: string
): Promise<Map<string, string>> {
  console.log(`\n[categories] Inserting ${CATEGORIES.length} categories...`);

  const rows = CATEGORIES.map((c) => ({
    name: c.name,
    description: c.description,
    color: c.color,
    school_id: schoolId,
  }));

  await admin
    .from("categories")
    .upsert(rows, { onConflict: "name,school_id", ignoreDuplicates: true });

  // Fetch all to get IDs (in case some existed)
  const { data: cats } = await admin
    .from("categories")
    .select("id, name")
    .eq("school_id", schoolId);

  const map = new Map<string, string>();
  for (const cat of cats || []) {
    map.set(cat.name, cat.id);
  }

  console.log(`[categories] ${map.size} categories ready`);
  return map;
}

async function seedFolders(
  admin: SupabaseAdmin,
  schoolId: string
): Promise<Map<string, string>> {
  console.log(`[folders] Inserting ${FOLDERS.length} root folders + children...`);

  const map = new Map<string, string>();

  // Insert root folders
  for (const folder of FOLDERS) {
    const { data: existing } = await admin
      .from("folders")
      .select("id")
      .eq("name", folder.name)
      .eq("school_id", schoolId)
      .is("parent_id", null)
      .single();

    let rootId: string;
    if (existing) {
      rootId = existing.id;
    } else {
      const { data: inserted, error } = await admin
        .from("folders")
        .insert({ name: folder.name, parent_id: null, school_id: schoolId })
        .select("id")
        .single();
      if (error || !inserted) {
        console.warn(`  [warn] Root folder "${folder.name}" failed: ${error?.message}`);
        continue;
      }
      rootId = inserted.id;
    }
    map.set(folder.name, rootId);

    // Insert children
    for (const childName of folder.children) {
      const { data: existingChild } = await admin
        .from("folders")
        .select("id")
        .eq("name", childName)
        .eq("parent_id", rootId)
        .eq("school_id", schoolId)
        .single();

      if (existingChild) {
        map.set(`${folder.name}/${childName}`, existingChild.id);
      } else {
        const { data: child, error } = await admin
          .from("folders")
          .insert({ name: childName, parent_id: rootId, school_id: schoolId })
          .select("id")
          .single();
        if (error || !child) {
          console.warn(`  [warn] Child folder "${childName}" failed: ${error?.message}`);
          continue;
        }
        map.set(`${folder.name}/${childName}`, child.id);
      }
    }
  }

  console.log(`[folders] ${map.size} folders ready`);
  return map;
}

async function seedEvents(admin: SupabaseAdmin, schoolId: string) {
  console.log(`\n[events] Inserting ${EVENTS.length} events...`);

  const rows = EVENTS.map((e) => ({
    title: e.title,
    description: e.description,
    date: e.date,
    start_time: e.start_time,
    end_time: e.end_time,
    location: e.location,
    event_type: e.event_type,
    recurrence: "none",
    recurrence_end: null,
    created_by: null,
    school_id: schoolId,
  }));

  const { error } = await admin.from("events").insert(rows);
  if (error) throw new Error(`Events insert failed: ${error.message}`);
  console.log(`[events] ${rows.length} events inserted`);
}

async function seedAnnouncements(admin: SupabaseAdmin, schoolId: string) {
  console.log(`[announcements] Inserting ${ANNOUNCEMENTS.length} announcements...`);

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const rows = ANNOUNCEMENTS.map((a) => ({
    title: a.title,
    content: a.content,
    priority: a.priority,
    pinned: a.pinned,
    status: "published",
    expires_at: expiresAt,
    publish_at: null,
    created_by: null,
    school_id: schoolId,
  }));

  const { error } = await admin.from("announcements").insert(rows);
  if (error) throw new Error(`Announcements insert failed: ${error.message}`);
  console.log(`[announcements] ${rows.length} announcements inserted`);
}

async function seedDocuments(
  admin: SupabaseAdmin,
  schoolId: string,
  categoryMap: Map<string, string>,
  folderMap: Map<string, string>
) {
  console.log(`\n[documents] Generating ${DOCUMENTS.length} documents (concurrency: ${CONCURRENCY})...`);

  let completed = 0;
  let failed = 0;
  const startTime = Date.now();
  const pool = new Set<Promise<void>>();

  for (const docDef of DOCUMENTS) {
    const promise = processOneDocument(admin, schoolId, docDef, categoryMap, folderMap)
      .then(() => {
        completed++;
      })
      .catch((err: unknown) => {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  [FAIL] "${docDef.title}": ${msg}`);
      })
      .finally(() => {
        pool.delete(promise);
        const total = completed + failed;
        if (total % 10 === 0 || total === DOCUMENTS.length) {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          console.log(`  [progress] ${total}/${DOCUMENTS.length} (${completed} ok, ${failed} failed) — ${elapsed}s`);
        }
      });

    pool.add(promise);

    if (pool.size >= CONCURRENCY) {
      await Promise.race(pool);
    }

    // Rate limit between starts
    await sleep(500);
  }

  // Wait for remaining
  await Promise.all(pool);

  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`[documents] Complete: ${completed} succeeded, ${failed} failed in ${totalTime}s`);
}

async function processOneDocument(
  admin: SupabaseAdmin,
  schoolId: string,
  docDef: DocumentDef,
  categoryMap: Map<string, string>,
  folderMap: Map<string, string>
) {
  // 1. Generate content
  const { text: content } = await withRetry(
    () =>
      generateText({
        model: google("gemini-2.0-flash"),
        prompt: `Generate a realistic school document for Westfield Academy, a K-12 school.

Title: ${docDef.title}
Description: ${docDef.description}

Write 500-1000 words of realistic, professional content for this school document.
Include appropriate sections, formatting, and details that a real school would include.
Use the school name "Westfield Academy" and the 2025-2026 school year where relevant.
Do not include any markdown formatting — just plain text with line breaks.
Do not include any preamble or explanation — just the document content.`,
      }),
    `generate-text:${docDef.title}`
  );

  // 2. Upload to storage
  const slugifiedName = docDef.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const fileName = `${slugifiedName}.txt`;
  const storagePath = `${schoolId}/${Date.now()}-${Math.random().toString(36).slice(2)}-${fileName}`;
  const fileBuffer = Buffer.from(content, "utf-8");

  const { error: uploadError } = await admin.storage
    .from("documents")
    .upload(storagePath, fileBuffer, {
      contentType: "text/plain",
      upsert: false,
    });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  // 3. Insert document record
  const { data: doc, error: insertError } = await admin
    .from("documents")
    .insert({
      title: docDef.title,
      description: docDef.description,
      file_name: fileName,
      file_type: "txt",
      file_url: storagePath,
      file_size: fileBuffer.length,
      category_id: categoryMap.get(docDef.category) || null,
      folder_id: folderMap.get(docDef.folder) || null,
      tags: docDef.tags,
      status: "processing" as const,
      uploaded_by: null,
      school_id: schoolId,
    })
    .select("id")
    .single();

  if (insertError || !doc) throw new Error(`Insert failed: ${insertError?.message}`);

  // 4. Chunk text
  const chunks = splitTextIntoChunks(content);

  // 5. Embed and insert in batches
  for (let i = 0; i < chunks.length; i += CHUNK_BATCH_SIZE) {
    const batch = chunks.slice(i, i + CHUNK_BATCH_SIZE);

    const embeddings = await withRetry(
      () => generateEmbeddings(batch.map((c) => c.content)),
      `embed:${docDef.title}:batch${i}`
    );

    const records = batch.map((chunk, j) => ({
      document_id: doc.id,
      content: chunk.content,
      chunk_index: chunk.index,
      embedding: JSON.stringify(embeddings[j]),
      metadata: chunk.metadata,
      school_id: schoolId,
    }));

    const { error: chunkError } = await admin
      .from("document_chunks")
      .insert(records);

    if (chunkError) throw new Error(`Chunk insert failed: ${chunkError.message}`);
  }

  // 6. Generate summary (non-fatal)
  let summary: string | null = null;
  try {
    summary = await withRetry(
      () => generateSummary(content, docDef.title),
      `summary:${docDef.title}`
    );
  } catch {
    // Non-fatal
  }

  // 7. Mark ready
  await admin
    .from("documents")
    .update({
      status: "ready",
      page_count: chunks.length,
      summary,
      text_url: storagePath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", doc.id);
}

async function printSummary(admin: SupabaseAdmin, schoolId: string) {
  console.log("\n=== Summary ===");

  const tables = ["documents", "document_chunks", "events", "announcements", "categories", "folders"] as const;

  for (const table of tables) {
    const { count } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("school_id", schoolId);
    console.log(`  ${table}: ${count ?? 0}`);
  }

  // Check for errors
  const { data: errors } = await admin
    .from("documents")
    .select("title")
    .eq("school_id", schoolId)
    .eq("status", "error");

  if (errors?.length) {
    console.log(`\n  [!] ${errors.length} documents in error state:`);
    for (const e of errors) {
      console.log(`      - ${e.title}`);
    }
  }

  console.log("\nDone! Visit /s/demo to see the demo school.");
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\nFATAL:", err);
    process.exit(1);
  });
