import { expect, test } from "@playwright/test";

const publicRecipient = "0x000000000000000000000000000000000000dEaD";

test.describe("passkey-first onboarding", () => {
  test("starts from an honest passkey smart-wallet gate with no fake addresses", async ({
    page
  }) => {
    await page.goto("/");

    await expect(page.getByLabel("Bindle wallet")).toBeVisible();
    await expect(page.getByRole("heading", { name: "-- ETH" })).toBeVisible();
    await expect(page.getByText("not created")).toBeVisible();
    await expect(page.getByLabel("Unshielded ETH balance")).toContainText(
      "not synced"
    );
    await expect(
      page.getByRole("button", { name: "Shield", exact: true })
    ).toBeDisabled();

    await page.getByRole("button", { name: "Receive" }).click();

    await expect(page.getByRole("heading", { name: "Receive ETH" })).toBeVisible();
    await expect(
      page.getByText("Passkey smart wallet not wired yet")
    ).toBeVisible();
    await expect(
      page.getByText(/before showing a real public or 0zk address/)
    ).toBeVisible();

    const createWithPasskey = page.getByRole("button", {
      name: "Create Bindle with passkey"
    });
    await expect(createWithPasskey).toBeVisible();
    await expect(createWithPasskey).toBeDisabled();

    await expect(page.getByText(/0x[0-9a-fA-F]{40}/)).toHaveCount(0);
    await expect(page.getByText(/0zk[A-Za-z0-9]{16,}/)).toHaveCount(0);
  });

  test("keeps send review and ETH shielding disabled before real wallet setup", async ({
    page
  }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Send" }).click();

    const review = page.getByRole("button", { name: "Review" });
    await expect(review).toBeDisabled();

    await page.getByLabel("Amount").fill("0.25");
    await page.getByLabel("To").fill(publicRecipient);

    await expect(page.getByText("Public EVM address")).toBeVisible();
    await expect(review).toBeDisabled();

    await page.getByRole("button", { name: "Nodes" }).click();
    await page.getByLabel("Ethereum RPC").fill("http://127.0.0.1:8545");
    await page.getByRole("button", { name: "Wallet" }).click();

    await expect(
      page.getByRole("button", { name: "Shield", exact: true })
    ).toBeDisabled();
    await expect(review).toBeDisabled();
  });

  test.fixme(
    "enrolls a virtual passkey and shows the real smart-wallet public address",
    async ({ page, context, browserName }) => {
      test.skip(
        browserName !== "chromium",
        "WebAuthn virtual authenticators are Chromium CDP-only"
      );

      const cdpSession = await context.newCDPSession(page);
      await cdpSession.send("WebAuthn.enable");
      await cdpSession.send("WebAuthn.addVirtualAuthenticator", {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true
        }
      });

      await page.goto("/");
      await page.getByRole("button", { name: "Receive" }).click();
      await page.getByRole("button", { name: "Create Bindle with passkey" }).click();

      await expect(page.getByText("Passkey enrolled")).toBeVisible();
      await expect(page.getByText(/0x[0-9a-fA-F]{40}/)).toBeVisible();
    }
  );

  test.fixme(
    "reviews a real public ETH shield sweep into the RAILGUN shielded area",
    async ({ page }) => {
      await page.goto("/");

      await page.getByRole("button", { name: "Receive" }).click();
      await page.getByRole("button", { name: "Create Bindle with passkey" }).click();
      await expect(page.getByText(/0x[0-9a-fA-F]{40}/)).toBeVisible();

      await page.getByRole("button", { name: "Shield" }).click();
      await page.getByLabel("Amount").fill("0.1");

      await expect(page.getByRole("button", { name: "Review shield" })).toBeEnabled();
    }
  );
});
