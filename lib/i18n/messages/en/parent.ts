// Parent-facing strings: the parent area shell (sidebar, mobile header,
// notifications), the profile / documents / contacts / calendar pages and the
// shared components they use. See lib/i18n/messages/index.ts.
//
// The shared components (calendar, add to calendar, document viewer, school
// switcher, install button) also render on admin pages, outside the locale
// provider, where these English strings are used as-is: keep them identical
// to the text they replaced.
export const parent = {
  // Shared actions
  "parent.action.cancel": "Cancel",
  "parent.action.save": "Save",

  // Sidebar / mobile drawer
  "parent.nav.chat": "Chat",
  "parent.nav.documents": "Documents",
  "parent.nav.contacts": "Contacts",
  "parent.nav.calendar": "Calendar",
  "parent.nav.profile": "Profile",
  "parent.nav.chats": "Chats",
  "parent.nav.joinSchool": "Join School",
  "parent.nav.account": "Account",
  "parent.nav.signOut": "Sign out",
  "parent.mobile.openMenu": "Open menu",
  "parent.mobile.navigation": "Navigation",

  // Notification bell
  "parent.notifications.title": "Notifications",
  "parent.notifications.markAllRead": "Mark all read",
  "parent.notifications.loading": "Loading",
  "parent.notifications.empty": "No notifications yet",

  // "Add your children" prompt
  "parent.addChildren.title": "Add your children",
  "parent.addChildren.description":
    "Tell us who your children are so answers can be tailored to their grade. You can also do this any time in Profile.",
  "parent.addChildren.skip": "Skip for now",
  "parent.addChildren.add": "Add children",

  // Error page
  "parent.error.title": "Something went wrong",
  "parent.error.body": "An unexpected error occurred. Please try again.",
  "parent.error.retry": "Try again",

  // Install app button
  "parent.install.label": "Install app",
  "parent.install.safariTipBefore": "In Safari, choose ",
  "parent.install.safariTipMenu": "File > Add to Dock",
  "parent.install.safariTipAfter": ".",

  // Join school dialog
  "parent.joinSchool.title": "Add a school",
  "parent.joinSchool.description": "Choose the school and sign in with its Blackbaud account.",
  "parent.joinSchool.allJoinedBefore":
    "You're already in every school on AskMySchool. If your school isn't listed, ask your school office or ",
  "parent.joinSchool.contactUs": "contact us",
  "parent.joinSchool.allJoinedAfter": ".",
  "parent.joinSchool.pending": "Waiting for approval: {schools}",

  // School switcher
  "parent.schoolSwitcher.otherSchool": "Other school",
  "parent.schoolSwitcher.switchTo": "Switch to {school}",
  "parent.schoolSwitcher.switching": "Switching…",
  "parent.schoolSwitcher.switchSchool": "Switch school",
  "parent.schoolSwitcher.unknownSchool": "Unknown School",
  "parent.schoolSwitcher.role.admin": "admin",
  "parent.schoolSwitcher.role.parent": "parent",

  // Profile
  "parent.profile.title": "Profile",
  "parent.profile.subtitle": "Manage your details and your children.",
  "parent.profile.personalInfo": "Personal Information",
  "parent.profile.personalInfoHint": "Manage your account details.",
  "parent.profile.fullName": "Full Name",
  "parent.profile.namePlaceholder": "Your name",
  "parent.profile.email": "Email",
  "parent.profile.joined": "Joined {date}",
  "parent.profile.nameUpdated": "Name updated",
  "parent.profile.language": "Language",
  "parent.profile.languageHint": "The language Ask My School uses for you.",
  "parent.profile.languageRow": "Language / Idioma",
  "parent.profile.children": "Children",
  "parent.profile.childrenHint":
    "Manage your children's information. Grades move up automatically each school year on {date}.",
  "parent.profile.addChild": "Add child",
  "parent.profile.editChild": "Edit child",
  "parent.profile.noChildren": 'No children added yet. Click "Add child" to get started.',
  "parent.profile.graduated": "Graduated",
  "parent.profile.classOf": "Class of {year}",
  "parent.profile.childUpdated": "Child updated",
  "parent.profile.childAdded": "Child added",
  "parent.profile.childRemoved": "Child removed",
  "parent.profile.childName": "Name",
  "parent.profile.childNamePlaceholder": "Child's name",
  "parent.profile.gradeLevel": "Grade level",
  "parent.profile.selectGrade": "Select grade level",
  "parent.profile.gradeHint":
    "The grade your child is enrolled in — not their age. It moves up on its own each school year; change it here if it's wrong.",
  "parent.profile.add": "Add",
  "parent.profile.removeChildTitle": "Remove child",
  "parent.profile.removeChildDescription":
    "Are you sure you want to remove this child? This action cannot be undone.",
  "parent.profile.remove": "Remove",

  // Grade labels (display only; stored values never change). Must match lib/grades.ts.
  "parent.grade.Pre-K": "Pre-K",
  "parent.grade.K": "Kindergarten",
  "parent.grade.1": "1st Grade",
  "parent.grade.2": "2nd Grade",
  "parent.grade.3": "3rd Grade",
  "parent.grade.4": "4th Grade",
  "parent.grade.5": "5th Grade",
  "parent.grade.6": "6th Grade",
  "parent.grade.7": "7th Grade",
  "parent.grade.8": "8th Grade",
  "parent.grade.9": "9th Grade",
  "parent.grade.10": "10th Grade",
  "parent.grade.11": "11th Grade",
  "parent.grade.12": "12th Grade",

  // Profile: notifications
  "parent.notificationSettings.title": "Notifications",
  "parent.notificationSettings.description":
    "Notifications arrive in the AskMySchool app for iPhone and Android.",
  "parent.notificationSettings.newDocuments": "New documents",
  "parent.notificationSettings.newDocumentsHint":
    "Get a notification when {school} adds new documents.",
  "parent.notificationSettings.yourSchool": "your school",

  // Profile: AI consent
  "parent.ai.title": "AI processing",
  "parent.ai.subtitle": "How your questions are answered.",
  "parent.ai.notice":
    "To answer a question, AskMySchool sends it, along with the relevant excerpts from your school's documents, to Google's Gemini AI. Your children are described by grade level, not by name. AI answers can be wrong, so check the linked documents for anything important. See our ",
  "parent.ai.privacyPolicy": "Privacy Policy",
  "parent.ai.noticeEnd": ".",
  "parent.ai.on": "On",
  "parent.ai.agreed": "agreed {date}",
  "parent.ai.off": "Off",
  "parent.ai.offHint": "you'll be asked before your next question",
  "parent.ai.withdraw": "Withdraw consent",
  "parent.ai.agree": "Agree",
  "parent.ai.supportQuestion": "Questions about your account?",
  "parent.ai.getSupport": "Get support",
  "parent.ai.confirmTitle": "Withdraw consent to AI processing?",
  "parent.ai.confirmDescription":
    "You won't be able to ask questions until you agree again. Your past conversations stay in your history.",
  "parent.ai.confirmWithdraw": "Withdraw",
  "parent.ai.turnedOff": "AI processing turned off",
  "parent.ai.turnedOn": "AI processing turned on",

  // Profile: delete account
  "parent.deleteAccount.title": "Delete account",
  "parent.deleteAccount.subtitle": "Permanently delete your AskMySchool account and everything in it.",
  "parent.deleteAccount.summary":
    "Your chats, feedback, children and notification settings are deleted. Your Blackbaud account isn't affected.",
  "parent.deleteAccount.button": "Delete my account",
  "parent.deleteAccount.confirmTitle": "Delete your account?",
  "parent.deleteAccount.confirmDescription":
    "This permanently deletes your account, chat history, feedback, children and push notification devices at every school you belong to. It can't be undone. If you sign in with Blackbaud again later, you'll start with a new, empty account.",
  "parent.deleteAccount.typeBefore": "Type ",
  "parent.deleteAccount.typeAfter": " to confirm",

  // Documents
  "parent.documents.title": "Documents",
  "parent.documents.subtitle": "Browse school documents and resources.",
  "parent.documents.searchTitle": "Search by title...",
  "parent.documents.searchContent": "Search document content...",
  "parent.documents.switchToContent": "Switch to searching document content",
  "parent.documents.switchToTitle": "Switch to searching titles",
  "parent.documents.modeContent": "Content",
  "parent.documents.modeTitle": "Title",
  "parent.documents.category": "Category",
  "parent.documents.allCategories": "All Categories",
  "parent.documents.clear": "Clear",
  "parent.documents.searching": "Searching content…",
  "parent.documents.contentMatchOne": "{count} content match",
  "parent.documents.contentMatchOther": "{count} content matches",
  "parent.documents.section": "Section {number}",
  "parent.documents.noContentMatches": "No content matches found.",
  "parent.documents.empty": "No documents found",
  "parent.documents.emptyFiltered": "Try adjusting your search or filters.",
  "parent.documents.emptyNone": "Check back later for school documents.",
  "parent.documents.general": "General",

  // Contacts
  "parent.contacts.title": "Contacts",
  "parent.contacts.subtitle": "Find the right person or office at school.",
  "parent.contacts.searchPlaceholder": "Search by name, role, department or topic...",
  "parent.contacts.searchLabel": "Search contacts",
  "parent.contacts.clearSearch": "Clear search",
  "parent.contacts.departments": "Departments",
  "parent.contacts.all": "All",
  "parent.contacts.countOne": "{count} contact",
  "parent.contacts.countOther": "{count} contacts",
  "parent.contacts.empty": "No contacts found",
  "parent.contacts.emptyFiltered": "Try a different search.",
  "parent.contacts.emptyNone": "Your school hasn't added its staff directory yet.",
  "parent.contacts.other": "Other",
  "parent.contacts.topic.transportation": "Transportation",
  "parent.contacts.topic.health": "Health & nurse",
  "parent.contacts.topic.tuition_billing": "Tuition & billing",
  "parent.contacts.topic.schedules_calendar": "Schedules & calendar",
  "parent.contacts.topic.athletics": "Athletics",
  "parent.contacts.topic.admissions": "Admissions",
  "parent.contacts.topic.academics": "Academics",
  "parent.contacts.topic.technology": "Technology",
  "parent.contacts.topic.after_school": "After school",
  "parent.contacts.topic.parents_association": "Parents association",
  "parent.contacts.topic.main_office": "Main office / general",

  // Calendar
  "parent.calendar.addToCalendar": "Add to calendar",
  "parent.calendar.addEventToCalendar": "Add {title} to calendar",
  "parent.calendar.edit": "Edit",
  "parent.calendar.delete": "Delete",
  "parent.calendar.editEvent": "Edit event",
  "parent.calendar.deleteEvent": "Delete event",
  "parent.calendar.eventCountSrOne": ", {count} event",
  "parent.calendar.eventCountSrOther": ", {count} events",
  "parent.calendar.more": "+{count} more",
  "parent.calendar.allDay": "all day",
  "parent.calendar.createEvent": "Create event",
  "parent.calendar.createEventPlus": "+ Create event",
  "parent.calendar.viewLabel": "Calendar view",
  "parent.calendar.view.month": "month",
  "parent.calendar.view.week": "week",
  "parent.calendar.view.day": "day",
  "parent.calendar.today": "Today",
  "parent.calendar.previous": "Previous",
  "parent.calendar.next": "Next",
  "parent.calendar.labels": "Labels",
  "parent.calendar.noLabel": "No label",
  "parent.calendar.dayCountOne": "— {count} event",
  "parent.calendar.dayCountOther": "— {count} events",
  "parent.calendar.noEvents": "No events on this day",

  // Add to calendar menu (Apple / Google Calendar are product names)
  "parent.addToCalendar.appleError": "Couldn't open Apple Calendar. Please try again.",
  "parent.addToCalendar.applePreparing": "Apple Calendar…",
  "parent.addToCalendar.appleUnavailable": "Apple Calendar unavailable",
  "parent.addToCalendar.icsFile": "Calendar file (.ics)",

  // Document viewer / source renderer
  "parent.viewer.download": "Download",
  "parent.viewer.renderFailed": "Failed to render document preview.",
  "parent.source.noText": "No text to show for this document.",
  "parent.source.unknownSender": "Unknown sender",
  "parent.source.to": "To: {value}",
  "parent.source.cc": "Cc: {value}",
  "parent.source.from": "From: {value}",
  "parent.source.subject": "Subject: {value}",
  "parent.source.noEmailText": "This email has no text.",
  "parent.source.hideQuoted": "Hide quoted text",
  "parent.source.showQuoted": "Show quoted text",
  "parent.source.forwarded": "Forwarded message",
  "parent.source.viewOriginal": "View original page",
  "parent.source.emailFrame": "Email message",
};
