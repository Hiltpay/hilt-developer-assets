# Hilt Pay API with Grok Build and Next.js

This is a runnable Next.js App Router example for adding paid API access with Hilt Pay API. It includes:

- a protected API route that atomically consumes one Hilt usage unit before serving content
- an HTTP `402 Payment Required` response with Hilt's `PAYMENT-REQUIRED` header when usage is missing
- Hilt Pay API payment-session creation under `/v1/access`
- x402 V2 `PAYMENT-SIGNATURE` settlement through Hilt
- local and Hilt sandbox confirmation paths for development
- signed Hilt webhook verification
- `AGENTS.md` and a project skill that Grok Build discovers automatically
- automated tests for the consume -> 402 -> settle -> consume -> serve loop

Current public live settlement is Solana USDC. x402 is the HTTP `402 Payment Required` protected-resource protocol shape, not a chain, token, wallet, or settlement rail.

Requires Node.js 20.9 or newer.

## Run the local flow

The default mode requires no Hilt key and never moves money.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`, request the protected report, run the clearly labelled local confirmation, then retry the route.

On PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`.

## Run against Hilt sandbox

Create a sandbox Hilt Pay API product first, then set:

```dotenv
HILT_DEMO_MODE=sandbox
HILT_API_KEY=hk_sandbox_...
HILT_PAY_API_PRODUCT=your-external-product-id
```

The browser receives only the sandbox session id. The sandbox proof and Hilt key stay on the server.

## Prepare live mode

Live mode uses Hilt Pay API under `/v1/access` and requests an x402 payment session backed by Solana USDC.

```dotenv
HILT_DEMO_MODE=live
HILT_API_KEY=hk_live_...
HILT_PAY_API_PRODUCT=your-external-product-id
HILT_WEBHOOK_SECRET=whsec_...
```

For metered requests, the protected route uses `POST /v1/access/entitlements/consume` as the runtime authority. On a paid retry, it sends the buyer's `PAYMENT-SIGNATURE` to `POST /v1/access/x402/settle`, atomically consumes one unit, and serves only after both calls succeed. The buyer signs from its own wallet; the server never holds a buyer key.

Use `POST /v1/access/entitlements/check` for durable or time-based access display and planning. It is not the authority for a billable metered request.

Before live buyer traffic, complete Hilt setup, owner approval, billing, payout wallet configuration, webhook setup, and sandbox validation.

## Use Grok Build

Grok Build reads the included `AGENTS.md` and `.grok/skills/hilt-pay-api/SKILL.md` files.

```bash
grok inspect
grok
```

Then ask:

```text
Read AGENTS.md and invoke the hilt-pay-api skill. Verify this example, explain the consume -> 402 -> settle -> consume -> serve flow, and adapt it to my metered endpoint without moving Hilt keys into browser code.
```

For a headless review:

```bash
npm run grok:review
```

## Routes

| Route | Purpose |
| --- | --- |
| `POST /api/protected-report` | Settles an optional `PAYMENT-SIGNATURE`, atomically consumes one unit, returns HTTP 402 when unpaid, and serves only after successful consumption. |
| `POST /api/demo/confirm` | Confirms only local or Hilt sandbox sessions. It is unavailable in live mode. |
| `GET /api/status` | Returns safe mode, product, protocol, and settlement metadata. It never returns secrets. |
| `POST /api/hilt/webhook` | Verifies `X-Hilt-Signature` against the raw request body before dispatching events. |

## Checks

```bash
npm test
npm run typecheck
npm run build
```

## Public references

- Hilt Grok Build guide: `https://docs.hilt.so/developers/grok-build`
- Hilt Agent Builder Kit: `https://docs.hilt.so/developers/agent-builder-kit`
- Hilt Pay API docs: `https://docs.hilt.so/developers/access`
- Hilt OpenAPI: `https://api.hilt.so/v1/openapi.json`
- Hilt agent manifest: `https://www.hilt.so/.well-known/hilt-agent.json`
- Grok Build docs: `https://docs.x.ai/build/overview`

Hilt and Grok Build are separate products. This example documents compatibility with Grok Build's public `AGENTS.md`, project-skill, headless, and MCP capabilities; it does not claim an xAI partnership.
