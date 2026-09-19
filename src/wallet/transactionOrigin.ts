export type TxOrigin = "public-smart-wallet" | "railgun-private";

export const privateSmartWalletSubmissionError =
  "Private Pay cannot be submitted through the public smart wallet.";

export const assertPublicSmartWalletOrigin = (origin: TxOrigin): void => {
  if (origin !== "public-smart-wallet") {
    throw new Error(privateSmartWalletSubmissionError);
  }
};
