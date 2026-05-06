# Hilt developer assets

Public source repository for Hilt's developer-facing machine-readable assets.

This repo is intended to mirror the assets technical teams expect to find in public:

- OpenAPI snapshots
- Postman collection
- Postman environment
- example webhook payloads

## Canonical live surfaces

These GitHub files are public mirrors for trust and discoverability. The canonical live Hilt surfaces are still:

- OpenAPI: `https://api.hilt.so/v1/openapi.json`
- Swagger UI: `https://api.hilt.so/v1/docs`
- Redoc: `https://api.hilt.so/v1/redoc`
- Docs: `https://docs.hilt.so/developers`

## Repo layout

- `openapi/hilt-openapi-v1.json`
- `postman/hilt-postman-collection.json`
- `postman/hilt-postman-environment.json`
- `examples/webhooks/*.json`

## What belongs here

Use this repo for public developer assets that should be easy to inspect and download without exposing the private SaaS codebase.

Good examples:

- versioned OpenAPI snapshots
- Postman imports
- example webhook payloads
- example receiver scaffolds

Keep the private product implementation in the main Hilt platform repository.
