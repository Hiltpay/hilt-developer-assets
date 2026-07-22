import base64
import json

from fastapi.testclient import TestClient

import main


def reset_demo_state():
    main.LOCAL_BALANCES.clear()
    main.LOCAL_CONSUMPTIONS.clear()
    main.LOCAL_PAYMENT_SESSIONS.clear()
    main.HILT_DEMO_MODE = "local"


def decode_header(value: str) -> dict:
    return json.loads(base64.b64decode(value).decode("utf-8"))


def test_local_metered_flow_is_402_then_consume_then_serve():
    reset_demo_state()
    client = TestClient(main.app)
    customer_id = "cust_demo_flow"

    denied = client.post(
        "/ai/pro",
        headers={"X-Customer-Id": customer_id, "X-Request-Id": "req-001"},
        json={"prompt": "summarize this research dataset"},
    )
    assert denied.status_code == 402
    assert denied.json()["payment_protocol"] == "x402"
    assert denied.json()["settlement_rail"] == "solana_usdc"
    challenge = decode_header(denied.headers[main.PAYMENT_REQUIRED_HEADER])
    assert challenge["x402Version"] == 2
    assert challenge["accepts"][0]["asset"] == main.SOLANA_USDC_MINT

    session_id = denied.json()["payment_session"]["id"]
    confirmed = client.post(
        "/demo/confirm",
        json={"external_customer_id": customer_id, "payment_session_id": session_id},
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["usage"]["remaining"] == 1

    allowed = client.post(
        "/ai/pro",
        headers={"X-Customer-Id": customer_id, "X-Request-Id": "req-001"},
        json={"prompt": "summarize this research dataset"},
    )
    assert allowed.status_code == 200
    assert allowed.json()["consumption"]["consumed"] is True
    assert allowed.json()["consumption"]["usage"]["remaining"] == 0


def test_request_id_is_retry_safe_but_a_fresh_request_needs_payment():
    reset_demo_state()
    client = TestClient(main.app)
    customer_id = "cust_retry"
    headers = {"X-Customer-Id": customer_id, "X-Request-Id": "req-002"}

    denied = client.post("/ai/pro", headers=headers, json={"prompt": "first"})
    client.post(
        "/demo/confirm",
        json={
            "external_customer_id": customer_id,
            "payment_session_id": denied.json()["payment_session"]["id"],
        },
    )
    assert client.post("/ai/pro", headers=headers, json={"prompt": "first"}).status_code == 200
    assert client.post("/ai/pro", headers=headers, json={"prompt": "retry"}).status_code == 200

    fresh = client.post(
        "/ai/pro",
        headers={"X-Customer-Id": customer_id, "X-Request-Id": "req-003"},
        json={"prompt": "second billable request"},
    )
    assert fresh.status_code == 402


def test_confirmation_is_bound_to_customer_and_session():
    reset_demo_state()
    client = TestClient(main.app)
    denied = client.post(
        "/ai/pro",
        headers={"X-Customer-Id": "cust-a", "X-Request-Id": "req-004"},
        json={"prompt": "test"},
    )
    response = client.post(
        "/demo/confirm",
        json={
            "external_customer_id": "cust-b",
            "payment_session_id": denied.json()["payment_session"]["id"],
        },
    )
    assert response.status_code == 404


def test_headers_are_required_for_metered_identity_and_idempotency():
    reset_demo_state()
    client = TestClient(main.app)
    response = client.post("/ai/pro", json={"prompt": "test"})
    assert response.status_code == 422


def test_settled_payment_never_receives_a_second_payment_challenge(monkeypatch):
    reset_demo_state()
    main.HILT_DEMO_MODE = "live"

    async def settled(_payment_signature: str, _request_id: str):
        return "ps_settled", "encoded-payment-response"

    async def unavailable(_external_customer_id: str, _request_id: str):
        return None

    async def must_not_create(*_args, **_kwargs):
        raise AssertionError("must not create another payment session after settlement")

    monkeypatch.setattr(main, "settle_x402", settled)
    monkeypatch.setattr(main, "consume_entitlement", unavailable)
    monkeypatch.setattr(main, "create_payment_session", must_not_create)

    response = TestClient(main.app).post(
        "/ai/pro",
        headers={
            "X-Customer-Id": "cust-settled",
            "X-Request-Id": "req-settled",
            main.PAYMENT_SIGNATURE_HEADER: "encoded-payment-signature",
        },
        json={"prompt": "retry-safe billable work"},
    )

    assert response.status_code == 503
    assert response.json()["error"] == "usage_activation_pending"
    assert response.headers["Retry-After"] == "1"
    assert response.headers[main.PAYMENT_RESPONSE_HEADER] == "encoded-payment-response"
    assert main.PAYMENT_REQUIRED_HEADER not in response.headers
