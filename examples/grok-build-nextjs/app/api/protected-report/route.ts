import { createHiltAccessGateway } from "@/lib/hilt-access";
import { handleProtectedFlow } from "@/lib/protected-flow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { attempt_id?: string; prompt?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await handleProtectedFlow(createHiltAccessGateway(), {
      attemptId: body.attempt_id,
      customerId: request.headers.get("X-Customer-Id") || undefined,
      prompt: body.prompt,
      resourceUrl: request.url,
    });
    return Response.json(result.body, {
      status: result.status,
      headers: result.status === 402 ? { "Cache-Control": "no-store" } : undefined,
    });
  } catch (error) {
    return Response.json(
      {
        error: "hilt_request_failed",
        message: error instanceof Error ? error.message : "Hilt request failed.",
      },
      { status: 502 },
    );
  }
}
