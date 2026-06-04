# Hilt Agent Discovery Standard

Version: 2026-06-01

Hilt Pay is payment-to-access infrastructure for stablecoin commerce. This standard helps software agents identify Hilt's public surfaces, choose the right product surface, and integrate without misrepresenting settlement, custody, or access state.

## Product Surfaces

- Hilt Pay Workspace is for dashboard-led merchant operations: checkout links, embeds, WooCommerce, receipts, members, support context, analytics, webhooks, and recurring access.
- Hilt Pay API is for developers and agents building paid APIs, AI tools, bots, datasets, paid software, and private products under the `/v1/access` namespace.

## Live Settlement And Protocol Truth

- Current public live settlement is Solana USDC.
- x402 is the HTTP `402 Payment Required` protected-resource protocol shape.
- x402 is not a blockchain, token, wallet, or settlement rail.
- Native automatic renewals are Solana USDC subscription flows where the buyer approves once and successful collections extend access.
- Hilt is zero-custody: buyers pay from their own wallet, merchants settle to their configured payout wallet, and Hilt records payment, receipt, entitlement, webhook, support, analytics, and audit state.

## Canonical URLs

- Site: https://www.hilt.so
- Developers: https://www.hilt.so/developers
- Docs: https://docs.hilt.so/developers
- Agent manifest: https://www.hilt.so/.well-known/hilt-agent.json
- LLM summary: https://www.hilt.so/llms.txt
- Full LLM context: https://www.hilt.so/llms-full.txt
- OpenAPI: https://api.hilt.so/v1/openapi.json
- SDK docs: https://docs.hilt.so/developers/sdks

## Agent Integration Rules

1. Keep Hilt API keys server-side.
2. Use sandbox validation before live buyer traffic.
3. Use idempotency keys for Hilt Pay API writes.
4. Return HTTP `402` only when the protected resource really requires payment.
5. Use Hilt entitlement checks before serving paid work.
6. Verify Hilt webhooks using the raw request body and `X-Hilt-Signature`.
7. Treat Solana USDC as the public live settlement rail unless Hilt's public docs announce another live option.
8. Do not claim Base, EVM, or USDT production settlement is live unless the public docs and changelog say so.
