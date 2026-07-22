import { PAYMENT_REQUIRED_HEADER, PAYMENT_RESPONSE_HEADER } from "@hiltpay/sdk/x402";
import type { HiltAccessGateway } from "./hilt-access";

export interface ProtectedFlowInput {
  customerId?: string;
  paymentSignature?: string;
  prompt?: string;
  requestId?: string;
  resourceUrl: string;
}

export interface ProtectedFlowResponse {
  body: Record<string, unknown>;
  headers?: Record<string, string>;
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

  const requestId = input.requestId?.trim();
  if (!requestId) {
    return {
      status: 400,
      body: { error: "request_required", message: "Provide X-Request-Id for retry-safe usage consumption." },
    };
  }

  const settlement = input.paymentSignature
    ? await gateway.settlePayment(input.paymentSignature, requestId)
    : null;
  const consumption = await gateway.consumeEntitlement(customerId, requestId);

  if (consumption.consumed) {
    return {
      status: 200,
      headers: settlement?.paymentResponse
        ? { [PAYMENT_RESPONSE_HEADER]: settlement.paymentResponse }
        : undefined,
      body: {
        ok: true,
        access: "granted",
        consumption,
        report: {
          title: "Protected Solana commerce report",
          requested_by: customerId,
          request_id: requestId,
          summary: `Paid response for: ${input.prompt?.trim() || "latest payment-to-access signals"}`,
        },
      },
    };
  }

  if (settlement) {
    return {
      status: 503,
      headers: settlement.paymentResponse
        ? { [PAYMENT_RESPONSE_HEADER]: settlement.paymentResponse, "Retry-After": "1" }
        : { "Retry-After": "1" },
      body: {
        error: "usage_activation_pending",
        message: "Payment settled, but usage could not yet be consumed. Retry this request with the same X-Request-Id.",
        payment_session_id: settlement.paymentSessionId,
        usage: {
          consumed: false,
          reason: consumption.reason,
        },
      },
    };
  }

  const session = await gateway.createPaymentSession({
    externalCustomerId: customerId,
    resourceUrl: input.resourceUrl,
    requestId,
  });

  return {
    status: 402,
    headers: {
      "Cache-Control": "no-store",
      [PAYMENT_REQUIRED_HEADER]: session.payment_required_header,
    },
    body: {
      error: "payment_required",
      payment_protocol: "x402",
      settlement_rail: "solana_usdc",
      mode: gateway.config.mode,
      usage: {
        consumed: false,
        reason: consumption.reason,
        remaining: consumption.usage?.remaining || 0,
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
