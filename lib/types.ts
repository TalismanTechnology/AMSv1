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
  created_at: string;
  updated_at: string;
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
