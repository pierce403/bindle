#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("..", import.meta.url));
const options = { json: false, localOnly: false, timeoutMs: 60_000, peers: [], trees: [], resolvers: [], poiLists: [], discovery: "both" };
const usage = `Usage: pnpm scan:railgun -- [options]
  --json                 Print one JSON report to stdout (progress goes to stderr)
  --local, --no-network   Verify local WASM, derivation, storage and controlled fixtures
  --timeout <ms>         Waku scan deadline, 1000-600000 (default: 60000)
  --dns-only             Test DNS ENR discovery without direct fallback peers
  --direct-only          Test explicit direct peers with DNS discovery disabled
  --peer <multiaddr>     Replace preset direct peers (repeatable)
  --enr-tree <tree>       Replace preset ENR trees (repeatable)
  --dns-resolver <url>    Replace visible HTTPS JSON DoH resolvers (repeatable)
  --poi-list <key>        Replace active POI list keys for fee compatibility (repeatable)
  --help                 Show this help

Uses the production browser broadcaster boundary in a fresh ephemeral browser.
No existing browser profile, funded wallet, recovery phrase, RPC, proving host,
POI host, bundler, smart wallet, signature, proof generation or live submission
is used. Only deliberately public derivation test vectors are evaluated.
External HTTP is restricted to the displayed DNS resolvers. Waku connects to
the displayed direct peers and peers discovered by the official client.`;

for (let index = 2; index < process.argv.length; index++) {
  const arg = process.argv[index];
  if (arg === "--") continue;
  if (arg === "--help" || arg === "-h") { console.log(usage); process.exit(0); }
  if (arg === "--json") { options.json = true; continue; }
  if (arg === "--local" || arg === "--no-network") { options.localOnly = true; continue; }
  if (arg === "--dns-only") { options.discovery = "dns"; continue; }
  if (arg === "--direct-only") { options.discovery = "direct"; continue; }
  const value = process.argv[++index];
  if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value. Run with --help.`);
  if (arg === "--timeout") {
    options.timeoutMs = Number(value);
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 600_000) throw new Error("--timeout must be 1000-600000 milliseconds.");
  } else if (arg === "--peer") options.peers.push(value);
  else if (arg === "--enr-tree") options.trees.push(value);
  else if (arg === "--dns-resolver") options.resolvers.push(value);
  else if (arg === "--poi-list") options.poiLists.push(value);
  else throw new Error(`Unknown option ${arg}. Run with --help.`);
}

let server;
let browser;
let cacheDirectory;
const progress = (line) => process.stderr.write(`${line}\n`);
try {
  // An isolated cache avoids invalidating modules in a concurrently running
  // app/test dev server, and keeps this diagnostic's generated state temporary.
  cacheDirectory = await mkdtemp(join(tmpdir(), "bindle-railgun-diagnostic-"));
  server = await createServer({
    root,
    cacheDir: cacheDirectory,
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, strictPort: false, open: false },
    plugins: [{
      name: "bindle-no-spend-diagnostic-page",
      configureServer(vite) {
        vite.middlewares.use("/__bindle-railgun-diagnostic", (_request, response) => {
          response.setHeader("content-type", "text/html; charset=utf-8");
          response.end("<!doctype html><html><head><title>Bindle no-spend diagnostic</title></head><body>Isolated no-spend diagnostic</body></html>");
        });
      }
    }]
  });
  await server.listen();
  const address = server.httpServer.address();
  if (!address || typeof address === "string") throw new Error("Local diagnostic server did not bind a port.");
  const origin = `http://127.0.0.1:${address.port}`;
  const executablePath = ["/usr/bin/google-chrome", "/snap/bin/chromium"].find(existsSync);
  browser = await chromium.launch({ executablePath });
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  await page.goto(`${origin}/__bindle-railgun-diagnostic`);
  const policy = await page.evaluate(async (opts) => {
    const { defaultConnectionPolicy } = await import("/src/privacy/connectionPolicy.ts");
    return {
      ...defaultConnectionPolicy,
      wakuEnabled: true,
      railgunBroadcasterEnabled: true,
      railgunBroadcasterMode: "custom-waku",
      railgunBroadcasterDnsDiscoveryEnabled: opts.discovery !== "direct",
      railgunBroadcasterDirectPeers: opts.discovery === "dns" ? [] : opts.peers.length ? opts.peers : defaultConnectionPolicy.railgunBroadcasterDirectPeers,
      railgunBroadcasterDnsDiscoveryUrls: opts.trees.length ? opts.trees : defaultConnectionPolicy.railgunBroadcasterDnsDiscoveryUrls,
      railgunBroadcasterDnsResolverUrls: opts.resolvers.length ? opts.resolvers : defaultConnectionPolicy.railgunBroadcasterDnsResolverUrls,
      railgunPoiListKeys: opts.poiLists.length ? opts.poiLists : defaultConnectionPolicy.railgunPoiListKeys
    };
  }, options);
  const allowedResolvers = policy.railgunBroadcasterDnsResolverUrls.map((value) => new URL(value));
  const blockedRequests = [];
  const externalRequests = [];
  const browserErrors = [];
  page.on("pageerror", (error) => {
    browserErrors.push(error.message);
    progress(`[browser runtime] ${error.message}`);
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    if (!options.localOnly && request.method() === "GET" && allowedResolvers.some((resolver) => resolver.origin === url.origin && resolver.pathname === url.pathname)) {
      externalRequests.push({ kind: "dns", url: url.href });
      return route.continue();
    }
    blockedRequests.push({ method: request.method(), url: url.href });
    return route.abort("blockedbyclient");
  });
  if (options.localOnly) {
    await context.routeWebSocket("**/*", (socket) => {
      if (new URL(socket.url()).origin.replace(/^ws/, "http") === origin) socket.connectToServer();
      else { blockedRequests.push({ method: "WebSocket", url: socket.url() }); socket.close(); }
    });
  }
  page.on("websocket", (socket) => {
    if (!socket.url().startsWith(origin.replace(/^http/, "ws"))) externalRequests.push({ kind: "waku-websocket", url: socket.url() });
  });
  page.on("console", (entry) => {
    // Do not leak verbose dependency dumps into machine-readable stdout.
    if (entry.type() === "error") progress(`[browser] ${entry.text().slice(0, 500)}`);
  });
  await page.exposeFunction("diagnosticProgress", progress);
  progress(`Discovery policy: ${JSON.stringify({ mode: options.localOnly ? "local" : options.discovery, trees: policy.railgunBroadcasterDnsDiscoveryUrls, resolvers: policy.railgunBroadcasterDnsResolverUrls, directPeers: policy.railgunBroadcasterDirectPeers, activePoiListKeys: policy.railgunPoiListKeys })}`);
  let timeout;
  const report = await Promise.race([
    page.evaluate(async ({ policy: configuredPolicy, opts }) => {
      const { runNoSpendRailgunDiagnostic } = await import("/src/railgun/noSpendDiagnostic.ts");
      const { publicTestMnemonic, railgunDerivationFixtures } = await import("/tests/fixtures/railgunDerivation.ts");
      return runNoSpendRailgunDiagnostic({
        policy: configuredPolicy,
        localOnly: opts.localOnly,
        timeoutMs: opts.timeoutMs,
        publicDerivationFixtures: railgunDerivationFixtures.map((fixture) => ({
          recoveryPhrase: publicTestMnemonic,
          keyIndex: fixture.keyIndex,
          derivationVersion: fixture.derivationVersion,
          expectedAddress: fixture.railgunAddress
        })),
        onStatus: (text) => window.diagnosticProgress(text)
      });
    }, { policy, opts: options }),
    new Promise((_resolve, reject) => { timeout = setTimeout(() => reject(new Error("Diagnostic browser exceeded the bounded execution deadline.")), options.timeoutMs + 90_000); })
  ]).finally(() => clearTimeout(timeout));
  report.networkEvidence = { externalRequests, blockedRequests };
  report.browserErrors = browserErrors;
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else {
    for (const key of ["kohaku", "walletIndependentInitialization", "indexedDb", "utxoSync", "nativeEthShieldConstruction", "derivationCompatibility", "proofApi", "poiApi", "transactionBridge", "submissionPayload", "waku", "wakuProtocols", "dnsDiscovery", "directPeers", "feeQuotes", "broadcasterSelection"]) {
      console.log(`${key}: ${report[key].status} — ${report[key].detail}`);
    }
    console.log(`broadcastersFound: ${report.broadcastersFound}\ncompatibleBroadcasters: ${report.compatibleBroadcasters}\ncompatibleFeeQuotes: ${report.compatibleFeeQuotes}\nliveSubmission: ${report.liveSubmission}`);
    for (const error of report.errors) console.log(`diagnosticError: ${error}`);
  }
  // Public infrastructure outages are data, not deterministic test failures.
  // Local initialization/derivation failures and outbound-policy leaks are fatal.
  if (!report.localChecksPassed || blockedRequests.length || browserErrors.length) process.exitCode = 1;
} catch (error) {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  if (options.json) console.log(JSON.stringify({ schemaVersion: 1, fatalError: detail, liveSubmission: "intentionally-not-attempted" }, null, 2));
  else progress(detail);
  process.exitCode = 1;
} finally {
  const cleanup = await Promise.allSettled([browser?.close(), server?.close()]);
  if (cacheDirectory) cleanup.push(await rm(cacheDirectory, { recursive: true, force: true }).then(
    () => ({ status: "fulfilled", value: undefined }),
    (reason) => ({ status: "rejected", reason })
  ));
  for (const result of cleanup) {
    if (result.status === "rejected") {
      progress(`Diagnostic cleanup failed: ${String(result.reason)}`);
      process.exitCode = 1;
    }
  }
}
