import {
  BellRing,
  Contact,
  Globe,
  KeyRound,
  Mail,
  Plug,
  School,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { SettingsSection } from "@/lib/settings/sections";

export const SETTINGS_SECTION_ICONS: Record<SettingsSection, LucideIcon> = {
  school: School,
  app: BellRing,
  assistant: Sparkles,
  contacts: Contact,
  email: Mail,
  website: Globe,
  "sign-in": KeyRound,
  blackbaud: Plug,
};
