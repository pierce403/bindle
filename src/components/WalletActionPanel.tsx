import {
  ArrowRight,
  AlertTriangle,
  Check,
  Copy,
  LockKeyhole,
  QrCode,
  Repeat2,
  Search,
  Send,
  Shuffle,
  WalletCards,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { getPayAsset, searchPayAssets } from "../intents/assets";
import {
  describePaySettlement,
  isAcceptablePrivatePayChangeDisposition,
  kohakuPrivateActionsPendingMessage,
  privatePayChangeRequiredMessage,
  payPrivacyLabel,
  privatePayLegs,
  type RailgunBroadcasterReadiness
} from "../intents/payFlow";
import { parsePaymentRequest } from "../intents/paymentRequests";
import { routeIntent, type IntentDraft, type RoutedIntent } from "../intents/router";
import {
  getPaySwapRoutePlan,
  UNISWAP_V4_PROTOCOL_LABEL
} from "../intents/swapRouting";
import { isValidDecimalAmount, isValidRecipientShape } from "../intents/validation";
import { usdToEthString } from "../intents/conversion";
import type { EndpointDisclosure } from "../privacy/preflightDisclosure";
import { buildPayProofProgress, buildSendProofProgress } from "../railgun/proofProgress";
import type { WalletState } from "../wallet/walletState";
import type { WalletAction } from "./BalancePanel";
import { ProofProgressPanel } from "./ProofProgressPanel";

type BarcodeDetectorResult = {
  rawValue: string;
};

type BindleBarcodeDetector = {
  detect: (source: HTMLVideoElement) => Promise<BarcodeDetectorResult[]>;
};

type BindleBarcodeDetectorConstructor = new (options: {
  formats: string[];
}) => BindleBarcodeDetector;

const barcodeDetector = (): BindleBarcodeDetectorConstructor | null => {
  const detector = (globalThis as typeof globalThis & {
    BarcodeDetector?: BindleBarcodeDetectorConstructor;
  }).BarcodeDetector;

  return typeof detector === "function" ? detector : null;
};

const shortEndpointValue = (endpoint: EndpointDisclosure): string => {
  if (!endpoint.configured) {
    return endpoint.required ? "required, not connected" : "off";
  }

  if (endpoint.id === "price-quotes" && endpoint.source === "off") {
    return "off";
  }

  return `${endpoint.source}: ${endpoint.value}`;
};

type WalletActionPanelProps = {
  action: WalletAction;
  draft: IntentDraft;
  routedIntent: RoutedIntent;
  hasRailgunWallet: boolean;
  rpcConfigured: boolean;
  rpcReady: boolean;
  walletState: WalletState;
  isSubmittingPay: boolean;
  payStatus: string;
  payProofPercent: number;
  payProofStatus: string;
  privatePayReadiness: RailgunBroadcasterReadiness;
  endpointDisclosures: EndpointDisclosure[];
  onDeriveSmartWallet: () => void;
  onOpenConnections: () => void;
  onCloseAction: () => void;
  onSubmitPay: () => void;
  onDraftChange: (draft: IntentDraft) => void;
  onRouteChange: (intent: RoutedIntent) => void;
  price?: {
    answer: bigint;
    decimals: number;
    updatedAt: bigint;
    source: "chainlink-eth-usd-via-rpc";
  } | null;
};

type AddressQrCodeProps = {
  address: string;
};

function AddressQrCode({ address }: AddressQrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !address) {
      return;
    }
    QRCode.toCanvas(
      canvasRef.current,
      address,
      {
        width: 176,
        margin: 0,
        color: {
          dark: "#000000",
          light: "#ffffff"
        }
      },
      (error) => {
        if (error) {
          console.error("Failed to generate QR code:", error);
        }
      }
    );
  }, [address]);

  return (
    <div className="qr-code-wrapper">
      <canvas ref={canvasRef} />
    </div>
  );
}

export function WalletActionPanel({
  action,
  draft,
  routedIntent,
  hasRailgunWallet,
  rpcConfigured,
  rpcReady,
  walletState,
  isSubmittingPay,
  payStatus,
  payProofPercent,
  payProofStatus,
  privatePayReadiness,
  endpointDisclosures,
  onDeriveSmartWallet,
  onOpenConnections,
  onCloseAction,
  onSubmitPay,
  onDraftChange,
  onRouteChange,
  price
}: WalletActionPanelProps) {
  const [receiveMode, setReceiveMode] = useState<"shielded" | "public">(
    "send" === action ? "public" : "shielded"
  );
  const convertedAmountEth = action === "send"
    ? usdToEthString(draft.amount, price ?? null)
    : draft.amount;
  const sendMode = "shielded";
  const [copied, setCopied] = useState(false);
  const [reviewingPayment, setReviewingPayment] = useState(false);
  const [assetQuery, setAssetQuery] = useState("");
  const [paymentRequestOpen, setPaymentRequestOpen] = useState(false);
  const [paymentRequestText, setPaymentRequestText] = useState("");
  const [paymentRequestError, setPaymentRequestError] = useState("");
  const [qrScanning, setQrScanning] = useState(false);
  const [modalPortalTarget, setModalPortalTarget] = useState<Element | null>(
    null
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const qrStreamRef = useRef<MediaStream | null>(null);
  const qrScanActiveRef = useRef(false);
  const hasRecipient = draft.recipient.trim().length > 0;
  const hasAmount = isValidDecimalAmount(draft.amount);
  const hasValidRecipient = isValidRecipientShape(draft.recipient);
  const selectedPayAsset = getPayAsset(draft.asset);
  const paySwapRoutePlan = getPaySwapRoutePlan(selectedPayAsset);
  const payAssetResults = searchPayAssets(assetQuery);
  const privatePayLabel = payPrivacyLabel(privatePayLegs);
  const paySettlement = describePaySettlement({
    amount: draft.amount,
    asset: selectedPayAsset,
    recipient: draft.recipient
  });
  const requiredEndpointsReady = endpointDisclosures.every(
    (endpoint) => !endpoint.required || endpoint.configured
  );
  const missingRequiredEndpoints = endpointDisclosures.filter(
    (endpoint) => endpoint.required && !endpoint.configured
  );
  const hasRecoverableRailgunKeyMaterial =
    walletState.railgunAddress !== null &&
    walletState.railgunKeyStore === "encrypted-local";
  const canReviewShielded =
    hasRecipient &&
    hasValidRecipient &&
    hasAmount &&
    hasRailgunWallet &&
    hasRecoverableRailgunKeyMaterial &&
    rpcReady &&
    requiredEndpointsReady;
  const canReview = canReviewShielded;
  const canCreateFundingAddress =
    walletState.passkeyPublicKey !== null &&
    rpcConfigured &&
    !walletState.smartWalletAddress;
  const canReviewPayIntent =
    hasRecipient && hasValidRecipient && hasAmount && selectedPayAsset !== null;
  const paySwapRouteReady = paySwapRoutePlan !== null;
  const payProofProgress = buildPayProofProgress({
    intentReady: canReviewPayIntent,
    endpointsReady: requiredEndpointsReady,
    routeReady: paySwapRouteReady,
    proofReady: payProofPercent >= 100,
    submitting: isSubmittingPay,
    missingEndpointLabels: missingRequiredEndpoints.map(
      (endpoint) => endpoint.label
    ),
    routeLabel: paySwapRoutePlan?.executionLabel ?? "Route",
  });
  const sendProofProgress = buildSendProofProgress({
    intentReady: canReviewShielded,
    endpointsReady: requiredEndpointsReady,
    proofReady: payProofPercent >= 100,
    submitting: isSubmittingPay,
    missingEndpointLabels: missingRequiredEndpoints.map(
      (endpoint) => endpoint.label
    ),
    proofPercent: payProofPercent,
    proofStatus: payProofStatus || undefined
  });
  const payRouteBlockers = [
    !hasRailgunWallet ? "Create or import a shielded 0zk wallet." : null,
    hasRailgunWallet && !hasRecoverableRailgunKeyMaterial
      ? "Repair local RAILGUN key storage before spending shielded funds."
      : null,
    hasRecoverableRailgunKeyMaterial &&
    walletState.railgunDerivationProvider === "legacy-noncanonical"
      ? "This 0zk was created with an older non-Kohaku derivation path and is not Kohaku-canonical. Create or import a Kohaku 0zk before private actions."
      : null,
    hasRecoverableRailgunKeyMaterial &&
    walletState.railgunDerivationProvider !== "kohaku-railgun" &&
    walletState.railgunDerivationProvider !== "legacy-noncanonical"
      ? "Private Pay requires a Kohaku-canonical 0zk wallet."
      : null,
    kohakuPrivateActionsPendingMessage,
    paySwapRoutePlan?.changeDisposition &&
    !isAcceptablePrivatePayChangeDisposition(paySwapRoutePlan.changeDisposition)
      ? privatePayChangeRequiredMessage
      : null
  ].filter((blocker): blocker is string => blocker !== null);
  const payRouteReady = payRouteBlockers.length === 0;

  useEffect(() => {
    setModalPortalTarget(document.querySelector(".app-content"));
  }, []);

  const updateDraft = (nextDraft: IntentDraft) => {
    setReviewingPayment(false);
    onDraftChange(nextDraft);
    onRouteChange(routeIntent(nextDraft));
  };

  const stopQrScanner = () => {
    qrScanActiveRef.current = false;

    if (qrStreamRef.current) {
      for (const track of qrStreamRef.current.getTracks()) {
        track.stop();
      }
    }

    qrStreamRef.current = null;
    setQrScanning(false);
  };

  useEffect(() => stopQrScanner, []);

  useEffect(() => {
    setReviewingPayment(false);
    setPaymentRequestOpen(false);
    setPaymentRequestError("");
    setCopied(false);
    stopQrScanner();
  }, [action]);

  const closePayFlow = () => {
    stopQrScanner();
    setReviewingPayment(false);
    setPaymentRequestOpen(false);
    setPaymentRequestError("");
    onCloseAction();
  };

  const applyPaymentRequest = (rawRequest: string) => {
    const parsed = parsePaymentRequest(rawRequest);

    if (!parsed.ok) {
      setPaymentRequestError(parsed.error);
      return false;
    }

    updateDraft({ ...draft, ...parsed.request });
    setAssetQuery(parsed.request.asset);
    setPaymentRequestError("");
    setPaymentRequestText("");
    setPaymentRequestOpen(false);
    return true;
  };

  const applyScannedRecipient = (rawValue: string) => {
    const value = rawValue.trim();
    if (isValidRecipientShape(value)) {
      updateDraft({ ...draft, recipient: value });
      return true;
    }

    const parsed = parsePaymentRequest(value);
    if (parsed.ok) {
      updateDraft({
        ...draft,
        recipient: parsed.request.recipient,
        amount: parsed.request.amount || draft.amount,
        note: parsed.request.note || draft.note
      });
      return true;
    }

    const cleanPrefix = value.replace(/^(bindle:pay\?to=|bindle:|ethereum:)/i, "");
    if (isValidRecipientShape(cleanPrefix)) {
      updateDraft({ ...draft, recipient: cleanPrefix });
      return true;
    }

    return false;
  };

  const scanPaymentQr = async () => {
    setPaymentRequestError("");

    const BarcodeDetectorConstructor = barcodeDetector();

    if (!BarcodeDetectorConstructor || !navigator.mediaDevices?.getUserMedia) {
      setPaymentRequestOpen(true);
      setPaymentRequestError(
        "Camera QR scanning is not available in this browser. Paste the payment request instead."
      );
      return;
    }

    stopQrScanner();
    setQrScanning(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } }
      });
      const detector = new BarcodeDetectorConstructor({ formats: ["qr_code"] });

      qrStreamRef.current = stream;
      qrScanActiveRef.current = true;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detect = async () => {
        if (!qrScanActiveRef.current || !videoRef.current) {
          return;
        }

        try {
          const results = await detector.detect(videoRef.current);
          const rawValue = results[0]?.rawValue;

          if (rawValue) {
            const success =
              action === "pay"
                ? applyPaymentRequest(rawValue)
                : applyScannedRecipient(rawValue);
            if (success) {
              stopQrScanner();
              return;
            }
          }
        } catch (error) {
          stopQrScanner();
          setPaymentRequestOpen(true);
          setPaymentRequestError(
            error instanceof Error
              ? error.message
              : "QR scanning failed. Paste the payment request instead."
          );
          return;
        }

        requestAnimationFrame(() => void detect());
      };

      requestAnimationFrame(() => void detect());
    } catch (error) {
      stopQrScanner();
      setPaymentRequestOpen(true);
      setPaymentRequestError(
        error instanceof Error
          ? error.message
          : "Camera access failed. Paste the payment request instead."
      );
    }
  };

  const copyAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (action === "receive") {
    const receiveFlow = (
      <div
        className="modal-backdrop receive-flow-backdrop"
        onClick={onCloseAction}
      >
        <section
          className="modal-sheet receive-flow-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="receive-heading"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="modal-sheet-header">
            <div>
              <span>Ethereum mainnet</span>
              <h2 id="receive-heading">Receive ETH</h2>
            </div>
            <button
              className="icon-button ghost"
              type="button"
              aria-label="Close Receive"
              onClick={onCloseAction}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="mode-selector" aria-label="Receive mode">
            <button
              type="button"
              aria-pressed={receiveMode === "shielded"}
              onClick={() => {
                setCopied(false);
                setReceiveMode("shielded");
              }}
            >
              Shielded
            </button>
            <button
              type="button"
              aria-pressed={receiveMode === "public"}
              onClick={() => {
                setCopied(false);
                setReceiveMode("public");
              }}
            >
              Public
            </button>
          </div>

          {receiveMode === "shielded" ? (
            <div className="empty-state compact">
              <LockKeyhole size={22} aria-hidden="true" />
              <strong>
                {walletState.railgunAddress
                  ? "Shielded address ready"
                  : "Shielded address pending"}
              </strong>
              
              {walletState.railgunAddress ? (
                <>
                  <AddressQrCode address={walletState.railgunAddress} />
                  <div className="address-display-container">
                    <div className="address-text-box">{walletState.railgunAddress}</div>
                    <button
                      className="secondary-action wide"
                      type="button"
                      onClick={() => void copyAddress(walletState.railgunAddress ?? "")}
                    >
                      {copied ? (
                        <>
                          <Check size={18} aria-hidden="true" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={18} aria-hidden="true" />
                          Copy 0zk address
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <span>Create or import a shielded RAILGUN wallet in setup.</span>
              )}
              {walletState.status === "error" && walletState.lastError ? (
                <span>{walletState.lastError}</span>
              ) : null}
            </div>
          ) : (
            <div className="empty-state compact">
              <LockKeyhole size={22} aria-hidden="true" />
              <strong>
                {walletState.smartWalletAddress
                  ? "Funding address ready"
                  : walletState.passkeyPublicKey
                    ? "Funding address pending"
                    : walletState.passkeyPresent
                      ? "Funding passkey needed"
                      : "No public smart wallet yet"}
              </strong>

              {walletState.smartWalletAddress ? (
                <>
                  <AddressQrCode address={walletState.smartWalletAddress} />
                  <div className="address-display-container">
                    <div className="address-text-box">{walletState.smartWalletAddress}</div>
                    <button
                      className="secondary-action wide"
                      type="button"
                      onClick={() => void copyAddress(walletState.smartWalletAddress ?? "")}
                    >
                      {copied ? (
                        <>
                          <Check size={18} aria-hidden="true" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={18} aria-hidden="true" />
                          Copy address
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span>
                    {walletState.passkeyPublicKey
                      ? rpcConfigured
                        ? "Create the funding address, then send ETH to it from another wallet."
                        : "Configure Ethereum RPC to create the funding address."
                      : walletState.passkeyPresent
                        ? "Create a funding passkey to derive a public smart-wallet address."
                        : "Create the passkey-backed smart wallet before receiving public ETH."}
                  </span>
                  {canCreateFundingAddress ? (
                    <button
                      className="primary-action wide"
                      type="button"
                      onClick={onDeriveSmartWallet}
                    >
                      <LockKeyhole size={18} aria-hidden="true" />
                      Create funding address
                    </button>
                  ) : walletState.passkeyPublicKey ? (
                    <button
                      className="secondary-action wide"
                      type="button"
                      onClick={onOpenConnections}
                    >
                      <LockKeyhole size={18} aria-hidden="true" />
                      Configure RPC
                    </button>
                  ) : null}
                </>
              )}
            </div>
          )}
        </section>
      </div>
    );

    return modalPortalTarget
      ? createPortal(receiveFlow, modalPortalTarget)
      : receiveFlow;
  }

  if (action === "pay") {
    const payFlow = (
      <div
        className="modal-backdrop pay-flow-backdrop"
        onClick={closePayFlow}
      >
        <section
          className="modal-sheet pay-flow-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pay-heading"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="modal-sheet-header">
            <div>
              <span>RAILGUN private-source route</span>
              <h2 id="pay-heading">{privatePayLabel}</h2>
            </div>
            <button
              className="icon-button ghost"
              type="button"
              aria-label="Close Pay"
              onClick={closePayFlow}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="pay-tools">
            <button
              className="secondary-action"
              type="button"
              onClick={() => void scanPaymentQr()}
            >
              <QrCode size={17} aria-hidden="true" />
              Scan QR
            </button>
            <button
              className="secondary-action"
              type="button"
              onClick={() => {
                stopQrScanner();
                setPaymentRequestOpen((open) => !open);
                setPaymentRequestError("");
              }}
            >
              <WalletCards size={17} aria-hidden="true" />
              Paste request
            </button>
          </div>

          {qrScanning ? (
            <div className="qr-scanner" aria-label="QR scanner">
              <video ref={videoRef} muted playsInline />
              <button
                className="secondary-action wide"
                type="button"
                onClick={stopQrScanner}
              >
                Cancel scan
              </button>
            </div>
          ) : null}

          {paymentRequestOpen ? (
            <div className="payment-request-card">
              <label className="field">
                <span>Payment request</span>
                <textarea
                  value={paymentRequestText}
                  onChange={(event) => {
                    setPaymentRequestError("");
                    setPaymentRequestText(event.currentTarget.value);
                  }}
                  placeholder="bindle:pay?to=deanpierce.eth&amount=5&asset=USDC"
                />
              </label>
              {paymentRequestError ? (
                <p className="status-message">{paymentRequestError}</p>
              ) : null}
              <button
                className="primary-action wide"
                type="button"
                onClick={() => applyPaymentRequest(paymentRequestText)}
              >
                <ArrowRight size={18} aria-hidden="true" />
                Use request
              </button>
            </div>
          ) : paymentRequestError ? (
            <p className="status-message">{paymentRequestError}</p>
          ) : null}

          <label className="field">
            <span>Asset</span>
            <div className="asset-search">
              <Search size={17} aria-hidden="true" />
              <input
                value={assetQuery}
                onChange={(event) => setAssetQuery(event.currentTarget.value)}
                placeholder={selectedPayAsset?.symbol ?? "Search assets"}
              />
            </div>
          </label>

          <div className="asset-results" aria-label="Asset results">
            {payAssetResults.map((asset) => (
              <button
                type="button"
                key={asset.symbol}
                aria-pressed={draft.asset === asset.symbol}
                onClick={() => {
                  setAssetQuery(asset.symbol);
                  updateDraft({ ...draft, asset: asset.symbol });
                }}
              >
                <strong>{asset.symbol}</strong>
                <span>{asset.name}</span>
              </button>
            ))}
          </div>

          <div className="amount-entry single-asset">
            <input
              aria-label="Pay amount"
              inputMode="decimal"
              value={draft.amount}
              placeholder="0.00"
              onChange={(event) =>
                updateDraft({ ...draft, amount: event.currentTarget.value })
              }
            />
            <span>{selectedPayAsset?.symbol ?? "Asset"}</span>
          </div>

          <label className="field">
            <span>To</span>
            <input
              aria-label="Pay recipient"
              value={draft.recipient}
              onChange={(event) =>
                updateDraft({ ...draft, recipient: event.currentTarget.value })
              }
              placeholder="deanpierce.eth, 0x, or 0zk"
            />
          </label>

          <label className="field">
            <span>Note</span>
            <input
              aria-label="Pay note"
              value={draft.note}
              onChange={(event) =>
                updateDraft({ ...draft, note: event.currentTarget.value })
              }
              placeholder="optional"
            />
          </label>

          <div className="route-card pay-route">
            <div>
              <span>Intent</span>
              <strong>
                {hasAmount && selectedPayAsset
                  ? `${draft.amount.trim()} ${selectedPayAsset.symbol}`
                  : "pending"}
              </strong>
            </div>
            <ArrowRight size={19} aria-hidden="true" />
            <div>
              <span>Recipient</span>
              <strong>{hasRecipient ? draft.recipient.trim() : "pending"}</strong>
            </div>
          </div>

          <div className="preflight-card" aria-label="Pay endpoint preflight">
            <span>Could contact</span>
            {endpointDisclosures.map((endpoint) => (
              <div className="preflight-row" key={endpoint.id}>
                <strong>{endpoint.label}</strong>
                <span>{shortEndpointValue(endpoint)}</span>
              </div>
            ))}
          </div>

          <button
            className="primary-action wide"
            type="button"
            disabled={!canReviewPayIntent}
            onClick={() => setReviewingPayment(true)}
          >
            <Send size={18} aria-hidden="true" />
            Review Private Pay route
          </button>

          {reviewingPayment ? (
            <section
              className="pay-review-stack"
              aria-label="Review pay route"
            >
              <div className="review-card pay-review-card">
                <span>Review Private Pay route</span>
                <div>
                  <strong>Private source</strong>
                  <span>RAILGUN 0zk</span>
                </div>
                <div>
                  <strong>0zk derivation</strong>
                  <span>{walletState.railgunDerivationProvider ?? "none"}</span>
                </div>
                <div>
                  <strong>Private submission</strong>
                  <span>ERC-4337 Bundler</span>
                </div>
                <div>
                  <strong>Bundler status</strong>
                  <span>{privatePayReadiness.status}</span>
                </div>
                <div>
                  <strong>Relay fee token</strong>
                  <span>{privatePayReadiness.feeToken}</span>
                </div>
                <div>
                  <strong>Relay fee</strong>
                  <span>{privatePayReadiness.fee}</span>
                </div>
                <div>
                  <strong>Spend</strong>
                  <span>Shielded ETH through RAILGUN</span>
                </div>
                <div>
                  <strong>Convert</strong>
                  <span>
                    {paySwapRoutePlan?.executionLabel ?? "No conversion"}
                  </span>
                </div>
                <div>
                  <strong>Quote</strong>
                  <span>{paySwapRoutePlan?.quoteLabel ?? "pending"}</span>
                </div>
                <div>
                  <strong>Router</strong>
                  <span>{paySwapRoutePlan?.routerLabel ?? "pending"}</span>
                </div>
                <div>
                  <strong>Route provider</strong>
                  <span>{UNISWAP_V4_PROTOCOL_LABEL}</span>
                </div>
                <div>
                  <strong>Slippage</strong>
                  <span>{paySwapRoutePlan?.slippageLabel ?? "pending"}</span>
                </div>
                <div>
                  <strong>Remainder</strong>
                  <span>{paySwapRoutePlan?.remainderLabel ?? "pending"}</span>
                </div>
                <div>
                  <strong>Public settlement</strong>
                  <span>{paySettlement}</span>
                </div>
                <div>
                  <strong>Target token</strong>
                  <span>
                    {selectedPayAsset?.symbol ?? "pending"} on Ethereum mainnet
                  </span>
                </div>
                {selectedPayAsset?.kind === "erc20" ? (
                  <div>
                    <strong>Token</strong>
                    <span>{selectedPayAsset.address}</span>
                  </div>
                ) : null}
              </div>

              <ProofProgressPanel progress={payProofProgress} />
              <div className="route-blockers">
                <AlertTriangle size={17} aria-hidden="true" />
                <span>{payRouteReady ? "Ready" : "Blocked"}</span>
                {payRouteBlockers.map((blocker) => (
                  <small key={blocker}>{blocker}</small>
                ))}
              </div>
              <button
                className="primary-action wide"
                type="button"
                disabled={!canReviewPayIntent || isSubmittingPay}
                onClick={onSubmitPay}
              >
                <Send size={18} aria-hidden="true" />
                {isSubmittingPay ? "Checking readiness" : "Check Private Pay readiness"}
              </button>
              {payStatus ? (
                <p className="status-message pay-status-message">{payStatus}</p>
              ) : null}
            </section>
          ) : null}
        </section>
      </div>
    );

    return modalPortalTarget
      ? createPortal(payFlow, modalPortalTarget)
      : payFlow;
  }

  if (action === "swap") {
    return (
      <section className="panel action-panel" aria-labelledby="swap-heading">
        <div className="section-heading">
          <div>
            <h2 id="swap-heading">Swap</h2>
            <span>Uniswap planned</span>
          </div>
          <Repeat2 size={21} aria-hidden="true" />
        </div>

        <div className="empty-state compact">
          <Shuffle size={22} aria-hidden="true" />
          <strong>Swap unavailable</strong>
          <span>Uniswap routing is not wired.</span>
        </div>
      </section>
    );
  }

  if (action === "send") {
    const sendFlow = (
      <div
        className="modal-backdrop send-flow-backdrop"
        onClick={onCloseAction}
      >
        <section
          className="modal-sheet send-flow-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby="send-heading"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="modal-sheet-header">
            <div>
              <span>Railgun shielded ETH</span>
              <h2 id="send-heading">Send ETH</h2>
            </div>
            <button
              className="icon-button ghost"
              type="button"
              aria-label="Close Send"
              onClick={onCloseAction}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>

          <div className="pay-tools">
            <button
              className="secondary-action"
              type="button"
              onClick={() => void scanPaymentQr()}
            >
              <QrCode size={17} aria-hidden="true" />
              Scan QR
            </button>
          </div>

          {qrScanning ? (
            <div className="qr-scanner" aria-label="QR scanner">
              <video ref={videoRef} muted playsInline />
              <button
                className="secondary-action wide"
                type="button"
                onClick={stopQrScanner}
              >
                Cancel scan
              </button>
            </div>
          ) : null}

          <div className="amount-entry single-asset">
            <input
              aria-label="Amount"
              inputMode="decimal"
              value={draft.amount}
              placeholder="0.00"
              onChange={(event) =>
                updateDraft({ ...draft, amount: event.currentTarget.value })
              }
            />
            <span>USD</span>
          </div>
          {isValidDecimalAmount(draft.amount) ? (
            <span style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "-4px", display: "block", textAlign: "right" }}>
              {price ? `~${convertedAmountEth} ETH` : "Loading price..."}
            </span>
          ) : null}

          <label className="field">
            <span>To</span>
            <input
              value={draft.recipient}
              onChange={(event) =>
                updateDraft({ ...draft, recipient: event.currentTarget.value })
              }
              placeholder="0zk, 0x, or .eth"
            />
          </label>

          <label className="field">
            <span>Note</span>
            <input
              value={draft.note}
              onChange={(event) =>
                updateDraft({ ...draft, note: event.currentTarget.value })
              }
              placeholder="optional"
            />
          </label>

          <div className="route-card">
            <div>
              <span>Route</span>
              <strong>{hasRecipient ? routedIntent.route.name : "pending"}</strong>
            </div>
            <Shuffle size={19} aria-hidden="true" />
            <div>
              <span>Action</span>
              <strong>{hasRecipient ? routedIntent.privateLeg.action : "pending"}</strong>
            </div>
          </div>

          <div className="preflight-card" aria-label="Endpoint preflight">
            <span>Could contact</span>
            {endpointDisclosures.map((endpoint) => (
              <div className="preflight-row" key={endpoint.id}>
                <strong>{endpoint.label}</strong>
                <span>
                  {endpoint.configured
                    ? `${endpoint.source}: ${endpoint.value}`
                    : endpoint.required
                      ? "required, not connected"
                      : "off"}
                </span>
              </div>
            ))}
          </div>



          {reviewingPayment && sendMode === "shielded" ? (
            <div className="review-card" aria-label="Review shielded payment">
              <span>Review shielded payment</span>
              <div>
                <strong>From</strong>
                <span>{walletState.railgunAddress}</span>
              </div>
              <div>
                <strong>To</strong>
                <span>{draft.recipient.trim()}</span>
              </div>
              <div>
                <strong>Amount</strong>
                <span>${draft.amount.trim()} (~{convertedAmountEth} ETH)</span>
              </div>
              {isSubmittingPay || payProofPercent > 0 ? (
                <ProofProgressPanel progress={sendProofProgress} />
              ) : null}
              <button
                className="primary-action wide"
                type="button"
                disabled={!canReviewShielded || isSubmittingPay}
                onClick={onSubmitPay}
              >
                <Send size={18} aria-hidden="true" />
                {isSubmittingPay ? "Submitting" : "Submit private send"}
              </button>
              {payStatus ? (
                <p className="status-message pay-status-message">{payStatus}</p>
              ) : null}
            </div>
          ) : null}

          <button
            className="primary-action wide"
            type="button"
            disabled={!canReview}
            onClick={() => {
              setReviewingPayment(true);
            }}
          >
            <Send size={18} aria-hidden="true" />
            Review
          </button>
        </section>
      </div>
    );

    return modalPortalTarget
      ? createPortal(sendFlow, modalPortalTarget)
      : sendFlow;
  }

  return null;
}
