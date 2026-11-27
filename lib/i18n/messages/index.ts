// The parent-facing UI dictionaries. One file per area under en/ and es/;
// each Spanish file is typed against its English one, so a key missing from
// es (or one es has that en doesn't) fails the typecheck, and
// lib/i18n/i18n.test.ts checks the values (non-empty, same {placeholders}).
//
// To add a string: add it to the en file, then the same key to the es file.
import type { Locale } from "../locale";
import { common as enCommon } from "./en/common";
import { auth as enAuth } from "./en/auth";
import { chat as enChat } from "./en/chat";
import { parent as enParent } from "./en/parent";
import { common as esCommon } from "./es/common";
import { auth as esAuth } from "./es/auth";
import { chat as esChat } from "./es/chat";
import { parent as esParent } from "./es/parent";

export const en = {
  ...enCommon,
  ...enAuth,
  ...enChat,
  ...enParent,
};

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

export const es: Messages = {
  ...esCommon,
  ...esAuth,
  ...esChat,
  ...esParent,
};

export const MESSAGES: Record<Locale, Messages> = { en, es };
