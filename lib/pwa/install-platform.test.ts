import { test } from "node:test";
import assert from "node:assert/strict";
import { decideInstallUi, type InstallEnvironment } from "./install-platform";

const UA = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  edgeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  safariMac17:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  safariMac16:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
  firefoxMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.4; rv:131.0) Gecko/20100101 Firefox/131.0",
  firefoxWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1",
  // iPadOS 13+ desktop-class browsing: identical to Mac Safari, but touch.
  ipadAsMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
};

function env(overrides: Partial<InstallEnvironment>): InstallEnvironment {
  return {
    ua: UA.chromeWindows,
    maxTouchPoints: 0,
    standalone: false,
    native: false,
    hasPrompt: false,
    ...overrides,
  };
}

test("Chromium browsers show the button once beforeinstallprompt fired", () => {
  for (const ua of [UA.chromeMac, UA.chromeWindows, UA.edgeWindows, UA.edgeMac, UA.chromeAndroid]) {
    assert.equal(decideInstallUi(env({ ua, hasPrompt: true })), "prompt", ua);
  }
});

test("Chromium without a deferred prompt shows nothing (not installable yet, or installed)", () => {
  for (const ua of [UA.chromeMac, UA.chromeWindows, UA.edgeWindows, UA.edgeMac]) {
    assert.equal(decideInstallUi(env({ ua })), "hidden", ua);
  }
});

test("desktop Safari 17+ gets the Add to Dock tip", () => {
  assert.equal(decideInstallUi(env({ ua: UA.safariMac17 })), "safari-tip");
});

test("Safari before 17 can't add to the Dock", () => {
  assert.equal(decideInstallUi(env({ ua: UA.safariMac16 })), "hidden");
});

test("Firefox can't install sites", () => {
  assert.equal(decideInstallUi(env({ ua: UA.firefoxMac })), "hidden");
  assert.equal(decideInstallUi(env({ ua: UA.firefoxWindows })), "hidden");
});

test("iPhone and iPad (including iPad reporting as a Mac) show nothing", () => {
  assert.equal(decideInstallUi(env({ ua: UA.iphone, maxTouchPoints: 5 })), "hidden");
  assert.equal(decideInstallUi(env({ ua: UA.chromeIphone, maxTouchPoints: 5 })), "hidden");
  assert.equal(decideInstallUi(env({ ua: UA.ipadAsMac, maxTouchPoints: 5 })), "hidden");
  assert.equal(
    decideInstallUi(env({ ua: UA.ipadAsMac, maxTouchPoints: 5, hasPrompt: true })),
    "hidden"
  );
});

test("already installed or inside the native app: nothing", () => {
  assert.equal(decideInstallUi(env({ hasPrompt: true, standalone: true })), "hidden");
  assert.equal(decideInstallUi(env({ hasPrompt: true, native: true })), "hidden");
  assert.equal(decideInstallUi(env({ ua: UA.safariMac17, standalone: true })), "hidden");
  assert.equal(decideInstallUi(env({ ua: UA.chromeAndroid, native: true, hasPrompt: true })), "hidden");
});
