import { test, expect, type Page } from "@playwright/test";

/**
 * Next's dev-tools badge renders into a <nextjs-portal> that swallows pointer
 * events over part of the viewport, so clicks fail locally but not in a
 * production build. It isn't part of the app — hide it before interacting.
 */
async function gotoLanding(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto("/");
  await page.addStyleTag({
    content: "nextjs-portal { display: none !important; }",
  });
}

// The breakpoints the project targets. 320 is the floor we support; the header
// previously hid its sign-in button below 640, which left mobile users with no
// route into the app at all.
const WIDTHS = [320, 375, 768, 1024, 1440];

test.describe("landing header", () => {
  for (const width of WIDTHS) {
    test(`sign in is reachable at ${width}px`, async ({ page }) => {
      await gotoLanding(page, width);

      const signIn = page.getByRole("link", { name: "Sign in" });
      await expect(signIn).toBeVisible();
      await expect(signIn).toHaveAttribute("href", "/login");

      // Visible to a screen reader is not enough — it has to be on screen and
      // wide enough to tap.
      const box = await signIn.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    });

    test(`page does not scroll horizontally at ${width}px`, async ({ page }) => {
      await gotoLanding(page, width);

      // Scroll-reveal sections sit translated off-screen until revealed, which
      // used to push the document ~36px wider than the viewport. The root
      // element's scrollWidth is the check that holds across engines —
      // window.scrollX picks up emulated visual-viewport panning in mobile
      // WebKit even when the layout itself is clipped.
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
    });
  }

  test("sign in leads to the login page", async ({ page }) => {
    await gotoLanding(page, 375);
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
