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
    await expect(
      page.getByText("Passkeys are not available in this browser").first()
    ).toBeVisible();
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
    await expect(page.getByText("Shielded address pending")).toBeVisible();
    await expect(
      page.getByText("Create or import a shielded RAILGUN wallet in setup.")
    ).toBeVisible();

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
    await page.getByLabel("Ethereum execution RPC").fill("http://127.0.0.1:8545");
    await page.getByRole("button", { name: "Wallet" }).click();

    await expect(
      page.getByRole("button", { name: "Shield", exact: true })
    ).toBeDisabled();
    await expect(review).toBeDisabled();
  });

  test("shows visible defaults and privacy-max clears hosted endpoints", async ({
    page
  }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Nodes" }).click();

    await expect(page.getByLabel("Active preset")).toHaveValue("bindle-default");
    await expect(page.getByLabel("Ethereum execution RPC")).toHaveValue(
      "https://ethereum-rpc.publicnode.com"
    );
    await expect(page.getByLabel("ERC-4337 bundler")).toHaveValue(
      "https://public.pimlico.io/v2/1/rpc"
    );
    await expect(page.getByText("default").first()).toBeVisible();

    await page.getByLabel("Active preset").selectOption("privacy-max");

    await expect(page.getByLabel("Ethereum execution RPC")).toHaveValue("");
    await expect(page.getByLabel("ERC-4337 bundler")).toHaveValue("");
    await expect(page.getByLabel("ERC-4337 paymaster")).toHaveValue("");
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
      await page.getByRole("button", { name: "Nodes" }).click();
      await page.getByLabel("Active preset").selectOption("privacy-max");
      await page.getByRole("button", { name: "Wallet" }).click();
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

  test("creates a recoverable local RAILGUN wallet with a real 0zk address", async ({
    page
  }) => {
    await page.addInitScript((address) => {
      window.localStorage.setItem(
        "bindle.wallet.metadata.v1",
        JSON.stringify({
          status: "smart-wallet-planned",
          smartWalletAddress: address,
          railgunAddress: null,
          railgunKeyStore: null,
          passkeyPresent: true,
          mnemonicPresent: false,
          createdAt: "2026-06-03T00:00:00.000Z",
          railgunWalletCreatedAt: null,
          railgunWalletImportedAt: null,
          lastError: null,
          custodyModel: "passkey-4337",
          passkeyCredentialId: "test-passkey",
          passkeyPublicKey: "0x04"
        })
      );
    }, publicRecipient);

    await page.goto("/");

    await expect(page.getByText("0zk address pending")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create shielded wallet" })
    ).toBeDisabled();

    await page.getByLabel("Local passphrase").first().fill("correct horse bindle");
    await page
      .getByLabel("Confirm passphrase")
      .fill("correct horse bindle");
    await page.getByRole("button", { name: "Create shielded wallet" }).click();

    await expect(page.getByText(/0zk[A-Za-z0-9]{16,}/).first()).toBeVisible({
      timeout: 30_000
    });
    await expect(page.getByLabel("Shielded wallet recovery phrase")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start toolkit" })
    ).toBeVisible();

    await page.getByRole("button", { name: "Receive" }).click();

    await expect(page.getByText("Shielded address ready")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy 0zk address" })).toBeVisible();
  });

  test("imports an existing RAILGUN recovery phrase into local encrypted storage", async ({
    page
  }) => {
    await page.addInitScript((address) => {
      window.localStorage.setItem(
        "bindle.wallet.metadata.v1",
        JSON.stringify({
          status: "smart-wallet-planned",
          smartWalletAddress: address,
          railgunAddress: null,
          railgunKeyStore: null,
          passkeyPresent: true,
          mnemonicPresent: false,
          createdAt: "2026-06-03T00:00:00.000Z",
          railgunWalletCreatedAt: null,
          railgunWalletImportedAt: null,
          lastError: null,
          custodyModel: "passkey-4337",
          passkeyCredentialId: "test-passkey",
          passkeyPublicKey: "0x04"
        })
      );
    }, publicRecipient);

    await page.goto("/");

    await page
      .getByLabel("Recovery phrase")
      .fill(
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
      );
    await page.getByLabel("Local passphrase").last().fill("correct horse import");
    await page.getByRole("button", { name: "Import existing" }).click();

    await expect(page.getByText(/0zk[A-Za-z0-9]{16,}/).first()).toBeVisible({
      timeout: 30_000
    });
    await expect(
      page.getByRole("button", { name: "Start toolkit" })
    ).toBeVisible();
  });

  test("persists explicit connection settings locally", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Nodes" }).click();
    await page.getByLabel("Ethereum execution RPC").fill("http://127.0.0.1:8545");
    await page.getByLabel("ERC-4337 bundler").fill("http://127.0.0.1:4337");

    await page.reload();
    await page.getByRole("button", { name: "Nodes" }).click();

    await expect(page.getByLabel("Active preset")).toHaveValue("custom");
    await expect(page.getByLabel("Ethereum execution RPC")).toHaveValue(
      "http://127.0.0.1:8545"
    );
    await expect(page.getByLabel("ERC-4337 bundler")).toHaveValue(
      "http://127.0.0.1:4337"
    );
    await expect(page.getByLabel("ERC-4337 paymaster")).toHaveValue("");
  });

  test("syncs the public funding balance through the visible RPC", async ({
    page
  }) => {
    await page.route("https://ethereum-rpc.publicnode.com/**", async (route) => {
      const payload = JSON.parse(route.request().postData() ?? "{}") as
        | { id: number; method: string }
        | Array<{ id: number; method: string }>;
      const requests = Array.isArray(payload) ? payload : [payload];
      const responses = requests.map((request) => {
        const result =
          request.method === "eth_chainId"
            ? "0x1"
            : request.method === "eth_getBalance"
              ? "0xde0b6b3a7640000"
              : request.method === "eth_blockNumber"
                ? "0x100"
                : null;

        return {
          jsonrpc: "2.0",
          id: request.id,
          result
        };
      });

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(Array.isArray(payload) ? responses : responses[0])
      });
    });

    await page.addInitScript((address) => {
      window.localStorage.setItem(
        "bindle.wallet.metadata.v1",
        JSON.stringify({
          status: "smart-wallet-planned",
          smartWalletAddress: address,
          railgunAddress: null,
          passkeyPresent: true,
          mnemonicPresent: false,
          createdAt: "2026-06-03T00:00:00.000Z",
          lastError: null,
          custodyModel: "passkey-4337",
          passkeyCredentialId: "test-passkey",
          passkeyPublicKey: "0x04"
        })
      );
    }, publicRecipient);

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "-- ETH" })).toBeVisible();
    await expect(page.getByLabel("Unshielded ETH balance")).toContainText(
      "Sync may contact Ethereum RPC (default: https://ethereum-rpc.publicnode.com)"
    );

    await page.getByRole("button", { name: "Sync" }).click();

    await expect(page.getByRole("heading", { name: "1 ETH" })).toBeVisible();
    await expect(page.getByLabel("Unshielded ETH balance")).toContainText(
      "1 ETH"
    );
    await expect(page.getByLabel("Unshielded ETH balance")).toContainText(
      "Shield blocked: real 0zk address, recoverable RAILGUN keys."
    );
    await expect(
      page.getByRole("button", { name: "Shield", exact: true })
    ).toBeDisabled();
    await expect(page.getByText("public synced at block 256")).toBeVisible();
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
