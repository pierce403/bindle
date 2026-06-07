import { expect, test } from "@playwright/test";
import { defaultConnectionPolicy } from "../src/privacy/connectionPolicy";
import {
  getFundingCredentialCandidates,
  sendSmartWalletCalls
} from "../src/wallet/smartAccountAdapter";
import {
  privateSmartWalletSubmissionError
} from "../src/wallet/transactionOrigin";
import { emptyWalletState } from "../src/wallet/walletState";

test("sendSmartWalletCalls rejects railgun-private origins before bundler submission", async () => {
  await expect(
    sendSmartWalletCalls({
      calls: [
        {
          to: "0x000000000000000000000000000000000000dEaD",
          origin: "railgun-private"
        }
      ],
      origin: "railgun-private",
      policy: {
        ...defaultConnectionPolicy,
        bundlerUrl: "https://public.pimlico.io/v2/1/rpc"
      },
      walletState: emptyWalletState
    })
  ).rejects.toThrow(privateSmartWalletSubmissionError);
});

test("funding credential candidates keep active and saved passkey owners", () => {
  const candidates = getFundingCredentialCandidates({
    ...emptyWalletState,
    passkeyPresent: true,
    passkeyCredentialId: "legacy-bindleme",
    passkeyPublicKey:
      "0xc18dd9496b23664467e10015e26c0d2d39a1fca1adacfa995641a820f39c5b0ea47207155abb2204701fd125829b76659fd6d48915890c5cc9c296a07c543310",
    passkeyRpId: "bindle.me",
    passkeyAuthenticatorAttachment: "platform",
    passkeyUserVerification: "required",
    passkeyCredentials: [
      {
        id: "legacy-bindleme",
        publicKey:
          "0xc18dd9496b23664467e10015e26c0d2d39a1fca1adacfa995641a820f39c5b0ea47207155abb2204701fd125829b76659fd6d48915890c5cc9c296a07c543310",
        rpId: "bindle.me",
        authenticatorAttachment: "platform",
        userVerification: "required",
        createdAt: "2026-06-01T00:00:00.000Z",
        lastUsedAt: null
      },
      {
        id: "bindlecash-slot-five",
        publicKey:
          "0x2b5d5cf1a7b1c3495240543df638e3680180a49260dbbd20e04783e20841d63b619eef55450a6b5fe4064ca0d29e309124eb0946cee3aaccb5b370ea3acabe62",
        rpId: "bindle.cash",
        authenticatorAttachment: "platform",
        userVerification: "required",
        createdAt: "2026-06-06T00:00:00.000Z",
        lastUsedAt: "2026-06-06T00:00:00.000Z"
      }
    ]
  });

  expect(candidates.map((candidate) => candidate.id)).toEqual([
    "legacy-bindleme",
    "bindlecash-slot-five"
  ]);
});

test("funding credential candidates can come from saved owner records only", () => {
  const candidates = getFundingCredentialCandidates({
    ...emptyWalletState,
    passkeyPresent: true,
    passkeyCredentials: [
      {
        id: "bindlecash-slot-five",
        publicKey:
          "0x2b5d5cf1a7b1c3495240543df638e3680180a49260dbbd20e04783e20841d63b619eef55450a6b5fe4064ca0d29e309124eb0946cee3aaccb5b370ea3acabe62",
        rpId: "bindle.cash",
        authenticatorAttachment: "platform",
        userVerification: "required",
        createdAt: "2026-06-06T00:00:00.000Z",
        lastUsedAt: "2026-06-06T00:00:00.000Z"
      }
    ]
  });

  expect(candidates.map((candidate) => candidate.id)).toEqual([
    "bindlecash-slot-five"
  ]);
});
