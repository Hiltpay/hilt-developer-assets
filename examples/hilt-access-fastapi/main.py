import base64
import hashlib
import hmac
import json
import os
import uuid
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

load_dotenv()

HILT_API_URL = os.getenv("HILT_API_URL", "https://api.hilt.so").rstrip("/")
HILT_API_KEY = os.getenv("HILT_API_KEY", "")
HILT_DEMO_MODE = os.getenv("HILT_DEMO_MODE", "local").lower()
HILT_PAY_API_PRODUCT = os.getenv("HILT_PAY_API_PRODUCT", "pro-ai-api")
HILT_WEBHOOK_SECRET = os.getenv("HILT_WEBHOOK_SECRET", "")
SOLANA_MAINNET_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"
SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"

PAYMENT_REQUIRED_HEADER = "PAYMENT-REQUIRED"
PAYMENT_SIGNATURE_HEADER = "PAYMENT-SIGNATURE"
PAYMENT_RESPONSE_HEADER = "PAYMENT-RESPONSE"

app = FastAPI(title="Hilt Pay API metered FastAPI example", version="2.0.0")

LOCAL_BALANCES: dict[str, int] = {}
LOCAL_CONSUMPTIONS: dict[str, dict[str, Any]] = {}
LOCAL_PAYMENT_SESSIONS: dict[str, dict[str, Any]] = {}


class AiRequest(BaseModel):
    prompt: str


class DevelopmentConfirmationRequest(BaseModel):
    external_customer_id: str
    payment_session_id: str


class HiltRequestError(Exception):
    def __init__(self, status_code: int, payload: dict[str, Any]):
        super().__init__(f"Hilt request failed with HTTP {status_code}")
        self.status_code = status_code
        self.payload = payload

    @property
    def code(self) -> str:
        detail = self.payload.get("detail")
        if isinstance(detail, dict):
            return str(detail.get("code") or detail.get("error_code") or "")
        error = self.payload.get("error")
        if isinstance(error, dict):
            return str(error.get("code") or "")
        return str(self.payload.get("code") or self.payload.get("error_code") or "")


def idempotency_key(purpose: str, logical_id: str) -> str:
    digest = hashlib.sha256(
        f"fastapi:{HILT_PAY_API_PRODUCT}:{purpose}:{logical_id}".encode("utf-8")
    ).hexdigest()[:32]
    return f"hilt-fastapi-{purpose}-{digest}"


def entitlement_key(external_customer_id: str) -> str:
    return f"{HILT_PAY_API_PRODUCT}:{external_customer_id.strip().lower()}"


def encode_x402_header(value: dict[str, Any]) -> str:
    compact = json.dumps(value, separators=(",", ":")).encode("utf-8")
    return base64.b64encode(compact).decode("ascii")


def decode_x402_header(value: str) -> dict[str, Any]:
    try:
        decoded = base64.b64decode(value.strip(), validate=True)
        payload = json.loads(decoded.decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail={"code": "invalid_payment_signature"}) from exc
    if not isinstance(payload, dict) or payload.get("x402Version") != 2:
        raise HTTPException(status_code=400, detail={"code": "invalid_payment_signature"})
    return payload


def payment_session_id(payment_signature: str) -> str:
    payload = decode_x402_header(payment_signature)
    accepted = payload.get("accepted") or {}
    extra = accepted.get("extra") or {}
    hilt = extra.get("hilt") or {}
    session_id = hilt.get("paymentSessionId")
    if not isinstance(session_id, str) or not session_id:
        raise HTTPException(
            status_code=400,
            detail={"code": "payment_session_missing", "message": "PAYMENT-SIGNATURE is not bound to Hilt."},
        )
    return session_id


def local_payment_requirement(session_id: str, resource_url: str) -> dict[str, Any]:
    requirement = {
        "x402Version": 2,
        "resource": {
            "url": resource_url,
            "description": "One metered AI request",
            "mimeType": "application/json",
            "serviceName": "Hilt FastAPI example",
        },
        "accepts": [
            {
                "scheme": "exact",
                "network": SOLANA_MAINNET_CAIP2,
                "asset": SOLANA_USDC_MINT,
                "amount": "10000",
                "payTo": "local_demo_no_live_payment",
                "maxTimeoutSeconds": 300,
                "extra": {
                    "name": "Hilt Pay API local simulation",
                    "version": "2",
                    "hilt": {
                        "paymentSessionId": session_id,
                        "settleUrl": "https://api.hilt.so/v1/access/x402/settle",
                    },
                },
            }
        ],
    }
    return {
        **requirement,
        "headers": {PAYMENT_REQUIRED_HEADER: encode_x402_header(requirement)},
    }


async def hilt_post(
    path: str,
    payload: dict[str, Any],
    *,
    idempotency_key_value: str | None = None,
) -> tuple[dict[str, Any], httpx.Headers]:
    if not HILT_API_KEY:
        raise HTTPException(status_code=500, detail={"code": "hilt_api_key_required"})
    headers = {"X-Hilt-Key": HILT_API_KEY, "Content-Type": "application/json"}
    if idempotency_key_value:
        headers["Idempotency-Key"] = idempotency_key_value
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(f"{HILT_API_URL}{path}", headers=headers, json=payload)
    try:
        body = response.json()
    except ValueError:
        body = {"detail": "Hilt returned a non-JSON response."}
    if not response.is_success:
        raise HiltRequestError(response.status_code, body)
    return body, response.headers


def local_consume(external_customer_id: str, request_id: str) -> dict[str, Any] | None:
    key = entitlement_key(external_customer_id)
    consumption_key = f"{key}:{request_id}"
    if consumption_key in LOCAL_CONSUMPTIONS:
        return LOCAL_CONSUMPTIONS[consumption_key]
    remaining = LOCAL_BALANCES.get(key, 0)
    if remaining < 1:
        return None
    result = {
        "consumed": True,
        "units": 1,
        "usage": {
            "unit": "request",
            "granted": remaining,
            "consumed": 1,
            "remaining": remaining - 1,
        },
    }
    LOCAL_BALANCES[key] = remaining - 1
    LOCAL_CONSUMPTIONS[consumption_key] = result
    return result


async def consume_entitlement(external_customer_id: str, request_id: str) -> dict[str, Any] | None:
    if HILT_DEMO_MODE == "local":
        return local_consume(external_customer_id, request_id)
    try:
        result, _ = await hilt_post(
            "/v1/access/entitlements/consume",
            {
                "external_product_id": HILT_PAY_API_PRODUCT,
                "external_customer_id": external_customer_id,
                "units": 1,
                "metadata": {"request_id": request_id},
            },
            idempotency_key_value=idempotency_key("consume", request_id),
        )
        return result
    except HiltRequestError as exc:
        if exc.status_code in {404, 409} and exc.code in {
            "entitlement_not_found",
            "entitlement_not_active",
            "usage_balance_insufficient",
        }:
            return None
        raise HTTPException(status_code=exc.status_code, detail=exc.payload) from exc


async def settle_x402(payment_signature: str, request_id: str) -> tuple[str, str | None]:
    if HILT_DEMO_MODE != "live":
        raise HTTPException(
            status_code=409,
            detail={"code": "live_settlement_disabled", "message": "Use development confirmation outside live mode."},
        )
    session_id = payment_session_id(payment_signature)
    try:
        result, headers = await hilt_post(
            "/v1/access/x402/settle",
            {"payment_session_id": session_id, "payment_signature": payment_signature},
            idempotency_key_value=idempotency_key("settle", request_id),
        )
    except HiltRequestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.payload) from exc
    payment_response = headers.get(PAYMENT_RESPONSE_HEADER)
    if not payment_response:
        payment_response = (result.get("headers") or {}).get(PAYMENT_RESPONSE_HEADER)
    return session_id, payment_response


async def create_payment_session(external_customer_id: str, request_id: str, resource_url: str) -> dict[str, Any]:
    if HILT_DEMO_MODE == "local":
        session_id = f"local_ps_{uuid.uuid4()}"
        requirement = local_payment_requirement(session_id, resource_url)
        session = {
            "id": session_id,
            "status": "pending",
            "payment_protocol": "x402",
            "settlement_rail_id": "solana_usdc",
            "payment_requirement": requirement,
        }
        LOCAL_PAYMENT_SESSIONS[session_id] = {
            **session,
            "external_customer_id": external_customer_id,
        }
        return {"payment_session": session, "demo_mode": "local_simulation"}

    try:
        result, _ = await hilt_post(
            "/v1/access/payment-sessions",
            {
                "external_product_id": HILT_PAY_API_PRODUCT,
                "external_customer_id": external_customer_id,
                "rail": "solana_usdc",
                "payment_protocol": "x402",
                "settlement_rail": "solana_usdc",
                "metadata": {
                    "resource": resource_url,
                    "description": "One metered AI request",
                    "mime_type": "application/json",
                },
            },
            idempotency_key_value=idempotency_key("payment", request_id),
        )
        return result
    except HiltRequestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.payload) from exc


def required_header(session_response: dict[str, Any]) -> str:
    session = session_response.get("payment_session") or {}
    requirement = session.get("payment_requirement") or {}
    value = (requirement.get("headers") or {}).get(PAYMENT_REQUIRED_HEADER)
    if not isinstance(value, str) or not value:
        raise HTTPException(status_code=502, detail={"code": "payment_requirement_header_missing"})
    return value


@app.get("/health")
async def health():
    return {
        "ok": True,
        "mode": HILT_DEMO_MODE,
        "payment_protocol": "x402",
        "x402_version": 2,
        "settlement_rail": "solana_usdc",
        "metered_authority": "/v1/access/entitlements/consume",
    }


@app.post("/ai/pro")
async def pro_ai_endpoint(
    body: AiRequest,
    request: Request,
    x_customer_id: str = Header(...),
    x_request_id: str = Header(...),
    payment_signature: str | None = Header(default=None, alias=PAYMENT_SIGNATURE_HEADER),
):
    payment_response = None
    if payment_signature:
        _, payment_response = await settle_x402(payment_signature, x_request_id)

    consumption = await consume_entitlement(x_customer_id, x_request_id)
    if consumption and consumption.get("consumed") is True:
        headers = {PAYMENT_RESPONSE_HEADER: payment_response} if payment_response else None
        return JSONResponse(
            {
                "answer": f"Paid answer for {x_customer_id}: {body.prompt[:80]}",
                "request_id": x_request_id,
                "consumption": consumption,
            },
            headers=headers,
        )

    if payment_signature:
        headers = {"Retry-After": "1"}
        if payment_response:
            headers[PAYMENT_RESPONSE_HEADER] = payment_response
        return JSONResponse(
            {
                "error": "usage_activation_pending",
                "message": "Payment settled, but usage could not yet be consumed. Retry with the same X-Request-Id.",
                "usage": {"consumed": False},
            },
            status_code=503,
            headers=headers,
        )

    session_response = await create_payment_session(x_customer_id, x_request_id, str(request.url))
    return JSONResponse(
        {
            "error": "payment_required",
            "payment_protocol": "x402",
            "settlement_rail": "solana_usdc",
            "usage": {"consumed": False, "remaining": 0},
            "payment_session": session_response.get("payment_session"),
        },
        status_code=402,
        headers={PAYMENT_REQUIRED_HEADER: required_header(session_response), "Cache-Control": "no-store"},
    )


@app.post("/demo/confirm")
async def confirm_development_session(body: DevelopmentConfirmationRequest):
    if HILT_DEMO_MODE != "local":
        raise HTTPException(status_code=409, detail={"code": "development_confirmation_disabled"})
    session = LOCAL_PAYMENT_SESSIONS.get(body.payment_session_id)
    if not session or session.get("external_customer_id") != body.external_customer_id:
        raise HTTPException(status_code=404, detail={"code": "payment_session_not_found"})
    key = entitlement_key(body.external_customer_id)
    LOCAL_BALANCES[key] = LOCAL_BALANCES.get(key, 0) + 1
    session["status"] = "confirmed"
    return {
        "confirmed": True,
        "external_customer_id": body.external_customer_id,
        "usage": {"unit": "request", "granted": 1, "consumed": 0, "remaining": 1},
        "demo_mode": "local_simulation",
    }


def parse_hilt_signature_header(signature_header: str, timestamp_header: str = "") -> tuple[str, str] | None:
    parts: dict[str, str] = {}
    for chunk in signature_header.split(","):
        if "=" not in chunk:
            continue
        key, value = chunk.strip().split("=", 1)
        parts[key] = value
    if parts.get("t") and parts.get("v1"):
        return parts["t"], parts["v1"]
    if timestamp_header and signature_header and "=" not in signature_header:
        return timestamp_header, signature_header
    return None


def verify_hilt_signature(signature_header: str, raw_body: bytes, timestamp_header: str = "") -> bool:
    if not HILT_WEBHOOK_SECRET:
        return False
    parsed = parse_hilt_signature_header(signature_header, timestamp_header)
    if not parsed:
        return False
    timestamp, signature = parsed
    signed_payload = timestamp.encode("utf-8") + b"." + raw_body
    expected = hmac.new(HILT_WEBHOOK_SECRET.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@app.post("/hilt/webhook")
async def hilt_webhook(
    request: Request,
    x_hilt_timestamp: str = Header(default=""),
    x_hilt_signature: str = Header(default=""),
):
    raw_body = await request.body()
    if HILT_WEBHOOK_SECRET and not verify_hilt_signature(x_hilt_signature, raw_body, x_hilt_timestamp):
        raise HTTPException(status_code=401, detail="Invalid Hilt webhook signature")
    event = json.loads(raw_body or b"{}")
    return {
        "ok": True,
        "event_type": event.get("type") or event.get("event_type"),
        "source_id": event.get("source_id"),
    }
