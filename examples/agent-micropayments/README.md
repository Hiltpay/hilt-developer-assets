# Hilt agent micropayments

Complete reference flow for charging an AI agent for one protected request with Hilt Pay API.

The protected-resource server:

1. Atomically consumes one available usage unit.
2. Returns HTTP `402` with a Hilt-authored `PAYMENT-REQUIRED` header when payment is needed.
3. Settles a returned `PAYMENT-SIGNATURE` through Hilt.
4. Serves work only after settlement and usage consumption succeed.

The buyer:

1. Reads the x402 V2 requirement.
2. Validates Hilt's `hilt-exact` Solana USDC terms.
3. Signs one transaction containing the merchant and Hilt fee transfers.
4. Retries the original request with `PAYMENT-SIGNATURE`.

Hilt verifies the signed transaction against the advertised requirement before broadcast. Settlement creates the receipt and entitlement state used by the protected resource. Reusing the same request ID cannot consume the same unit twice.

## Run it

Use Node.js 20.18 or later. The buyer example uses the current `@solana/kit` and `@solana-program/token` clients.

```bash
npm ci
npm run typecheck
```

Copy `src/protected-resource.ts` into a server route or worker and call `protectAgentRequest(request)`. Keep `HILT_API_KEY` server-side. Use `src/buyer.ts` in the wallet-owning client or agent runtime and pass its RPC URL and transaction signer.

Create the Hilt Pay API product with:

- `payment_protocol: "x402"` when creating sessions
- `default_rail: "solana_usdc"`
- a `usage_unit` such as `request`
- `usage_units_per_payment` set to the number of calls bought per payment

Current public live settlement is Solana USDC. x402 is the HTTP `402 Payment Required` protocol shape, not a blockchain, token, wallet, or settlement rail.

Guide: https://docs.hilt.so/developers/agent-micropayments
