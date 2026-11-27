// Parent-facing strings: chat. See lib/i18n/messages/index.ts.
//
// Rich strings mark bold / link spans with <b>…</b>, <terms>…</terms> and
// <privacy>…</privacy> (rendered by components/chat/rich-text.tsx).
export const chat = {
  // Chat column
  "chat.conversation": "Conversation",
  "chat.newChat": "New chat",
  "chat.inputPlaceholder": "Ask a question about your school…",
  "chat.send": "Send",
  "chat.sending": "Sending…",
  "chat.searchingDocuments": "Searching documents",
  "chat.consentNotice":
    "To get answers, agree to AI processing — send your question again to see the notice.",
  "chat.errorUnavailable":
    "Ask My School is temporarily unavailable. Please try again in a little while.",
  "chat.previewSearching": 'Searching for documents matching "{query}"...',
  "chat.previewNone": 'No documents found matching "{query}".',
  "chat.previewFound": 'Found {count} document(s) matching "{query}":',

  // Empty state
  "chat.welcomeHeading": "Ask about your school",
  "chat.welcomeText": "Get instant answers from official school documents.",
  "chat.defaultQuestion1": "What are the school hours?",
  "chat.defaultQuestion2": "What is the dress code policy?",
  "chat.defaultQuestion3": "How do I contact my child's teacher?",
  "chat.defaultQuestion4": "What are the lunch options?",
  "chat.defaultQuestion5": "When is the next parent-teacher conference?",
  "chat.defaultQuestion6": "What is the attendance policy?",

  // An answer
  "chat.searchWeb": "Search the web",
  "chat.whoToContact": "Who to contact",
  "chat.helpful": "Helpful",
  "chat.notHelpful": "Not helpful",
  "chat.notHelpfulTitle":
    "Not helpful — lets your school see this question and answer so they can improve",
  "chat.shareAnswer": "Share answer",
  "chat.shareTitle": "AskMySchool answer",
  "chat.answerCopied": "Answer copied",
  "chat.shareFailed": "Couldn't share this answer",
  "chat.shareSourcesHeading": "Sources:",
  "chat.shareFrom": "From AskMySchool",

  // Sources
  "chat.sources": "Sources",
  "chat.source": "Source",
  "chat.sourceNumber": "Source {n}",
  "chat.citationLabel": "Source {n}: {title}",
  "chat.calendarEvent": "Calendar event",
  "chat.addToCalendar": "Add {title} to calendar",
  "chat.openPassage": "Open {title}",
  "chat.openPassageAt": "Open {title} at {label}",
  "chat.openWebPage": "Open the web page",
  "chat.openFullscreen": "Open fullscreen",
  "chat.download": "Download",
  "chat.sourceSheetDescription": "The school document this answer cites.",
  "chat.renderFailed": "Failed to render document preview.",
  "chat.announcement": "Announcement",
  "chat.event": "Event",
  "chat.clarification": "Clarification",
  "chat.openViewer": "Open viewer",
  "chat.openInSidebar": "Open in sidebar",
  "chat.visitPage": "Visit page",

  // Export
  "chat.exportChat": "Export chat",
  "chat.exportText": "Download as Text",
  "chat.exportPrint": "Print / Save as PDF",
  "chat.exportDefaultTitle": "Chat Export",
  "chat.exportYou": "You",
  "chat.exportAssistant": "Assistant",

  // AI consent dialog
  "chat.consentTitle": "Before you ask: how answers are made",
  "chat.consentDescription": "AskMySchool uses AI to answer your questions.",
  "chat.consentBullet1":
    "When you ask a question, <b>your question</b> and <b>the relevant excerpts from your school's documents</b> are sent to <b>Google's Gemini AI</b> to write the answer. Your children's grade levels may be included so answers fit their division, but their names are removed first.",
  "chat.consentBullet2":
    "<b>AI answers can be wrong.</b> Check the linked school documents for anything important, and contact the school if something doesn't look right.",
  "chat.consentBullet3":
    "Your data isn't used to train our models. We use Google's paid Gemini API, under which Google doesn't use it to train its models either.",
  "chat.consentBullet4": "You can withdraw this at any time from your Profile.",
  "chat.consentTerms":
    "The privacy policy and terms shown when you signed in with Blackbaud (or your school's other sign-in service) cover that account only. Your use of AskMySchool is governed by AskMySchool's own <terms>Terms of Service</terms> and <privacy>Privacy Policy</privacy>.",
  "chat.notNow": "Not now",
  "chat.saving": "Saving…",
  "chat.agree": "Agree",

  // Chat history
  "chat.chats": "Chats",
  "chat.showChats": "Show chats",
  "chat.hideChats": "Hide chats",
  "chat.historyEmpty":
    "Your chats will appear here. They're kept for 30 days after your last message.",
  "chat.groupToday": "Today",
  "chat.groupYesterday": "Yesterday",
  "chat.groupPrevious7Days": "Previous 7 days",
  "chat.groupOlder": "Older",
  "chat.chatName": "Chat name",
  "chat.saveName": "Save name",
  "chat.cancelRename": "Cancel rename",
  "chat.rename": "Rename",
  "chat.renameChat": "Rename “{title}”",
  "chat.delete": "Delete",
  "chat.deleteChat": "Delete “{title}”",
  "chat.deleteConfirmTitle": "Delete chat?",
  "chat.deleteConfirmBody": "“{title}” will be removed from your chats. This can't be undone.",
  "chat.cancel": "Cancel",
  "chat.deleting": "Deleting…",
  "chat.loadFailed": "Couldn't load this chat. {error}",
  "chat.tryAgain": "Try again",
  "chat.pleaseTryAgain": "Please try again.",
  "chat.renameFailed": "Couldn't rename the chat. Please try again.",
  "chat.deleteFailed": "Couldn't delete the chat. Please try again.",
};
