import { readHiltExampleConfig } from "@/lib/hilt-access";

export function GET() {
  const config = readHiltExampleConfig();
  return Response.json({
    ok: true,
    mode: config.mode,
    product: config.productId,
    api_host: new URL(config.apiUrl).host,
    payment_protocol: "x402",
    settlement_rail: "solana_usdc",
    development_confirmation_available: config.mode !== "live",
  });
}
