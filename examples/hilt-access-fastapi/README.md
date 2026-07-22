# Protect a metered FastAPI endpoint with Hilt Pay API

This runnable example implements Hilt's x402 V2 paid-request loop for one billable API call:

1. Atomically consume one usage unit before billable work.
2. Return HTTP `402` with Hilt's `PAYMENT-REQUIRED` header when no unit is available.
3. Let the buyer agent pay the advertised Solana USDC terms and retry with `PAYMENT-SIGNATURE`.
4. Settle the returned signature through `POST /v1/access/x402/settle`.
5. Atomically consume one unit through `POST /v1/access/entitlements/consume`.
6. Serve only after settlement and consumption succeed.

Current public live settlement is Solana USDC. x402 is the HTTP `402 Payment Required` protocol shape, not a blockchain, token, wallet, or settlement rail.

## Run the local no-money flow

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8088
```

On Windows PowerShell, activate with `.venv\Scripts\Activate.ps1` and use `Copy-Item .env.example .env`.

Request the metered route:

```bash
curl -i -X POST http://127.0.0.1:8088/ai/pro \
  -H "Content-Type: application/json" \
  -H "X-Customer-Id: agent_123" \
  -H "X-Request-Id: req_001" \
  -d '{"prompt":"summarize this dataset"}'
```

The first response is HTTP `402` and includes an x402 V2 `PAYMENT-REQUIRED` header. Local mode does not move money or create a live receipt.

Confirm one local usage unit with the returned session id:

```bash
curl -X POST http://127.0.0.1:8088/demo/confirm \
  -H "Content-Type: application/json" \
  -d '{"external_customer_id":"agent_123","payment_session_id":"local_ps_..."}'
```

Retry the original request with the same `X-Request-Id`. It returns HTTP `200` after consuming one unit. Repeating the same request id is idempotent; a fresh request id requires another unit.

## Live mode

Set server-only values:

```dotenv
HILT_DEMO_MODE=live
HILT_API_URL=https://api.hilt.so
HILT_API_KEY=hk_live_...
HILT_PAY_API_PRODUCT=your-metered-product-id
HILT_WEBHOOK_SECRET=whsec_...
```

In live mode, the buyer retries your protected route with:

```http
POST /ai/pro HTTP/1.1
X-Customer-Id: agent_123
X-Request-Id: req_001
PAYMENT-SIGNATURE: BASE64_X402_V2_PAYMENT_PAYLOAD
```

The merchant server, not the buyer, calls Hilt's protected endpoints. The buyer never receives the merchant Hilt API key.

`POST /v1/access/entitlements/check` remains useful for durable or time-based access display and planning. Atomic `consume` is the authority for each metered request.

## Validate

```bash
pytest -q
```

Full guide: `https://docs.hilt.so/developers/agent-micropayments`
