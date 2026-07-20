import { HiltApiError, HiltClient } from "@hiltpay/sdk";
import type { HiltX402PaymentPayload } from "@hiltpay/sdk";
import {
  decodeX402Header,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  PAYMENT_SIGNATURE_HEADER,
} from "@hiltpay/sdk/x402";

const hilt = new HiltClient({
  apiKey: process.env.HILT_API_KEY,
});
const externalProductId =
  process.env.HILT_EXTERNAL_PRODUCT_ID ?? "agent-research-call";

function requiredHeader(
  paymentRequirement: Record<string, unknown>,
): string {
  const headers = paymentRequirement.headers;
  if (!headers || typeof headers !== "object") {
    throw new Error("Hilt payment requirement did not contain headers.");
  }
  const value = (headers as Record<string, unknown>)[PAYMENT_REQUIRED_HEADER];
  if (typeof value !== "string" || !value) {
    throw new Error("Hilt payment requirement did not contain PAYMENT-REQUIRED.");
  }
  return value;
}

function paymentSessionId(paymentSignature: string): string {
  const payload = decodeX402Header<HiltX402PaymentPayload>(paymentSignature);
  const id = payload.accepted?.extra?.hilt?.paymentSessionId;
  if (!id) {
    throw new Error("PAYMENT-SIGNATURE is not bound to a Hilt payment session.");
  }
  return id;
}

function isPaymentRequired(error: unknown): boolean {
  return (
    error instanceof HiltApiError &&
    (error.statusCode === 404 || error.statusCode === 409) &&
    ["entitlement_not_found", "entitlement_not_active", "usage_balance_insufficient"].includes(
      error.errorCode ?? "",
    )
  );
}

export async function protectAgentRequest(request: Request): Promise<Response> {
  const externalCustomerId = request.headers.get("X-Agent-Id");
  const requestId = request.headers.get("X-Request-Id");
  if (!externalCustomerId || !requestId) {
    return Response.json(
      { error: "X-Agent-Id and X-Request-Id are required." },
      { status: 400 },
    );
  }

  const paymentSignature = request.headers.get(PAYMENT_SIGNATURE_HEADER);
  let paymentResponse: string | undefined;
  if (paymentSignature) {
    const settled = await hilt.payApi.settleX402(
      {
        payment_session_id: paymentSessionId(paymentSignature),
        payment_signature: paymentSignature,
      },
      { idempotencyKey: "settle-" + requestId },
    );
    paymentResponse = settled.headers[PAYMENT_RESPONSE_HEADER];
  }

  try {
    await hilt.payApi.consumeEntitlement(
      {
        external_product_id: externalProductId,
        external_customer_id: externalCustomerId,
        units: 1,
        metadata: { request_id: requestId },
      },
      { idempotencyKey: "consume-" + requestId },
    );
  } catch (error) {
    if (!isPaymentRequired(error)) {
      throw error;
    }
    const session = await hilt.payApi.createPaymentSession(
      {
        external_product_id: externalProductId,
        external_customer_id: externalCustomerId,
        payment_protocol: "x402",
        settlement_rail: "solana_usdc",
        metadata: {
          resource: request.url,
          description: "One agent request",
          mime_type: "application/json",
        },
      },
      { idempotencyKey: "payment-" + requestId },
    );
    const requirement = session.payment_session?.payment_requirement;
    if (!requirement || typeof requirement !== "object") {
      throw new Error("Hilt did not return an x402 payment requirement.");
    }
    return Response.json(
      { error: "payment_required", external_product_id: externalProductId },
      {
        status: 402,
        headers: {
          [PAYMENT_REQUIRED_HEADER]: requiredHeader(
            requirement as Record<string, unknown>,
          ),
        },
      },
    );
  }

  return Response.json(
    { ok: true, result: "Paid agent work belongs here." },
    {
      headers: paymentResponse
        ? { [PAYMENT_RESPONSE_HEADER]: paymentResponse }
        : undefined,
    },
  );
}
