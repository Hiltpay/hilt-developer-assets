import { HiltClient, protectEndpoint } from "@hiltpay/sdk";

const hilt = new HiltClient({
  apiKey: process.env.HILT_API_KEY,
});
export const protectAgentRequest = protectEndpoint({
  client: hilt,
  externalProductId:
    process.env.HILT_EXTERNAL_PRODUCT_ID ?? "agent-research-call",
  resourceDescription: "One agent research request",
  handler: async (_request, { customerId, usage }) => {
    return Response.json({
      ok: true,
      customer_id: customerId,
      units_remaining: usage.usage.remaining,
      result: "Paid agent work belongs here.",
    });
  },
});
