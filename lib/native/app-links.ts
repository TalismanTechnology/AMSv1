// The apple-app-site-association file that lets https://askmyschool.app links
// open the iOS app (universal links). Served by
// app/.well-known/apple-app-site-association/route.ts.
//
// Apple ties it to the app by "<Team ID>.<bundle id>". The Team ID comes from
// APPLE_TEAM_ID once the Apple Developer account exists; until then the file
// carries the TEAMID placeholder and simply matches no app.

export const IOS_BUNDLE_ID = "app.askmyschool";
export const TEAM_ID_PLACEHOLDER = "TEAMID";

const TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/;

export function appleTeamId(value: string | undefined): string {
  const trimmed = value?.trim().toUpperCase();
  return trimmed && TEAM_ID_PATTERN.test(trimmed) ? trimmed : TEAM_ID_PLACEHOLDER;
}

export function appleAppSiteAssociation(teamId: string) {
  const appID = `${teamId}.${IOS_BUNDLE_ID}`;

  return {
    applinks: {
      details: [
        {
          appIDs: [appID],
          // Checked in order; the first match wins. Only the signed-in parent
          // area opens the app. Sign-in, the API, staff pages and the
          // marketing site stay in Safari.
          components: [
            { "/": "/auth/*", exclude: true, comment: "OAuth sign-in stays in the browser" },
            { "/": "/api/*", exclude: true },
            { "/": "/s/*/admin*", exclude: true, comment: "Staff pages are web-only" },
            { "/": "/s/*/parent", comment: "Parent dashboard" },
            { "/": "/s/*/parent/*", comment: "Announcements, chat, documents, calendar, profile" },
          ],
        },
      ],
    },
    webcredentials: {
      apps: [appID],
    },
  };
}
