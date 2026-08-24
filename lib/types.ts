export type UserRole = "admin" | "parent";
export type PlatformRole = "admin" | "parent" | "super_admin";

export interface School {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  contact_info: string | null;
  domain: string | null;
  join_code: string | null;
  inbound_email_token: string | null;
  allowed_sender_domains: string[] | null;
  email_ingestion_enabled: boolean | null;
  auto_sort_enabled: boolean | null;
  blackbaud_verification_enabled: boolean | null;
  sso_enabled: boolean | null;
  sso_domain: string | null;
  sso_provider_id: string | null;
  sso_button_label: string | null;
  created_at: string;
  updated_at: string;
}

export interface SchoolMembership {
  id: string;
  user_id: string;
  school_id: string;
  role: UserRole;
  approved: boolean;
  created_at: string;
  school?: School;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: PlatformRole;
  approved: boolean;
  child_grade: string | null;
  created_at: string;
  children?: Child[];
  memberships?: SchoolMembership[];
}

export interface Child {
  id: string;
  parent_id: string;
  name: string;
  grade: string;
  school_id: string;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  color: string;
  school_id: string;
  created_at: string;
}

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  school_id: string;
  created_at: string;
  children?: Folder[];
}

export interface Document {
  id: string;
  title: string;
  description: string | null;
  summary: string | null;
  file_name: string;
  file_type: string;
  file_url: string;
  pdf_url?: string | null;
  text_url?: string | null;
  file_size: number | null;
  category_id: string | null;
  folder_id: string | null;
  tags: string[];
  status: "processing" | "pending" | "ready" | "error";
  error_message: string | null;
  page_count: number | null;
  uploaded_by: string | null;
  school_id: string;
  created_at: string;
  updated_at: string;
  category?: Category | null;
  folder?: Folder | null;
}

export interface DocumentChunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  metadata: Record<string, unknown>;
  similarity?: number;
}

export interface ChatSession {
  id: string;
  user_id: string;
  title: string | null;
  school_id: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  sources: ChatSource[];
  school_id: string;
  created_at: string;
}

export type ChatSourceType = "document" | "announcement" | "event";

export interface ChatSource {
  document_id: string;
  title: string;
  chunk_content: string;
  similarity: number;
  file_url?: string;
  file_type?: string;
  chunk_index?: number;
  source_number?: number;
  source_type?: ChatSourceType;
  // Per-chunk location within the source document. Populated when the parser
  // can extract structure: page number for PDFs, sheet name for XLSX, slide
  // number for PPTX, section heading for DOCX. Null when the file type doesn't
  // have a meaningful intra-document location.
  location?: ChatSourceLocation | null;
}

export interface ChatSourceLocation {
  // Short human-readable label for display, e.g. "p. 14" or "Sheet: Q3" or
  // "Slide 5" or "§3 Cafeteria Policy". Always non-empty when location is set.
  label: string;
  // Raw fields the label was derived from; useful for sorting/highlighting.
  page?: number;
  sheet?: string;
  slide?: number;
  section?: string;
}

export interface ContentSearchResult {
  document_id: string;
  document_title: string;
  snippet: string;
  chunk_index: number;
  rank: number;
}

export interface PreviewResult {
  document_id: string;
  title: string;
  file_type: string;
  file_url: string;
  description: string | null;
  chunk_preview: string;
}

export interface AnalyticsEvent {
  id: string;
  event_type: string;
  user_id: string | null;
  metadata: Record<string, unknown>;
  school_id: string;
  created_at: string;
}

export type EventType = "general" | "academic" | "sports" | "arts" | "meeting" | "holiday" | "other";

export type EventCalendarKind = "division" | "category";

// An admin-defined calendar parents can filter by. Two
// kinds: 'division' (Lower/Middle/Upper) and 'category'
// (Athletics, Arts, ...). Events are tagged with any
// number of these via the event_calendar_links table.
export interface EventCalendar {
  id: string;
  school_id: string;
  kind: EventCalendarKind;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
}

/** Where an event came from. Blackbaud events arrive via a synced iCal feed. */
export type EventSource = "manual" | "import" | "blackbaud";

export interface SchoolEvent {
  id: string;
  title: string;
  description: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  event_type: EventType;
  created_by: string | null;
  school_id: string;
  source: EventSource;
  blackbaud_event_id: string | null;
  created_at: string;
  updated_at: string;
  // Divisions + categories this event is tagged with.
  // Populated when fetched with the event_calendars embed.
  calendars?: EventCalendar[];
}

export type AnnouncementPriority = "normal" | "important" | "urgent";

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: AnnouncementPriority;
  pinned: boolean;
  expires_at: string | null;
  created_by: string | null;
  school_id: string;
  created_at: string;
  updated_at: string;
}

export interface Settings {
  school_id: string;
  school_name: string;
  logo_url: string | null;
  contact_info: string | null;
  custom_system_prompt: string | null;
  ai_temperature: number;
  suggested_questions: string[];
  welcome_message: string | null;
  disable_animations: boolean;
  require_join_code: boolean;
  require_approval: boolean;
  updated_at: string;
}

// ── Blackbaud calendar sync ──────────────────────────

/** An iCal subscription published by a school's Blackbaud site. */
export interface BlackbaudCalendarFeed {
  id: string;
  school_id: string;
  label: string;
  url: string;
  timezone: string;
  is_active: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export type StagedEventStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "superseded";

/** How an occurrence got its division/category tags. */
export type TagSource = "none" | "mapping" | "ai";

/**
 * One synced occurrence awaiting review. Nothing here is visible to parents
 * until an admin approves it into public.events.
 */
export interface StagedBlackbaudEvent {
  id: string;
  school_id: string;
  feed_id: string;
  external_uid: string;
  occurrence_start: string;
  title: string;
  description: string | null;
  location: string | null;
  all_day: boolean;
  local_date: string;
  local_end_date: string | null;
  local_start_time: string | null;
  local_end_time: string | null;
  raw_categories: string[];
  suggested_event_type: EventType;
  tag_source: TagSource;
  tag_confidence: number | null;
  status: StagedEventStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  // Populated when fetched with the suggestions embed.
  suggestedCalendars?: EventCalendar[];
  feedLabel?: string;
}
