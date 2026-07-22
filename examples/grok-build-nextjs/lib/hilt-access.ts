import { createHash, randomUUID } from "node:crypto";
import { HiltApiError, HiltClient } from "@hiltpay/sdk";
import type { HiltX402PaymentPayload, HiltX402PaymentRequired } from "@hiltpay/sdk";
import {
  decodeX402Header,
  encodeX402Header,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  SOLANA_MAINNET_CAIP2,
  SOLANA_USDC_MINT,
} from "@hiltpay/sdk/x402";

export type HiltRuntimeMode = "local" | "sandbox" | "live";

export interface HiltExampleConfig {
  apiUrl: string;
  apiKey: string;
  productId: string;
  mode: HiltRuntimeMode;
}

export interface EntitlementResult {
  has_access: boolean;
  status: string;
  reason: string;
  external_product_id: string;
  external_customer_id: string;
  expires_at?: string | null;
  receipt_id?: string | null;
  source: string;
  usage?: {
    unit: string;
    granted: number;
    consumed: number;
    remaining: number;
  } | null;
}

export interface ConsumptionResult {
  consumed: boolean;
  reason: string;
  status: string;
  units: number;
  usage?: {
    unit: string;
    granted: number;
    consumed: number;
    remaining: number;
  } | null;
}

export interface SettlementResult {
  paymentResponse?: string;
  paymentSessionId: string;
}

export interface PaymentSessionResult {
  id: string;
  status: string;
  checkout_url: string | null;
  payment_requirement: unknown | null;
  payment_required_header: string;
  payment_protocol: "x402";
  settlement_rail: "solana_usdc";
  mode: HiltRuntimeMode;
  notice?: string;
}

export interface HiltAccessGateway {
  readonly config: HiltExampleConfig;
  consumeEntitlement(externalCustomerId: string, requestId: string): Promise<ConsumptionResult>;
  settlePayment(paymentSignature: string, requestId: string): Promise<SettlementResult>;
  createPaymentSession(input: {
    externalCustomerId: string;
    resourceUrl: string;
    requestId: string;
  }): Promise<PaymentSessionResult>;
  confirmDevelopmentSession(input: {
    externalCustomerId: string;
    paymentSessionId: string;
  }): Promise<EntitlementResult>;
}

interface LocalSession {
  externalCustomerId: string;
  id: string;
  status: "pending" | "confirmed";
}

interface SandboxProof {
  externalCustomerId: string;
  proof: string;
}

interface DemoState {
  localBalances: Map<string, number>;
  localConsumptions: Map<string, ConsumptionResult>;
  localSessions: Map<string, LocalSession>;
  sandboxProofs: Map<string, SandboxProof>;
}

const globalDemoState = globalThis as typeof globalThis & {
  __hiltGrokBuildDemoState?: DemoState;
};

function demoState(): DemoState {
  if (!globalDemoState.__hiltGrokBuildDemoState) {
    globalDemoState.__hiltGrokBuildDemoState = {
      localBalances: new Map(),
      localConsumptions: new Map(),
      localSessions: new Map(),
      sandboxProofs: new Map(),
    };
  }
  return globalDemoState.__hiltGrokBuildDemoState;
}

function parseMode(value: string | undefined): HiltRuntimeMode {
  const normalized = (value || "local").trim().toLowerCase();
  if (normalized === "local" || normalized === "sandbox" || normalized === "live") {
    return normalized;
  }
  throw new Error("HILT_DEMO_MODE must be local, sandbox, or live.");
}

export function readHiltExampleConfig(): HiltExampleConfig {
  return {
    apiUrl: (process.env.HILT_API_URL || "https://api.hilt.so").replace(/\/$/, ""),
    apiKey: (process.env.HILT_API_KEY || "").trim(),
    productId: (process.env.HILT_PAY_API_PRODUCT || "grok-build-pro-report").trim(),
    mode: parseMode(process.env.HILT_DEMO_MODE),
  };
}

function requireApiKey(config: HiltExampleConfig): void {
  if (!config.apiKey) {
    throw new Error(`HILT_API_KEY is required when HILT_DEMO_MODE=${config.mode}.`);
  }
}

function entitlementKey(config: HiltExampleConfig, externalCustomerId: string): string {
  return `${config.productId}:${externalCustomerId.trim().toLowerCase()}`;
}

function idempotencyKey(config: HiltExampleConfig, purpose: string, logicalId: string): string {
  const digest = createHash("sha256")
    .update(`${config.mode}:${config.productId}:${purpose}:${logicalId}`)
    .digest("hex")
    .slice(0, 32);
  return `hilt-grok-${purpose}-${digest}`;
}

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeUsage(value: unknown): ConsumptionResult["usage"] {
  if (!value || typeof value !== "object") {
    return null;
  }
  const usage = value as Record<string, unknown>;
  return {
    unit: stringValue(usage.unit) || "request",
    granted: numberValue(usage.granted),
    consumed: numberValue(usage.consumed),
    remaining: numberValue(usage.remaining),
  };
}

function normalizeEntitlement(
  value: Record<string, unknown>,
  config: HiltExampleConfig,
  externalCustomerId: string,
): EntitlementResult {
  return {
    has_access: value.has_access === true,
    status: stringValue(value.status) || "unknown",
    reason: stringValue(value.reason) || "not_active",
    external_product_id: stringValue(value.external_product_id) || config.productId,
    external_customer_id: stringValue(value.external_customer_id) || externalCustomerId,
    expires_at: stringValue(value.expires_at),
    receipt_id: stringValue(value.receipt_id),
    source: stringValue(value.source) || config.mode,
    usage: normalizeUsage(value.usage),
  };
}

function paymentSessionId(paymentSignature: string): string {
  const payload = decodeX402Header<HiltX402PaymentPayload>(paymentSignature);
  const id = payload.accepted?.extra?.hilt?.paymentSessionId;
  if (!id) {
    throw new Error("PAYMENT-SIGNATURE is not bound to a Hilt payment session.");
  }
  return id;
}

function requiredHeader(paymentRequirement: unknown): string {
  const headers = recordValue(paymentRequirement, "headers");
  const value = recordValue(headers, PAYMENT_REQUIRED_HEADER);
  if (typeof value !== "string" || !value) {
    throw new Error("Hilt payment requirement did not contain PAYMENT-REQUIRED.");
  }
  return value;
}

function localPaymentRequirement(sessionId: string, resourceUrl: string): HiltX402PaymentRequired & {
  headers: Record<string, string>;
} {
  const requirement: HiltX402PaymentRequired = {
    x402Version: 2,
    resource: {
      url: resourceUrl,
      description: "One protected report request",
      mimeType: "application/json",
      serviceName: "Hilt Grok Build example",
    },
    accepts: [
      {
        scheme: "exact",
        network: SOLANA_MAINNET_CAIP2,
        asset: SOLANA_USDC_MINT,
        amount: "10000",
        payTo: "local_demo_no_live_payment",
        maxTimeoutSeconds: 300,
        extra: {
          name: "Hilt Pay API local simulation",
          version: "2",
          hilt: {
            paymentSessionId: sessionId,
            settleUrl: "https://api.hilt.so/v1/access/x402/settle",
          },
        },
      },
    ],
  };
  return {
    ...requirement,
    headers: { [PAYMENT_REQUIRED_HEADER]: encodeX402Header(requirement) },
  };
}

function consumptionUnavailable(error: unknown): ConsumptionResult | null {
  if (!(error instanceof HiltApiError)) {
    return null;
  }
  if (
    (error.statusCode !== 404 && error.statusCode !== 409) ||
    !["entitlement_not_found", "entitlement_not_active", "usage_balance_insufficient"].includes(
      error.errorCode || "",
    )
  ) {
    return null;
  }
  return {
    consumed: false,
    reason: error.errorCode || "usage_unavailable",
    status: "payment_required",
    units: 0,
    usage: null,
  };
}

class HiltExampleGateway implements HiltAccessGateway {
  readonly config: HiltExampleConfig;
  private readonly client: HiltClient | null;

  constructor(config: HiltExampleConfig) {
    this.config = config;
    if (config.mode === "local") {
      this.client = null;
      return;
    }
    requireApiKey(config);
    this.client = new HiltClient({ apiKey: config.apiKey, baseUrl: config.apiUrl });
  }

  async consumeEntitlement(externalCustomerId: string, requestId: string): Promise<ConsumptionResult> {
    if (this.config.mode === "local") {
      const state = demoState();
      const consumptionKey = `${entitlementKey(this.config, externalCustomerId)}:${requestId}`;
      const prior = state.localConsumptions.get(consumptionKey);
      if (prior) {
        return prior;
      }
      const key = entitlementKey(this.config, externalCustomerId);
      const remaining = state.localBalances.get(key) || 0;
      if (remaining < 1) {
        return {
          consumed: false,
          reason: "usage_balance_insufficient",
          status: "payment_required",
          units: 0,
          usage: { unit: "request", granted: 0, consumed: 0, remaining: 0 },
        };
      }
      const result: ConsumptionResult = {
        consumed: true,
        reason: "usage_consumed",
        status: "active",
        units: 1,
        usage: { unit: "request", granted: remaining, consumed: 1, remaining: remaining - 1 },
      };
      state.localBalances.set(key, remaining - 1);
      state.localConsumptions.set(consumptionKey, result);
      return result;
    }

    try {
      const response = await this.client!.payApi.consumeEntitlement(
        {
          external_product_id: this.config.productId,
          external_customer_id: externalCustomerId,
          units: 1,
          metadata: { request_id: requestId },
        },
        { idempotencyKey: idempotencyKey(this.config, "consume", requestId) },
      );
      return {
        consumed: response.consumed === true,
        reason: response.consumed ? "usage_consumed" : "usage_unavailable",
        status: response.consumed ? "active" : "payment_required",
        units: response.units || 0,
        usage: normalizeUsage(response.usage),
      };
    } catch (error) {
      const unavailable = consumptionUnavailable(error);
      if (unavailable) {
        return unavailable;
      }
      throw error;
    }
  }

  async settlePayment(paymentSignature: string, requestId: string): Promise<SettlementResult> {
    if (this.config.mode !== "live") {
      throw new Error("PAYMENT-SIGNATURE settlement is available only in live mode.");
    }
    const sessionId = paymentSessionId(paymentSignature);
    const settled = await this.client!.payApi.settleX402(
      { payment_session_id: sessionId, payment_signature: paymentSignature },
      { idempotencyKey: idempotencyKey(this.config, "settle", requestId) },
    );
    return {
      paymentSessionId: sessionId,
      paymentResponse: settled.headers?.[PAYMENT_RESPONSE_HEADER],
    };
  }

  async createPaymentSession(input: {
    externalCustomerId: string;
    resourceUrl: string;
    requestId: string;
  }): Promise<PaymentSessionResult> {
    if (this.config.mode === "local") {
      const id = `local_ps_${randomUUID()}`;
      demoState().localSessions.set(id, {
        id,
        externalCustomerId: input.externalCustomerId,
        status: "pending",
      });
      const requirement = localPaymentRequirement(id, input.resourceUrl);
      return {
        id,
        status: "pending",
        checkout_url: null,
        payment_requirement: requirement,
        payment_required_header: requirement.headers[PAYMENT_REQUIRED_HEADER],
        payment_protocol: "x402",
        settlement_rail: "solana_usdc",
        mode: "local",
        notice: "Local demonstration only. No payment, receipt, or on-chain settlement occurs.",
      };
    }

    const key = idempotencyKey(this.config, "payment", input.requestId);
    if (this.config.mode === "sandbox") {
      const response = await this.client!.payApi.createSandboxPaymentSession(
        {
          external_product_id: this.config.productId,
          external_customer_id: input.externalCustomerId,
          rail: "solana_usdc",
          confirm_sandbox_mode: true,
          metadata: { resource: input.resourceUrl, client: "grok-build-nextjs-example" },
        },
        { idempotencyKey: key },
      );
      const sandboxSession = response.sandbox_session as Record<string, unknown> | null | undefined;
      const id = stringValue(recordValue(sandboxSession, "id"));
      const proof = stringValue(recordValue(sandboxSession, "proof")) || stringValue(response.proof);
      if (!id || !proof) {
        throw new Error("Hilt sandbox response did not include the required server-side session state.");
      }
      demoState().sandboxProofs.set(id, { externalCustomerId: input.externalCustomerId, proof });
      const requirement = localPaymentRequirement(id, input.resourceUrl);
      return {
        id,
        status: stringValue(recordValue(sandboxSession, "status")) || "pending",
        checkout_url: null,
        payment_requirement: requirement,
        payment_required_header: requirement.headers[PAYMENT_REQUIRED_HEADER],
        payment_protocol: "x402",
        settlement_rail: "solana_usdc",
        mode: "sandbox",
        notice: "Hilt sandbox session. No live money or live receipt is created.",
      };
    }

    const response = await this.client!.payApi.createPaymentSession(
      {
        external_product_id: this.config.productId,
        external_customer_id: input.externalCustomerId,
        rail: "solana_usdc",
        payment_protocol: "x402",
        settlement_rail: "solana_usdc",
        metadata: {
          resource: input.resourceUrl,
          description: "One protected report request",
          mime_type: "application/json",
          client: "grok-build-nextjs-example",
        },
      },
      { idempotencyKey: key },
    );
    const session = response.payment_session;
    if (!session?.id || !session.payment_requirement) {
      throw new Error("Hilt live response did not include an x402 payment session.");
    }
    return {
      id: session.id,
      status: session.status || "pending",
      checkout_url: session.checkout_url || null,
      payment_requirement: session.payment_requirement,
      payment_required_header: requiredHeader(session.payment_requirement),
      payment_protocol: "x402",
      settlement_rail: "solana_usdc",
      mode: "live",
    };
  }

  async confirmDevelopmentSession(input: {
    externalCustomerId: string;
    paymentSessionId: string;
  }): Promise<EntitlementResult> {
    if (this.config.mode === "live") {
      throw new Error("The development confirmation route is unavailable in live mode.");
    }

    if (this.config.mode === "local") {
      const state = demoState();
      const session = state.localSessions.get(input.paymentSessionId);
      if (!session || session.externalCustomerId !== input.externalCustomerId) {
        throw new Error("Local session not found for this customer.");
      }
      session.status = "confirmed";
      const key = entitlementKey(this.config, input.externalCustomerId);
      state.localBalances.set(key, (state.localBalances.get(key) || 0) + 1);
      return {
        has_access: true,
        status: "active",
        reason: "local_demo_confirmation",
        external_product_id: this.config.productId,
        external_customer_id: input.externalCustomerId,
        expires_at: null,
        receipt_id: null,
        source: "local_demo",
        usage: { unit: "request", granted: 1, consumed: 0, remaining: 1 },
      };
    }

    const stored = demoState().sandboxProofs.get(input.paymentSessionId);
    if (!stored || stored.externalCustomerId !== input.externalCustomerId) {
      throw new Error("Sandbox proof is unavailable for this server-side session.");
    }
    await this.client!.payApi.confirmSandboxPaymentSession(
      input.paymentSessionId,
      { proof: stored.proof },
      {
        idempotencyKey: idempotencyKey(
          this.config,
          "sandbox-confirm",
          input.paymentSessionId,
        ),
      },
    );
    demoState().sandboxProofs.delete(input.paymentSessionId);
    const response = await this.client!.payApi.checkEntitlement({
      external_product_id: this.config.productId,
      external_customer_id: input.externalCustomerId,
      rail: "solana_usdc",
    });
    return normalizeEntitlement(response, this.config, input.externalCustomerId);
  }
}

export function createHiltAccessGateway(config = readHiltExampleConfig()): HiltAccessGateway {
  return new HiltExampleGateway(config);
}

export function resetDevelopmentState(): void {
  globalDemoState.__hiltGrokBuildDemoState = undefined;
}
