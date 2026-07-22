Read `AGENTS.md` and invoke the `hilt-pay-api` project skill.

Then:

1. Inspect the existing protected route, Hilt gateway, webhook route, local demo flow, and tests.
2. Explain how the request moves through atomic consumption, HTTP 402, buyer payment, Hilt settlement, retry-safe consumption, and the protected response.
3. Adapt the protected response to the product described by the user while preserving the Hilt product contract.
4. Do not move Hilt keys or sandbox proofs into browser code.
5. Preserve `POST /v1/access/x402/settle` followed by `POST /v1/access/entitlements/consume` as the metered runtime authority.
6. Do not invent Hilt request fields; check the public OpenAPI first.
7. Run `npm test`, `npm run typecheck`, and `npm run build` before reporting completion.
