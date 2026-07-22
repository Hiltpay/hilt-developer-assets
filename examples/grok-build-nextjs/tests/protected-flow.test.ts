import assert from "node:assert/strict";
import test from "node:test";
import { decodePaymentRequiredHeader, PAYMENT_REQUIRED_HEADER } from "@hiltpay/sdk/x402";
import {
  createHiltAccessGateway,
  resetDevelopmentState,
  type HiltAccessGateway,
  type HiltExampleConfig,
} from "../lib/hilt-access";
import { handleProtectedFlow } from "../lib/protected-flow";

const config: HiltExampleConfig = {
  apiUrl: "https://api.hilt.so",
  apiKey: "",
  productId: "grok-build-test-product",
  mode: "local",
};

test.beforeEach(() => resetDevelopmentState());

test("rejects a protected request without customer identity", async () => {
  const result = await handleProtectedFlow(createHiltAccessGateway(config), {
    requestId: "request-001",
    resourceUrl: "http://localhost/api/protected-report",
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "customer_required");
});

test("requires a stable request id for atomic consumption", async () => {
  const result = await handleProtectedFlow(createHiltAccessGateway(config), {
    customerId: "customer-001",
    resourceUrl: "http://localhost/api/protected-report",
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "request_required");
});

test("returns an x402 V2 402 response without leaking credentials", async () => {
  const result = await handleProtectedFlow(createHiltAccessGateway(config), {
    customerId: "customer-001",
    prompt: "Give me the report",
    requestId: "request-002",
    resourceUrl: "http://localhost/api/protected-report",
  });

  assert.equal(result.status, 402);
  assert.equal(result.body.payment_protocol, "x402");
  assert.equal(result.body.settlement_rail, "solana_usdc");
  assert.equal(result.body.mode, "local");
  assert.equal((result.body.usage as { remaining: number }).remaining, 0);
  assert.match(String(result.body.notice), /No payment/);
  const header = result.headers?.[PAYMENT_REQUIRED_HEADER];
  assert.ok(header);
  assert.equal(decodePaymentRequiredHeader(header).x402Version, 2);
  assert.doesNotMatch(JSON.stringify(result.body), /HILT_API_KEY|hk_sandbox|hk_live|sandbox_proof/i);
});

test("serves exactly one metered request after development confirmation", async () => {
  const gateway = createHiltAccessGateway(config);
  const unpaid = await handleProtectedFlow(gateway, {
    customerId: "customer-002",
    requestId: "request-003",
    resourceUrl: "http://localhost/api/protected-report",
  });
  const session = unpaid.body.payment_session as { id: string };

  const entitlement = await gateway.confirmDevelopmentSession({
    externalCustomerId: "customer-002",
    paymentSessionId: session.id,
  });
  assert.equal(entitlement.usage?.remaining, 1);

  const paid = await handleProtectedFlow(gateway, {
    customerId: "customer-002",
    prompt: "Give me the report",
    requestId: "request-003",
    resourceUrl: "http://localhost/api/protected-report",
  });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.access, "granted");
  assert.equal((paid.body.consumption as { consumed: boolean }).consumed, true);

  const nextRequest = await handleProtectedFlow(gateway, {
    customerId: "customer-002",
    requestId: "request-004",
    resourceUrl: "http://localhost/api/protected-report",
  });
  assert.equal(nextRequest.status, 402);
});

test("reusing a request id cannot consume the same unit twice", async () => {
  const gateway = createHiltAccessGateway(config);
  const unpaid = await handleProtectedFlow(gateway, {
    customerId: "customer-003",
    requestId: "request-005",
    resourceUrl: "http://localhost/api/protected-report",
  });
  const session = unpaid.body.payment_session as { id: string };
  await gateway.confirmDevelopmentSession({
    externalCustomerId: "customer-003",
    paymentSessionId: session.id,
  });

  const first = await handleProtectedFlow(gateway, {
    customerId: "customer-003",
    requestId: "request-005",
    resourceUrl: "http://localhost/api/protected-report",
  });
  const retry = await handleProtectedFlow(gateway, {
    customerId: "customer-003",
    requestId: "request-005",
    resourceUrl: "http://localhost/api/protected-report",
  });
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);

  const fresh = await handleProtectedFlow(gateway, {
    customerId: "customer-003",
    requestId: "request-006",
    resourceUrl: "http://localhost/api/protected-report",
  });
  assert.equal(fresh.status, 402);
});

test("does not confirm a session for a different customer", async () => {
  const gateway = createHiltAccessGateway(config);
  const unpaid = await handleProtectedFlow(gateway, {
    customerId: "customer-004",
    requestId: "request-007",
    resourceUrl: "http://localhost/api/protected-report",
  });
  const session = unpaid.body.payment_session as { id: string };

  await assert.rejects(
    gateway.confirmDevelopmentSession({
      externalCustomerId: "customer-005",
      paymentSessionId: session.id,
    }),
    /not found for this customer/,
  );
});

test("never issues a second payment challenge after settlement", async () => {
  const gateway: HiltAccessGateway = {
    config: { ...config, mode: "live" },
    async settlePayment() {
      return { paymentSessionId: "ps_settled", paymentResponse: "encoded-payment-response" };
    },
    async consumeEntitlement() {
      return {
        consumed: false,
        reason: "usage_balance_insufficient",
        status: "payment_required",
        units: 0,
        usage: null,
      };
    },
    async createPaymentSession() {
      throw new Error("must not create another payment session after settlement");
    },
    async confirmDevelopmentSession() {
      throw new Error("not used");
    },
  };

  const result = await handleProtectedFlow(gateway, {
    customerId: "customer-settled",
    paymentSignature: "encoded-payment-signature",
    requestId: "request-settled",
    resourceUrl: "http://localhost/api/protected-report",
  });

  assert.equal(result.status, 503);
  assert.equal(result.body.error, "usage_activation_pending");
  assert.equal(result.headers?.["Retry-After"], "1");
  assert.equal(result.headers?.["PAYMENT-RESPONSE"], "encoded-payment-response");
  assert.equal(result.headers?.[PAYMENT_REQUIRED_HEADER], undefined);
});
