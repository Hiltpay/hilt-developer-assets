---
name: hilt-pay-api
description: Build or review server-side Hilt Pay API protected-resource flows using entitlement checks, HTTP 402, x402 payment requirements, Solana USDC settlement, idempotent writes, and verified webhooks.
---

# Hilt Pay API

Use this skill when adding or reviewing paid API access in this project.

## Workflow

1. Read `AGENTS.md` and the public Hilt discovery files it names.
2. Inspect the existing route and gateway before editing.
3. Keep all Hilt credentials server-side.
4. Check Hilt entitlement before serving paid work.
5. Return HTTP 402 with the Hilt-created x402 requirement when access is missing.
6. Use Solana USDC as the current public live settlement rail.
7. Confirm that access is served only after Hilt returns `has_access: true`.
8. Verify webhooks against the raw request body.
9. Run `npm test`, `npm run typecheck`, and `npm run build`.

## Boundaries

- Local mode is a no-money control-flow demonstration.
- Sandbox mode validates Hilt API handling without live money.
- Live mode requires owner-approved Hilt setup and uses the real buyer payment path.
- x402 describes the HTTP payment-required interface. It does not replace Solana settlement or Hilt entitlement state.
