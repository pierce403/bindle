/// <reference types="vite/client" />

declare module "virtual:bindle-build-info" {
  export const rawBuildVersion: string;
  export const rawBuildId: string;
  export const rawBuildCommit: string;
  export const rawBuildTime: string;
}
