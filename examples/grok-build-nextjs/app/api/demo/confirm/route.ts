import { createHiltAccessGateway } from "@/lib/hilt-access";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { external_customer_id?: string; payment_session_id?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.external_customer_id?.trim() || !body.payment_session_id?.trim()) {
    return Response.json({ error: "session_and_customer_required" }, { status: 400 });
  }

  try {
    const gateway = createHiltAccessGateway();
    const entitlement = await gateway.confirmDevelopmentSession({
      externalCustomerId: body.external_customer_id.trim(),
      paymentSessionId: body.payment_session_id.trim(),
    });
    return Response.json({
      ok: true,
      mode: gateway.config.mode,
      entitlement,
      notice:
        gateway.config.mode === "local"
          ? "Local confirmation completed. No payment, receipt, or on-chain settlement occurred."
          : "Hilt sandbox confirmation completed. No live money or receipt was created.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Development confirmation failed.";
    return Response.json(
      { error: "development_confirmation_failed", message },
      { status: message.includes("unavailable in live mode") ? 409 : 400 },
    );
  }
}
