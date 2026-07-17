import type { HiltAccessGateway } from "./hilt-access";

export interface ProtectedFlowInput {
  attemptId?: string;
  customerId?: string;
  prompt?: string;
  resourceUrl: string;
}

export interface ProtectedFlowResponse {
  body: Record<string, unknown>;
  status: number;
}

export async function handleProtectedFlow(
  gateway: HiltAccessGateway,
  input: ProtectedFlowInput,
): Promise<ProtectedFlowResponse> {
  const customerId = input.customerId?.trim();
  if (!customerId) {
    return {
      status: 400,
      body: { error: "customer_required", message: "Provide X-Customer-Id before requesting paid access." },
    };
  }

  const entitlement = await gateway.checkEntitlement(customerId);
  if (entitlement.has_access) {
    return {
      status: 200,
      body: {
        ok: true,
        access: "granted",
        entitlement,
        report: {
          title: "Protected Solana commerce report",
          requested_by: customerId,
          summary: `Paid response for: ${input.prompt?.trim() || "latest payment-to-access signals"}`,
        },
      },
    };
  }

  const session = await gateway.createPaymentSession({
    externalCustomerId: customerId,
    resourceUrl: input.resourceUrl,
    attemptId: input.attemptId,
  });

  return {
    status: 402,
    body: {
      error: "payment_required",
      payment_protocol: "x402",
      settlement_rail: "solana_usdc",
      mode: gateway.config.mode,
      entitlement: {
        has_access: false,
        status: entitlement.status,
        reason: entitlement.reason,
      },
      payment_session: {
        id: session.id,
        status: session.status,
        checkout_url: session.checkout_url,
      },
      payment_requirement: session.payment_requirement,
      notice: session.notice || null,
    },
  };
}
