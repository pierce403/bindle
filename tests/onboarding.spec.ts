import { expect, test } from "@playwright/test";

const publicRecipient = "0x000000000000000000000000000000000000dEaD";

test.describe("passkey-first onboarding", () => {
  test("starts from an honest passkey smart-wallet gate with no fake addresses", async ({
    page
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "PublicKeyCredential", {
        configurable: true,
        value: undefined
      });
    });

    await page.goto("/");

    await expect(page.getByLabel("Bindle wallet")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Set Up Bindle" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create passkey" })).toBeDisabled();
    await expect(page.getByRole("heading", { name: "-- ETH" })).toBeVisible();
    await expect(page.getByText("not created").first()).toBeVisible();
    await expect(page.getByLabel("Unshielded ETH balance")).toContainText(
      "not synced"
    );
    await expect(
      page.getByRole("button", { name: "Shield", exact: true })
    ).toBeDisabled();

    await page.getByRole("button", { name: "Receive" }).click();

    await expect(page.getByRole("heading", { name: "Receive ETH" })).toBeVisible();
    await expect(page.getByText("Passkey not available")).toBeVisible();
    await expect(
      page.getByText("Passkeys are not available in this browser").first()
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

  test("shows ERC-4337 endpoints as off by default", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Nodes" }).click();

    await expect(page.getByLabel("Ethereum RPC")).toHaveValue("");
    await expect(page.getByLabel("ERC-4337 bundler")).toHaveValue("");
    await expect(page.getByLabel("Paymaster")).toHaveValue("");
    await expect(page.getByLabel("Passkey attestation")).toHaveValue("");
    await expect(page.getByLabel("Wallet recovery")).toHaveValue("");
    await expect(page.getByText("ERC-4337 bundler").first()).toBeVisible();
    await expect(page.getByText("Paymaster").first()).toBeVisible();
    await expect(page.getByText("Passkey attestation").first()).toBeVisible();
    await expect(page.getByText("Wallet recovery").first()).toBeVisible();
  });

  test(
    "enrolls a virtual passkey without inventing wallet addresses",
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
      await expect(page.getByRole("heading", { name: "Set Up Bindle" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Create passkey" })).toBeEnabled();
      await page.getByRole("button", { name: "Create passkey" }).click();

      await expect(page.getByText("funding passkey enrolled")).toBeVisible();
      await expect(page.getByRole("button", { name: "Open Connections" })).toBeVisible();
      await expect(page.getByText("Smart-wallet address pending")).toBeVisible();
      await page.getByRole("button", { name: "Receive" }).click();
      await page.getByRole("button", { name: "Public" }).click();
      await expect(page.getByRole("button", { name: "Configure RPC" })).toBeVisible();
      await expect(page.getByText(/0x[0-9a-fA-F]{40}/)).toHaveCount(0);
      await expect(page.getByText(/0zk[A-Za-z0-9]{16,}/)).toHaveCount(0);
    }
  );

  test("persists explicit connection settings locally", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Nodes" }).click();
    await page.getByLabel("Ethereum RPC").fill("http://127.0.0.1:8545");
    await page.getByLabel("ERC-4337 bundler").fill("http://127.0.0.1:4337");

    await page.reload();
    await page.getByRole("button", { name: "Nodes" }).click();

    await expect(page.getByLabel("Ethereum RPC")).toHaveValue(
      "http://127.0.0.1:8545"
    );
    await expect(page.getByLabel("ERC-4337 bundler")).toHaveValue(
      "http://127.0.0.1:4337"
    );
    await expect(page.getByLabel("Paymaster")).toHaveValue("");
  });

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
