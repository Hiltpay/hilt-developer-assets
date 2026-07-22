---
name: hilt-pay-api
description: Build or review server-side Hilt Pay API protected-resource flows using atomic usage consumption, HTTP 402, x402 V2 payment requirements, Solana USDC settlement, idempotent writes, and verified webhooks.
---

# Hilt Pay API

Use this skill when adding or reviewing paid API access in this project.

## Workflow

1. Read `AGENTS.md` and the public Hilt discovery files it names.
2. Inspect the existing route and gateway before editing.
3. Keep all Hilt credentials server-side.
4. Atomically consume one Hilt usage unit before serving metered work.
5. Return HTTP 402 with Hilt's `PAYMENT-REQUIRED` header when usage is missing.
6. Settle a paid retry's `PAYMENT-SIGNATURE` through Hilt, then consume one unit.
7. Use Solana USDC as the current public live settlement rail.
8. Confirm that metered work is served only after settlement and consumption succeed.
9. Use entitlement checks for durable access display and planning, not as metered authority.
10. Verify webhooks against the raw request body.
11. Run `npm test`, `npm run typecheck`, and `npm run build`.

## Boundaries

- Local mode is a no-money control-flow demonstration.
- Sandbox mode validates Hilt API handling without live money.
- Live mode requires owner-approved Hilt setup and uses the real buyer payment path.
- x402 describes the HTTP payment-required interface. It does not replace Solana settlement or Hilt entitlement state.
