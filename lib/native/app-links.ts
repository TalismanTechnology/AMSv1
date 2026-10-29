// The apple-app-site-association file that lets https://askmyschool.app links
// open the iOS app (universal links). Served by
// app/.well-known/apple-app-site-association/route.ts.
//
// Apple ties it to the app by "<Team ID>.<bundle id>". The Team ID is public
// (it's in every signed app), so it lives here and in the Xcode project. A
// valid APPLE_TEAM_ID env var overrides it, e.g. for a different account.

export const IOS_BUNDLE_ID = "app.askmyschool";
export const APPLE_TEAM_ID = "DCVUJWG3YP";

const TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/;

export function appleTeamId(value: string | undefined): string {
  const trimmed = value?.trim().toUpperCase();
  return trimmed && TEAM_ID_PATTERN.test(trimmed) ? trimmed : APPLE_TEAM_ID;
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
            { "/": "/s/*/parent", comment: "Parent home (redirects to chat)" },
            { "/": "/s/*/parent/*", comment: "Chat, documents, calendar, profile" },
          ],
        },
      ],
    },
    webcredentials: {
      apps: [appID],
    },
  };
}
