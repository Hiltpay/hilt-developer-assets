"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

interface RuntimeStatus {
  development_confirmation_available: boolean;
  mode: "local" | "sandbox" | "live";
  payment_protocol: "x402";
  product: string;
  settlement_rail: "solana_usdc";
}

interface ApiResult {
  body: Record<string, unknown>;
  status: number;
}

function paymentSessionId(result: ApiResult | null): string | null {
  const value = result?.body.payment_session;
  if (!value || typeof value !== "object") {
    return null;
  }
  const id = (value as Record<string, unknown>).id;
  return typeof id === "string" ? id : null;
}

export default function Home() {
  const [customerId, setCustomerId] = useState("grok-builder-001");
  const [prompt, setPrompt] = useState("Summarise the latest payment-to-access signals");
  const [status, setStatus] = useState<RuntimeStatus | null>(null);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [confirmResult, setConfirmResult] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [attemptId, setAttemptId] = useState("");

  useEffect(() => {
    setAttemptId(window.crypto.randomUUID());
    fetch("/api/status")
      .then((response) => response.json())
      .then((body) => setStatus(body as RuntimeStatus))
      .catch(() => setStatus(null));
  }, []);

  const sessionId = useMemo(() => paymentSessionId(result), [result]);
  const accessGranted = result?.status === 200;

  async function requestReport(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setConfirmResult(null);
    try {
      const response = await fetch("/api/protected-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Customer-Id": customerId,
          "X-Request-Id": attemptId,
        },
        body: JSON.stringify({ attempt_id: attemptId, prompt }),
      });
      setResult({ status: response.status, body: (await response.json()) as Record<string, unknown> });
    } finally {
      setBusy(false);
    }
  }

  async function confirmDevelopmentSession() {
    if (!sessionId) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/demo/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ external_customer_id: customerId, payment_session_id: sessionId }),
      });
      setConfirmResult((await response.json()) as Record<string, unknown>);
    } finally {
      setBusy(false);
    }
  }

  function startAgain() {
    setResult(null);
    setConfirmResult(null);
    setAttemptId(window.crypto.randomUUID());
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="https://www.hilt.so" target="_blank" rel="noreferrer">
          HILT
        </a>
        <div className="runtime" aria-label="Current runtime configuration">
          <span>{status?.mode || "loading"}</span>
          <span>{status?.payment_protocol || "x402"}</span>
          <span>{status?.settlement_rail || "solana_usdc"}</span>
        </div>
      </header>

      <section className="intro">
        <p className="eyebrow">Runnable developer example</p>
        <h1>Protect an API route with Hilt Pay API.</h1>
        <p>
          Request the report below. The server atomically consumes one usage unit, returns HTTP 402 when payment is
          required, and serves the response only after settlement and consumption succeed.
        </p>
      </section>

      <div className="workspace">
        <form className="panel request-panel" onSubmit={requestReport}>
          <div className="panel-heading">
            <div>
              <p className="step">Request</p>
              <h2>Protected report</h2>
            </div>
            <span className="endpoint">POST /api/protected-report</span>
          </div>

          <label>
            Customer id
            <input value={customerId} onChange={(event) => setCustomerId(event.target.value)} autoComplete="off" />
          </label>

          <label>
            Prompt
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={4} />
          </label>

          <button className="primary" disabled={busy || !attemptId} type="submit">
            {busy ? "Working..." : "Request protected report"}
          </button>

          <dl className="contract">
            <div>
              <dt>Product</dt>
              <dd>{status?.product || "loading"}</dd>
            </div>
            <div>
              <dt>Protocol</dt>
              <dd>x402</dd>
            </div>
            <div>
              <dt>Settlement</dt>
              <dd>Solana USDC</dd>
            </div>
          </dl>
        </form>

        <section className="panel response-panel" aria-live="polite">
          <div className="panel-heading">
            <div>
              <p className="step">Response</p>
              <h2>{result ? `HTTP ${result.status}` : "Waiting for request"}</h2>
            </div>
            {result && <span className={accessGranted ? "state success" : "state payment"}>{accessGranted ? "Access granted" : "Payment required"}</span>}
          </div>

          {!result && <p className="empty">The usage and payment-session response will appear here.</p>}

          {result && <pre>{JSON.stringify(result.body, null, 2)}</pre>}

          {result?.status === 402 && status?.development_confirmation_available && sessionId && (
            <div className="actions">
              <button className="secondary" disabled={busy} onClick={confirmDevelopmentSession} type="button">
                {status.mode === "local" ? "Confirm local simulation" : "Confirm Hilt sandbox session"}
              </button>
              {confirmResult && (
                <button className="primary" disabled={busy} onClick={() => requestReport()} type="button">
                  Retry protected report
                </button>
              )}
            </div>
          )}

          {confirmResult && (
            <div className="confirmation">
              <strong>Development confirmation</strong>
              <pre>{JSON.stringify(confirmResult, null, 2)}</pre>
            </div>
          )}

          {result && (
            <button className="text-button" onClick={startAgain} type="button">
              Start a fresh attempt
            </button>
          )}
        </section>
      </div>

      <footer>
        <span>Hilt Pay API example for Grok Build</span>
        <a href="https://docs.hilt.so/developers/grok-build" target="_blank" rel="noreferrer">
          Integration guide
        </a>
      </footer>
    </main>
  );
}
