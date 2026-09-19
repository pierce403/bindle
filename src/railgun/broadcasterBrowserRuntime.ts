import { Buffer } from "buffer";
import browserProcess from "process";

// The official broadcaster's wallet crypto helpers use browserify-aes, whose
// supported browser implementation expects Node's Buffer shape. Keep this
// compatibility scoped to loading the broadcaster; no wallet engine starts.
export const installBroadcasterBrowserRuntime = (): void => {
  const runtime = globalThis as typeof globalThis & { Buffer?: typeof Buffer; process?: typeof browserProcess; global?: typeof globalThis };
  runtime.Buffer ??= Buffer;
  runtime.process ??= browserProcess;
  runtime.global ??= globalThis;
};
