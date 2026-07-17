# Hilt Pay API project rules

This example protects a server route with Hilt Pay API. Preserve these rules when adapting it.

## Product contract

- Hilt Pay API uses `https://api.hilt.so/v1/access`.
- Current public live settlement is Solana USDC.
- x402 is the HTTP `402 Payment Required` protected-resource protocol shape. It is not a blockchain, token, wallet, chain, or settlement rail.
- Hilt is zero-custody. Buyers pay from their own wallet and merchants settle to their configured payout wallet. Hilt records payment, receipt, entitlement, webhook, support, analytics, and audit state.
- Native Solana USDC subscriptions are live, but this example uses a one-off protected-resource flow.

## Required behavior

1. Keep `HILT_API_KEY` and `HILT_WEBHOOK_SECRET` in server-only code.
2. Call `POST /v1/access/entitlements/check` before serving protected content.
3. Serve the protected response only when Hilt returns `has_access: true`.
4. When access is missing, create a Hilt Pay API payment session and return HTTP 402.
5. Use `payment_protocol: "x402"` and `settlement_rail: "solana_usdc"` for the live protected-resource session.
6. Use a stable idempotency key for each logical write attempt.
7. Verify the raw webhook body and `X-Hilt-Signature` before dispatching an event.
8. Keep local, sandbox, and live states visibly distinct.

## Never do this

- Do not grant access from a transaction hash, wallet signature, client claim, webhook alone, or payment session with a pending state.
- Do not put Hilt credentials in a client component or a `NEXT_PUBLIC_*` variable.
- Do not turn the local confirmation route into a live payment bypass.
- Do not claim Base, EVM, or USDT settlement is live unless current Hilt public docs explicitly say so.
- Do not describe this example as an official xAI partnership or as powered by Grok Build.

## Source order

Before changing Hilt request fields, read:

1. `https://www.hilt.so/llms.txt`
2. `https://www.hilt.so/.well-known/hilt-agent.json`
3. `https://docs.hilt.so/developers/grok-build`
4. `https://docs.hilt.so/developers/access`
5. `https://api.hilt.so/v1/openapi.json`

## Acceptance checks

Run:

```bash
npm test
npm run typecheck
npm run build
```

The protected-route test must prove all of these states:

- missing customer identity is rejected
- unpaid access returns HTTP 402
- the 402 body identifies x402 as the protocol and Solana USDC as settlement
- local confirmation is clearly marked as a simulation
- a confirmed entitlement allows the protected response
- no API key or sandbox proof appears in a browser response
