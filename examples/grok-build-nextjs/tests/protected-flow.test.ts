import assert from "node:assert/strict";
import test from "node:test";
import {
  createHiltAccessGateway,
  resetDevelopmentState,
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
    resourceUrl: "http://localhost/api/protected-report",
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, "customer_required");
});

test("returns an x402-shaped 402 response without leaking credentials", async () => {
  const result = await handleProtectedFlow(createHiltAccessGateway(config), {
    attemptId: "attempt-001",
    customerId: "customer-001",
    prompt: "Give me the report",
    resourceUrl: "http://localhost/api/protected-report",
  });

  assert.equal(result.status, 402);
  assert.equal(result.body.payment_protocol, "x402");
  assert.equal(result.body.settlement_rail, "solana_usdc");
  assert.equal(result.body.mode, "local");
  assert.match(String(result.body.notice), /No payment/);
  assert.doesNotMatch(JSON.stringify(result.body), /HILT_API_KEY|hk_sandbox|hk_live|proof/i);
});

test("serves protected content only after a confirmed entitlement", async () => {
  const gateway = createHiltAccessGateway(config);
  const unpaid = await handleProtectedFlow(gateway, {
    attemptId: "attempt-002",
    customerId: "customer-002",
    resourceUrl: "http://localhost/api/protected-report",
  });
  const session = unpaid.body.payment_session as { id: string };

  const entitlement = await gateway.confirmDevelopmentSession({
    externalCustomerId: "customer-002",
    paymentSessionId: session.id,
  });
  assert.equal(entitlement.has_access, true);
  assert.equal(entitlement.source, "local_demo");

  const paid = await handleProtectedFlow(gateway, {
    customerId: "customer-002",
    prompt: "Give me the report",
    resourceUrl: "http://localhost/api/protected-report",
  });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.access, "granted");
});

test("does not confirm a session for a different customer", async () => {
  const gateway = createHiltAccessGateway(config);
  const unpaid = await handleProtectedFlow(gateway, {
    customerId: "customer-003",
    resourceUrl: "http://localhost/api/protected-report",
  });
  const session = unpaid.body.payment_session as { id: string };

  await assert.rejects(
    gateway.confirmDevelopmentSession({
      externalCustomerId: "customer-004",
      paymentSessionId: session.id,
    }),
    /not found for this customer/,
  );
});
