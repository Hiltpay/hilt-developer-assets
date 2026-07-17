Read `AGENTS.md` and invoke the `hilt-pay-api` project skill.

Then:

1. Inspect the existing protected route, Hilt gateway, webhook route, local demo flow, and tests.
2. Explain how the request moves from denied access to HTTP 402, payment-session state, entitlement confirmation, and protected access.
3. Adapt the protected response to the product described by the user while preserving the Hilt product contract.
4. Do not move Hilt keys or sandbox proofs into browser code.
5. Do not invent Hilt request fields; check the public OpenAPI first.
6. Run `npm test`, `npm run typecheck`, and `npm run build` before reporting completion.
