import { expect, test } from "@playwright/test";
import { enableStandalonePwa } from "./support/pwa";

test("browser mode shows public install page instead of wallet UI", async ({
  page
}) => {
  await page.goto("/");

  await expect(page.getByLabel("About Bindle")).toBeVisible();
  await expect(page.getByText("Browser mode: info only")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Simple ETH payments with a privacy boundary you can inspect."
    })
  ).toBeVisible();
  await expect(page.getByLabel("Install Bindle PWA")).toContainText(
    "The wallet UI is available only from the installed app window."
  );
  await expect(page.getByLabel("Bindle wallet")).toHaveCount(0);
});

test("standalone PWA mode shows the wallet UI", async ({ page }) => {
  await enableStandalonePwa(page);
  await page.goto("/");

  await expect(page.getByLabel("Bindle wallet")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Set Up Bindle" })).toBeVisible();
  await expect(page.getByLabel("About Bindle")).toHaveCount(0);
});

test("browser installer offers the current signed Android APK", async ({ page }) => {
  await page.route("**/android-release.json", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      schema: 1,
      versionCode: 2002,
      versionName: "0.2.2",
      commit: "0123456789abcdef0123456789abcdef01234567",
      publishedAt: "2026-09-19T16:00:00.000Z",
      apk: {
        url: "https://github.com/pierce403/bindle/releases/download/android-v0.2.2/bindle-0.2.2.apk",
        sha256: "a".repeat(64),
        bytes: 244318208
      }
    })
  }));

  await page.goto("/");

  const card = page.getByLabel("Download Bindle for Android");
  await expect(card).toBeVisible();
  await expect(card).toContainText("v0.2.2");
  await expect(card).toContainText("Android updates remain manual");
  await expect(card.getByRole("button", { name: "Download APK" })).toBeVisible();
});
