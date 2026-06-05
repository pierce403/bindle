import { expect, test } from "@playwright/test";
import { enableStandalonePwa } from "./support/pwa";

const publicRecipient = "0x000000000000000000000000000000000000dEaD";

test.describe("passkey-first onboarding", () => {
  test.beforeEach(async ({ page }) => {
    await enableStandalonePwa(page);
  });

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
    await expect(page.getByRole("heading", { name: "$--" })).toBeVisible();
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

  test("builds a USDC pay route review without enabling submission", async ({
    page
  }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "Pay" }).click();

    await expect(page.getByRole("heading", { name: "Private Pay" })).toBeVisible();
    await page.getByRole("button", { name: /USDC/ }).click();
    await page.getByLabel("Pay amount").fill("5");
    await page.getByLabel("Pay recipient").fill("deanpierce.eth");
    await page.getByRole("button", { name: "Review Private Pay route" }).click();

    await expect(page.getByLabel("Review pay route")).toContainText(
      "ETH to USDC through Uniswap v4"
    );
    await expect(page.getByLabel("Review pay route")).toContainText(
      "Onchain v4 Quoter through the visible Ethereum RPC"
    );
    await expect(page.getByLabel("Review pay route")).toContainText("Max 1%");
    await expect(page.getByLabel("Review pay route")).toContainText(
      "Private change to 0zk required; not wired yet"
    );
    await expect(page.getByLabel("Review pay route")).toContainText(
      "Private Pay requires leftover swap/change funds to return privately to your 0zk"
    );
    await expect(page.getByLabel("Review pay route")).toContainText(
      "5 USDC to deanpierce.eth"
    );
    await expect(page.getByLabel("Review pay route")).toContainText(
      "Private source"
    );
    await expect(page.getByLabel("Review pay route")).toContainText(
      "RAILGUN 0zk"
    );
    await expect(page.getByLabel("Review pay route")).toContainText(
      "RAILGUN Broadcaster only"
    );
    await expect(page.getByLabel("Review pay route")).toContainText(
      "Broadcaster fee token"
    );
    await expect(page.getByLabel("Review pay route")).toContainText("USDC");
    await expect(page.getByLabel("Review pay route")).toContainText(
      "Broadcaster fee"
    );
    await expect(page.getByLabel("Review pay route")).toContainText("unquoted");
    await expect(page.getByLabel("Review pay route")).toContainText(
      "Public settlement"
    );
    await expect(page.getByLabel("Review pay route")).toContainText(
      "Target token"
    );
    await expect(page.getByLabel("Review pay route")).toContainText(
      "USDC on Ethereum mainnet"
    );
    await expect(page.getByLabel("Review pay route")).toContainText(
      "Route provider"
    );
    await expect(page.getByLabel("Review pay route")).toContainText(
      "Uniswap v4"
    );
    await expect(page.getByLabel("Review pay route")).toContainText("Blocked");
    await expect(page.getByLabel("Review pay route")).toContainText(
      "configured; Waku enabled"
    );
    await expect(page.getByLabel("Review pay route")).toContainText(
      "Create or import a shielded 0zk wallet."
    );
    await expect(page.getByLabel("Proof generation progress")).toContainText(
      "ETH to USDC through Uniswap v4"
    );
    await expect(page.getByLabel("Proof generation progress")).toContainText(
      "RAILGUN unshield proof"
    );
    await expect(
      page.getByRole("button", { name: "Generate proof and pay" })
    ).toBeDisabled();

    const payButtonBox = await page
      .getByRole("button", { name: "Generate proof and pay" })
      .boundingBox();
    const navBox = await page
      .getByRole("navigation", { name: "App sections" })
      .boundingBox();

    expect(payButtonBox).not.toBeNull();
    expect(navBox).not.toBeNull();

    if (payButtonBox && navBox) {
      const overlapsNav =
        payButtonBox.x < navBox.x + navBox.width &&
        payButtonBox.x + payButtonBox.width > navBox.x &&
        payButtonBox.y < navBox.y + navBox.height &&
        payButtonBox.y + payButtonBox.height > navBox.y;

      expect(overlapsNav).toBe(false);
    }
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
    await expect(page.getByLabel("RAILGUN sync indexer")).toHaveValue(
      "https://rail-squid.squids.live/squid-railgun-ethereum-v2/v/v1/graphql"
    );
    await expect(page.getByLabel("RAILGUN proving artifacts")).toHaveValue(
      "/railgun-artifacts/"
    );
    await expect(page.getByLabel("Quote source")).toHaveValue(
      "onchain:uniswap-v4"
    );
    await expect(page.getByLabel("Auto-start toolkit")).toBeChecked();
    await expect(page.getByText("default").first()).toBeVisible();

    await page.getByLabel("Active preset").selectOption("privacy-max");

    await expect(page.getByLabel("Ethereum execution RPC")).toHaveValue("");
    await expect(page.getByLabel("RAILGUN sync indexer")).toHaveValue("");
    await expect(page.getByLabel("RAILGUN proving artifacts")).toHaveValue("");
    await expect(page.getByLabel("ERC-4337 bundler")).toHaveValue("");
    await expect(page.getByLabel("ERC-4337 paymaster")).toHaveValue("");
    await expect(page.getByLabel("Quote source")).toHaveValue("");
    await expect(page.getByLabel("Auto-start toolkit")).not.toBeChecked();
    await expect(page.getByLabel("Passkey attestation")).toHaveValue("");
    await expect(page.getByLabel("Wallet recovery")).toHaveValue("");
    await expect(page.getByText("ERC-4337 bundler").first()).toBeVisible();
    await expect(page.getByText("Paymaster").first()).toBeVisible();
    await expect(page.getByText("Passkey attestation").first()).toBeVisible();
    await expect(page.getByText("Wallet recovery").first()).toBeVisible();
    await expect(page.getByText("RAILGUN sync indexer").first()).toBeVisible();
    await expect(page.getByText("RAILGUN proving artifacts").first()).toBeVisible();
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
          passkeyPublicKey: "0x04",
          passkeyRpId: "bindle.me"
        })
      );
    }, publicRecipient);

    await page.goto("/");

    await expect(page.getByText("0zk address pending")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create shielded wallet" })
    ).toBeEnabled();
    await page.getByRole("button", { name: "Create shielded wallet" }).click();

    await expect(page.getByText(/0zk[A-Za-z0-9]{16,}/).first()).toBeVisible({
      timeout: 30_000
    });
    await expect(page.getByLabel("Shielded wallet recovery phrase")).toBeVisible();

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
          passkeyPublicKey: "0x04",
          passkeyRpId: "bindle.me"
        })
      );
    }, publicRecipient);

    await page.goto("/");

    await page
      .getByLabel("Recovery phrase")
      .fill(
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about"
      );
    await page.getByRole("button", { name: "Import existing" }).click();

    await expect(page.getByText(/0zk[A-Za-z0-9]{16,}/).first()).toBeVisible({
      timeout: 30_000
    });
    await page.getByRole("button", { name: "Receive" }).click();
    await expect(page.getByText("Shielded address ready")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy 0zk address" })).toBeVisible();
  });

  test("can replace a legacy or missing local 0zk key record", async ({
    page
  }) => {
    const oldRailgunAddress = "0zkoldlocalkeyrecord123456789";

    await page.addInitScript(
      ({ smartWalletAddress, railgunAddress }) => {
        window.localStorage.setItem(
          "bindle.wallet.metadata.v1",
          JSON.stringify({
            status: "railgun-ready",
            smartWalletAddress,
            railgunAddress,
            railgunKeyStore: "encrypted-local",
            passkeyPresent: true,
            mnemonicPresent: true,
            createdAt: "2026-06-03T00:00:00.000Z",
            railgunWalletCreatedAt: "2026-06-03T00:00:00.000Z",
            railgunWalletImportedAt: null,
            lastError: null,
            custodyModel: "passkey-4337",
            passkeyCredentialId: "test-passkey",
            passkeyPublicKey: "0x04",
          passkeyRpId: "bindle.me"
          })
        );
      },
      {
        smartWalletAddress: publicRecipient,
        railgunAddress: oldRailgunAddress
      }
    );

    await page.goto("/");

    await expect(page.getByLabel("Repair shielded wallet")).toContainText(
      "0zk wallet secrets missing"
    );
    await expect(page.getByLabel("Incompatible 0zk address")).toContainText(
      oldRailgunAddress
    );

    await page.getByRole("button", { name: "Wipe and regenerate 0zk" }).click();

    await expect(page.getByLabel("Repair shielded wallet")).toContainText(
      "New 0zk wallet created",
      { timeout: 30_000 }
    );
    await expect(page.getByLabel("New shielded wallet recovery phrase")).toBeVisible();
    await expect(page.getByLabel("New 0zk address")).toContainText(/0zk[A-Za-z0-9]{16,}/);
    await expect(page.getByLabel("Incompatible 0zk address")).toContainText(
      oldRailgunAddress
    );
  });

  test("prompts repair instead of generic recoverable key blocking for old metadata", async ({
    page
  }) => {
    await page.route("https://ethereum-rpc.publicnode.com/**", async (route) => {
      const payload = JSON.parse(route.request().postData() ?? "{}") as
        | { id: number; method: string }
        | Array<{ id: number; method: string }>;
      const requests = Array.isArray(payload) ? payload : [payload];
      const responses = requests.map((request) => ({
        jsonrpc: "2.0",
        id: request.id,
        result:
          request.method === "eth_chainId"
            ? "0x1"
            : request.method === "eth_getBalance"
              ? "0xde0b6b3a7640000"
              : request.method === "eth_blockNumber"
                ? "0x100"
                : request.method === "eth_getLogs"
                  ? []
                  : request.method === "eth_call"
                    ? "0x0000000000000000000000000000000000000000000000000000000000000000"
                    : request.method === "eth_estimateGas"
                      ? "0x5208"
                      : request.method === "eth_gasPrice"
                        ? "0x1"
                        : request.method === "eth_getTransactionCount"
                          ? "0x0"
                          : null
      }));

      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(Array.isArray(payload) ? responses : responses[0])
      });
    });

    await page.addInitScript(
      ({ smartWalletAddress, railgunAddress }) => {
        window.localStorage.setItem(
          "bindle.wallet.metadata.v1",
          JSON.stringify({
            status: "railgun-ready",
            smartWalletAddress,
            railgunAddress,
            railgunKeyStore: null,
            passkeyPresent: true,
            mnemonicPresent: true,
            createdAt: "2026-06-03T00:00:00.000Z",
            railgunWalletCreatedAt: "2026-06-03T00:00:00.000Z",
            railgunWalletImportedAt: null,
            lastError: null,
            custodyModel: "passkey-4337",
            passkeyCredentialId: "test-passkey",
            passkeyPublicKey: "0x04",
          passkeyRpId: "bindle.me"
          })
        );
      },
      {
        smartWalletAddress: publicRecipient,
        railgunAddress: "0zkoldmetadataonly123456789"
      }
    );

    await page.goto("/");

    await expect(page.getByLabel("Repair shielded wallet")).toContainText(
      "0zk wallet secrets missing"
    );
    await expect(page.getByLabel("Unshielded ETH balance")).toContainText(
      "Shield blocked: replace the incompatible local 0zk wallet before shielding."
    );
    await expect(page.getByLabel("Unshielded ETH balance")).not.toContainText(
      "recoverable RAILGUN keys"
    );
  });

  test("keeps toolkit startup errors visible after navigation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Nodes" }).click();
    await page.getByLabel("Active preset").selectOption("privacy-max");
    await page.getByRole("button", { name: "Start toolkit" }).click();

    await expect(page.getByLabel("Toolkit failed notice")).toContainText(
      "Configure an Ethereum RPC endpoint before starting Kohaku."
    );

    await page.getByRole("button", { name: "Wallet" }).click();

    await expect(page.getByLabel("Toolkit failed notice")).toContainText(
      "Toolkit failed"
    );
    await expect(page.getByLabel("Toolkit failed notice")).toContainText(
      "Configure an Ethereum RPC endpoint before starting Kohaku."
    );

    await page.getByRole("button", { name: "Debug" }).click();
    await expect(page.getByLabel("Debug log entries")).toContainText("toolkit");
    await expect(page.getByLabel("Debug log entries")).toContainText(
      "Configure an Ethereum RPC endpoint before starting Kohaku."
    );
    await expect(page.getByLabel("Debug log entries")).toContainText(
      "Error: Configure an Ethereum RPC endpoint before starting Kohaku."
    );
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
        | { id: number; method: string; params?: unknown[] }
        | Array<{ id: number; method: string; params?: unknown[] }>;
      const requests = Array.isArray(payload) ? payload : [payload];
      const responses = requests.map((request) => {
        const blockTag =
          request.method === "eth_getBlockByNumber" &&
          Array.isArray(request.params) &&
          typeof request.params[0] === "string"
            ? request.params[0]
            : null;
        const result =
          request.method === "eth_chainId"
            ? "0x1"
            : request.method === "eth_getBalance"
              ? "0xde0b6b3a7640000"
              : request.method === "eth_blockNumber"
                ? "0x100"
                : request.method === "eth_getBlockByNumber"
                  ? blockTag === "0x100"
                    ? {
                        baseFeePerGas: "0x1",
                        difficulty: "0x0",
                        extraData: "0x",
                        gasLimit: "0x1c9c380",
                        gasUsed: "0x5208",
                        hash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                        logsBloom: "0x" + "0".repeat(512),
                        miner: "0x0000000000000000000000000000000000000000",
                        mixHash:
                          "0x0000000000000000000000000000000000000000000000000000000000000000",
                        nonce: "0x0000000000000000",
                        number: "0x100",
                        parentHash:
                          "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                        receiptsRoot:
                          "0x0000000000000000000000000000000000000000000000000000000000000000",
                        sha3Uncles:
                          "0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347",
                        size: "0x1",
                        stateRoot:
                          "0x0000000000000000000000000000000000000000000000000000000000000000",
                        timestamp: "0x693f7f80",
                        totalDifficulty: "0x0",
                        transactions: [
                          {
                            blockHash:
                              "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                            blockNumber: "0x100",
                            chainId: "0x1",
                            from: "0x1111111111111111111111111111111111111111",
                            gas: "0x5208",
                            gasPrice: "0x1",
                            hash: "0x1234000000000000000000000000000000000000000000000000000000000000",
                            input: "0x",
                            nonce: "0x0",
                            r: "0x1",
                            s: "0x1",
                            to: publicRecipient,
                            transactionIndex: "0x0",
                            type: "0x0",
                            v: "0x1b",
                            value: "0xde0b6b3a7640000"
                          }
                        ],
                        transactionsRoot:
                          "0x0000000000000000000000000000000000000000000000000000000000000000",
                        uncles: []
                      }
                    : null
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
          passkeyPublicKey: "0x04",
          passkeyRpId: "bindle.me"
        })
      );
    }, publicRecipient);

    await page.goto("/");

    await expect(page.getByLabel("Unshielded ETH balance")).toContainText(
      "Sync may contact Ethereum RPC (default: https://ethereum-rpc.publicnode.com)"
    );

    await expect(page.getByRole("heading", { name: "$--" })).toBeVisible();
    await expect(page.getByText("Shielded balance")).toBeVisible();
    await expect(page.getByText("0zk pending").first()).toBeVisible();
    await expect(page.getByLabel("Unshielded ETH balance")).toContainText(
      "1 ETH"
    );
    await expect(page.getByLabel("Unshielded ETH balance")).toContainText(
      "Shield blocked: real 0zk address, recoverable RAILGUN keys."
    );
    await expect(
      page
        .getByLabel("Unshielded ETH balance")
        .getByRole("button", { name: "Sync" })
    ).toBeEnabled();
    await expect(page.getByText("public activity synced at block 256")).toBeVisible();
    await expect(page.getByText("Received ETH")).toBeVisible();
    await expect(page.getByText("Public funding wallet")).toBeVisible();
  });

  test("opens shield review only after public balance and local 0zk secrets exist", async ({
    page
  }) => {
    await page.route("https://ethereum-rpc.publicnode.com/**", async (route) => {
      const payload = JSON.parse(route.request().postData() ?? "{}") as
        | { id: number; method: string }
        | Array<{ id: number; method: string }>;
      const requests = Array.isArray(payload) ? payload : [payload];
      const responses = requests.map((request) => ({
        jsonrpc: "2.0",
        id: request.id,
        result:
          request.method === "eth_chainId"
            ? "0x1"
            : request.method === "eth_getBalance"
              ? "0xde0b6b3a7640000"
              : request.method === "eth_blockNumber"
                ? "0x100"
                : request.method === "eth_getLogs"
                  ? []
                  : request.method === "eth_call"
                    ? "0x0000000000000000000000000000000000000000000000000000000000000000"
                    : request.method === "eth_estimateGas"
                      ? "0x5208"
                      : request.method === "eth_gasPrice"
                        ? "0x1"
                        : request.method === "eth_getTransactionCount"
                          ? "0x0"
                          : null
      }));

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
          railgunKeyStore: null,
          passkeyPresent: true,
          mnemonicPresent: false,
          createdAt: "2026-06-03T00:00:00.000Z",
          railgunWalletCreatedAt: null,
          railgunWalletImportedAt: null,
          lastError: null,
          custodyModel: "passkey-4337",
          passkeyCredentialId: "test-passkey",
          passkeyPublicKey: "0x04",
          passkeyRpId: "bindle.me"
        })
      );
    }, publicRecipient);

    await page.goto("/");
    await page.getByRole("button", { name: "Create shielded wallet" }).click();

    await page.getByRole("button", { name: "Debug" }).click();
    await expect(page.getByLabel("Debug log entries")).toContainText(
      "Starting kohaku-railgun",
      { timeout: 30_000 }
    );
    await page.getByRole("button", { name: "Wallet" }).click();

    await expect(page.getByRole("heading", { name: "$--" })).toBeVisible({
      timeout: 30_000
    });
    await expect(page.getByLabel("Unshielded ETH balance")).toContainText(
      "1 ETH"
    );
    await expect(
      page.getByLabel("Unshielded ETH balance").getByRole("button", {
        name: "Shield",
        exact: true
      })
    ).toBeEnabled();

    await page
      .getByLabel("Unshielded ETH balance")
      .getByRole("button", { name: "Shield", exact: true })
      .click();
    await page.getByLabel("Amount to shield").fill("0.25");

    await expect(page.getByLabel("Shield preflight")).toContainText(
      "ERC-4337 bundler"
    );
    await expect(page.getByRole("button", { name: "Submit shield" })).toBeEnabled();

    await page.getByRole("button", { name: "Submit shield" }).click();
    await page.getByRole("button", { name: "Debug" }).click();

    await expect(page.getByLabel("Debug log entries")).toContainText(
      "Preparing RAILGUN shield transaction",
      { timeout: 30_000 }
    );
    await expect(page.getByLabel("Debug log entries")).toContainText(
      "Submitting shield user operation",
      { timeout: 30_000 }
    );
    await expect(page.getByLabel("Debug log entries")).not.toContainText(
      "unreachable"
    );
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
