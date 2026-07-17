import { constructWebhookEvent, createWebhookRouter } from "@hiltpay/sdk";

export const runtime = "nodejs";

const globalWebhookState = globalThis as typeof globalThis & {
  __hiltGrokBuildWebhookEvents?: Set<string>;
};

const processedEvents =
  globalWebhookState.__hiltGrokBuildWebhookEvents ||
  (globalWebhookState.__hiltGrokBuildWebhookEvents = new Set<string>());

const router = createWebhookRouter().on("*", async (event) => {
  if (processedEvents.has(event.id)) {
    return;
  }

  // Replace this with a durable idempotent job before deploying your own app.
  processedEvents.add(event.id);
  console.info("Accepted Hilt webhook", { id: event.id, type: event.type, livemode: event.livemode });
});

export async function POST(request: Request) {
  const signingSecret = process.env.HILT_WEBHOOK_SECRET?.trim();
  if (!signingSecret) {
    return Response.json({ error: "webhook_not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  try {
    const event = await constructWebhookEvent(
      rawBody,
      request.headers.get("X-Hilt-Signature"),
      signingSecret,
    );
    await router.dispatch(event);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "invalid_webhook" }, { status: 400 });
  }
}
