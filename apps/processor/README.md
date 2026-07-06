# Processor Web Service

A TypeScript-based web service for processing seal/unseal requests with durable quorum evidence storage.

## Features

- Express.js web server
- TypeScript support
- CORS enabled
- Quorum evidence store (W-of-N backend acks before slashable HTTP responses)
- Environment variable configuration

## Installation

```bash
cd apps/processor
npm install
```

## Development

```bash
npm run dev
npm run build
npm start
npm run test:build
```

## API Endpoints

- `GET /health` - Health check (includes evidence backend probe status)
- `GET /status` - API status
- `GET /get_public_keys` - Processor public keys
- `GET /identity` - Processor identity
- `POST /request_seal` - Seal (evidence persisted before 200)
- `POST /request_unseal` - Unseal (evidence persisted before 200)

## Evidence quorum store

Seal and unseal responses are **slashable**. The service persists each request/response to **N** configured backends and returns **200 only after at least W backends ack** durably (e.g. `3/3` or `3/5`). If quorum is not met, the client receives **503** and no success body.

| Mode | `EVIDENCE_QUORUM` | `EVIDENCE_BACKENDS` |
|------|-------------------|---------------------|
| Local dev (default) | `1/1` (unset) | unset → `data/evidence` |
| Single host 3/3 | `3/3` | 3 local paths |
| Multi-backend 3/5 | `3/5` | 5 backends (local and/or S3) |

### Environment variables

```
# W-of-N (required acks / total backends)
EVIDENCE_QUORUM=3/5

# JSON array; length must equal N
EVIDENCE_BACKENDS=[
  {"type":"local","path":"/data/e0","id":"e0"},
  {"type":"local","path":"/data/e1","id":"e1"},
  {"type":"s3","bucket":"my-bucket","region":"eu-west-1","prefix":"evidence/","id":"s3-eu"},
  {"type":"s3","bucket":"other","region":"us-east-1","endpoint":"https://...","id":"s3-us"},
  {"type":"local","path":"/data/e4","id":"e4"}
]

# Optional AES-256-GCM encryption at rest (64 hex chars = 32 bytes)
EVIDENCE_ENCRYPTION_KEY=

# If true, /health returns 503 when fewer than W backends are probe-healthy
EVIDENCE_HEALTH_STRICT=false
```

S3 backends use standard AWS credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, etc.).

**Local vs Docker paths:** Use relative paths such as `data/e0` when running from `apps/processor` on your machine. Use absolute `/data/e0` only inside Docker (see `.env.example`). Paths starting with `/data` on the host require root and will fail with `EACCES`.

### Stored payload

Each record contains: `id` (SHA-256 of canonical JSON), `op`, `at`, `request`, `response`, `meta` (chain id, public keys, unseal root hash when present). Local backends use atomic write + `fsync` + rename under `records/`.

**Limitation:** Witness data inside `@nihilium/core` (e.g. seal circuit secrets) is not persisted unless core is extended later. Unseal requests already include full proof bundles in the HTTP body.

### Failure behavior

- Quorum not met → `503` with `{ error: "evidence_quorum_not_met", acked, required, total, failures }`
- Do not treat a failed persist as success; the processor must not return slashable output without durable evidence.

## Processor registration

Registering the processor is a separate process; use the registry-manager project.

## Core environment variables

```
PORT=3006
NODE_ENV=development
RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
CHAIN_ID=43113
CHAINED_PROOF_CONTRACT_ADDRESS=0x...
OPENING_PROOF_ADDRESS=0x...
PRIVATE_KEY=0x...
PRIVATE_KEY_HE=0x...
```

## Docker

See `docker/docker-compose.processor.yml` for a `3/3` example with volume `processor_evidence` mounted at `/data`.
