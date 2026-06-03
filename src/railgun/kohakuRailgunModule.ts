type KohakuRailgunTypes = typeof import("@kohaku-eth/railgun");

export type KohakuRailgunBrowserModule = KohakuRailgunTypes & {
  default: () => Promise<unknown>;
};

type KohakuLogLevel = "Trace" | "Debug" | "Info" | "Warn" | "Error";

let modulePromise: Promise<KohakuRailgunBrowserModule> | null = null;
let loggingInitialized = false;
let initializedLogLevel: KohakuLogLevel | null = null;

const importKohakuRailgunModule = (): Promise<KohakuRailgunBrowserModule> =>
  import(
    "../../node_modules/@kohaku-eth/railgun/dist/pkg/index.js"
  ) as Promise<KohakuRailgunBrowserModule>;

export const loadKohakuRailgunBrowserModule = async ({
  logLevel = "Warn"
}: {
  logLevel?: KohakuLogLevel;
} = {}): Promise<KohakuRailgunBrowserModule> => {
  modulePromise ??= importKohakuRailgunModule().then(async (kohaku) => {
    await kohaku.default();
    return kohaku;
  });

  const kohaku = await modulePromise;

  if (!loggingInitialized) {
    // Kohaku's Rust binding documents initLogging as a once-at-startup call.
    // Calling it again panics inside WASM, surfacing as RuntimeError:
    // unreachable. Keep it process-local and idempotent for the PWA session.
    kohaku.initLogging(logLevel);
    loggingInitialized = true;
    initializedLogLevel = logLevel;
  }

  return kohaku;
};

export const getKohakuRailgunLogLevel = (): KohakuLogLevel | null =>
  initializedLogLevel;
