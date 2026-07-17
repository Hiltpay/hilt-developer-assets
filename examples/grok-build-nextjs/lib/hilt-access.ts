import { createHash, randomUUID } from "node:crypto";
import { HiltClient } from "@hiltpay/sdk";

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
}

export interface PaymentSessionResult {
  id: string;
  status: string;
  checkout_url: string | null;
  payment_requirement: unknown | null;
  payment_protocol: "x402";
  settlement_rail: "solana_usdc";
  mode: HiltRuntimeMode;
  notice?: string;
}

export interface HiltAccessGateway {
  readonly config: HiltExampleConfig;
  checkEntitlement(externalCustomerId: string): Promise<EntitlementResult>;
  createPaymentSession(input: {
    externalCustomerId: string;
    resourceUrl: string;
    attemptId?: string;
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
  localEntitlements: Set<string>;
  localSessions: Map<string, LocalSession>;
  sandboxProofs: Map<string, SandboxProof>;
}

const globalDemoState = globalThis as typeof globalThis & {
  __hiltGrokBuildDemoState?: DemoState;
};

function demoState(): DemoState {
  if (!globalDemoState.__hiltGrokBuildDemoState) {
    globalDemoState.__hiltGrokBuildDemoState = {
      localEntitlements: new Set(),
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

function idempotencyKey(config: HiltExampleConfig, externalCustomerId: string, attemptId?: string): string {
  const logicalAttempt = attemptId?.trim() || randomUUID();
  const digest = createHash("sha256")
    .update(`${config.mode}:${config.productId}:${externalCustomerId}:${logicalAttempt}`)
    .digest("hex")
    .slice(0, 32);
  return `hilt-grok-${digest}`;
}

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

  async checkEntitlement(externalCustomerId: string): Promise<EntitlementResult> {
    if (this.config.mode === "local") {
      const active = demoState().localEntitlements.has(entitlementKey(this.config, externalCustomerId));
      return {
        has_access: active,
        status: active ? "active" : "not_found",
        reason: active ? "local_demo_confirmation" : "no_entitlement",
        external_product_id: this.config.productId,
        external_customer_id: externalCustomerId,
        expires_at: active ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null,
        receipt_id: null,
        source: "local_demo",
      };
    }

    const response = await this.client!.payApi.checkEntitlement({
      external_product_id: this.config.productId,
      external_customer_id: externalCustomerId,
      rail: "solana_usdc",
    });
    return normalizeEntitlement(response, this.config, externalCustomerId);
  }

  async createPaymentSession(input: {
    externalCustomerId: string;
    resourceUrl: string;
    attemptId?: string;
  }): Promise<PaymentSessionResult> {
    if (this.config.mode === "local") {
      const id = `local_ps_${randomUUID()}`;
      demoState().localSessions.set(id, {
        id,
        externalCustomerId: input.externalCustomerId,
        status: "pending",
      });
      return {
        id,
        status: "pending",
        checkout_url: null,
        payment_requirement: {
          type: "local_demo",
          protocol_preview: "x402",
          settlement_preview: "solana_usdc",
          resource: input.resourceUrl,
          no_live_payment: true,
        },
        payment_protocol: "x402",
        settlement_rail: "solana_usdc",
        mode: "local",
        notice: "Local demonstration only. No payment, receipt, or on-chain settlement occurs.",
      };
    }

    const key = idempotencyKey(this.config, input.externalCustomerId, input.attemptId);
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
      return {
        id,
        status: stringValue(recordValue(sandboxSession, "status")) || "pending",
        checkout_url: null,
        payment_requirement: null,
        payment_protocol: "x402",
        settlement_rail: "solana_usdc",
        mode: "sandbox",
        notice: "Hilt sandbox session. No live money or receipt is created.",
      };
    }

    const response = await this.client!.payApi.createPaymentSession(
      {
        external_product_id: this.config.productId,
        external_customer_id: input.externalCustomerId,
        rail: "solana_usdc",
        payment_protocol: "x402",
        settlement_rail: "solana_usdc",
        metadata: { resource: input.resourceUrl, client: "grok-build-nextjs-example" },
      },
      { idempotencyKey: key },
    );
    const session = response.payment_session;
    if (!session?.id) {
      throw new Error("Hilt live response did not include a payment session id.");
    }
    return {
      id: session.id,
      status: session.status || "pending",
      checkout_url: session.checkout_url || null,
      payment_requirement: session.payment_requirement || null,
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
      const session = demoState().localSessions.get(input.paymentSessionId);
      if (!session || session.externalCustomerId !== input.externalCustomerId) {
        throw new Error("Local session not found for this customer.");
      }
      session.status = "confirmed";
      demoState().localEntitlements.add(entitlementKey(this.config, input.externalCustomerId));
      return this.checkEntitlement(input.externalCustomerId);
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
          input.externalCustomerId,
          `confirm:${input.paymentSessionId}`,
        ),
      },
    );
    demoState().sandboxProofs.delete(input.paymentSessionId);
    return this.checkEntitlement(input.externalCustomerId);
  }
}

export function createHiltAccessGateway(config = readHiltExampleConfig()): HiltAccessGateway {
  return new HiltExampleGateway(config);
}

export function resetDevelopmentState(): void {
  globalDemoState.__hiltGrokBuildDemoState = undefined;
}
