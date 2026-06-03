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
