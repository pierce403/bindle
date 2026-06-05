export type TxOrigin = "public-smart-wallet" | "railgun-private";

export const privateSmartWalletSubmissionError =
  "Private Pay cannot be submitted by the public smart wallet.";

export const assertPublicSmartWalletOrigin = (origin: TxOrigin): void => {
  if (origin === "railgun-private") {
    throw new Error(privateSmartWalletSubmissionError);
  }
};
