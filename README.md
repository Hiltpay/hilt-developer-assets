# Hilt developer assets

Public source repository for Hilt's developer-facing machine-readable assets.

This repo is intended to mirror the assets technical teams expect to find in public:

- OpenAPI snapshots
- Postman collection
- Postman environment
- Agent Discovery Standard manifest and prompt suite
- example webhook payloads
- Hilt Pay API agent setup and owner approval examples
- runnable Grok Build and Next.js protected-resource example
- runnable agent micropayment example with x402 V2 and atomic usage consumption
- runnable FastAPI metered-request example

## Canonical live surfaces

These GitHub files are public mirrors for trust and discoverability. The canonical live Hilt surfaces are still:

- OpenAPI: `https://api.hilt.so/v1/openapi.json`
- Agent manifest: `https://www.hilt.so/.well-known/hilt-agent.json`
- Agent Discovery Standard: `https://www.hilt.so/agent-discovery-standard`
- Swagger UI: `https://api.hilt.so/v1/docs`
- Redoc: `https://api.hilt.so/v1/redoc`
- Docs: `https://docs.hilt.so/developers`
- Grok Build guide: `https://docs.hilt.so/developers/grok-build`
- Agent micropayments guide: `https://docs.hilt.so/developers/agent-micropayments`

## Repo layout

- `openapi/hilt-openapi-v1.json`
- `agent-discovery/hilt-agent.json`
- `agent-discovery/HILT_AGENT_DISCOVERY_STANDARD_2026-06-01.md`
- `agent-discovery/HILT_AGENT_DISCOVERY_PROMPT_SUITE_2026-06-01.csv`
- `postman/hilt-postman-collection.json`
- `postman/hilt-postman-environment.json`
- `examples/webhooks/*.json`
- `examples/grok-build-nextjs`
- `examples/agent-micropayments`
- `examples/hilt-access-fastapi`

The Postman collection includes agent-first setup plus the x402 V2 payment-session, settlement, atomic-consumption, and durable-entitlement routes.

## What belongs here

Use this repo for public developer assets that should be easy to inspect and download without requiring access to the platform source code.

Good examples:

- versioned OpenAPI snapshots
- Postman imports
- example webhook payloads
- example webhook receivers
- runnable Hilt Pay API examples with tests and agent instructions

Product implementation source remains separate from these public integration assets.
