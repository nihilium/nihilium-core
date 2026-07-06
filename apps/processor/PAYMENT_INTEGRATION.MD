Processor Token — Integration Guide
How it works
When a developer calls your processor, they include a short-lived JWT signed by the Nihilium backend. Your processor fetches the backend's public key once (cached), verifies the signature, and checks the claims. No database call to Nihilium is required per request.

1. Fetch the public key
Endpoint: GET /.well-known/jwks.json


GET https://<your-nihilium-host>/.well-known/jwks.json
Returns a standard JWKS document. Cache it for up to 1 hour (the response includes Cache-Control: public, max-age=3600).

Example response:


{
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "x": "<base64url-encoded-public-key>",
      "kid": "<key-id>",
      "alg": "EdDSA",
      "use": "sig"
    }
  ]
}
2. Token delivery
The developer passes the token in the standard Authorization header:


Authorization: Bearer <token>
3. JWT structure
Algorithm: EdDSA (Ed25519)

Header:


{ "alg": "EdDSA", "kid": "<key-id>" }
Payload:

Claim	Type	Description
sub	string (UUID)	Processor ID this token was issued for
request_id	string (UUID)	Unique ID for this request — use for idempotency / deduplication
type	"processor_token"	Fixed value — reject tokens of any other type
amount_charged	string	Credits charged to the caller in USD, e.g. "0.001000"
iss	string	Issuer — your configured JWT_ISSUER value
iat	number	Issued-at (Unix timestamp)
exp	number	Expires-at — 24 hours after issuance
4. Verification steps
Your processor must check all of the following:

Signature valid — verify against the Ed25519 public key from JWKS
alg is EdDSA — reject anything else
exp has not passed — token is valid for 24 hours
iss matches your expected issuer
sub matches your own processor ID — prevents tokens issued for other processors from being replayed against yours
type is "processor_token" — prevents other JWT types from being accepted
request_id not seen before — deduplicate within the token's validity window to prevent replay attacks
5. Code example (Node.js / jose)

import { createRemoteJWKSet, jwtVerify } from 'jose'

const JWKS = createRemoteJWKSet(
  new URL('https://<nihilium-host>/.well-known/jwks.json')
)
const MY_PROCESSOR_ID = '<your-processor-uuid>'
const ISSUER = 'https://<nihilium-host>'

async function verifyProcessorToken(authHeader: string) {
  const token = authHeader.replace(/^Bearer\s+/i, '')

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: ISSUER,
    algorithms: ['EdDSA'],
  })

  if (payload['type'] !== 'processor_token') {
    throw new Error('Invalid token type')
  }
  if (payload['sub'] !== MY_PROCESSOR_ID) {
    throw new Error('Token not issued for this processor')
  }

  return {
    requestId: payload['request_id'] as string,
    amountCharged: payload['amount_charged'] as string,
  }
}
6. Code example (Python / PyJWT + cryptography)

import jwt
from jwt import PyJWKClient

jwks_client = PyJWKClient("https://<nihilium-host>/.well-known/jwks.json")

def verify_processor_token(auth_header: str, my_processor_id: str) -> dict:
    token = auth_header.removeprefix("Bearer ")
    signing_key = jwks_client.get_signing_key_from_jwt(token)

    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=["EdDSA"],
        issuer="https://<nihilium-host>",
    )

    if payload.get("type") != "processor_token":
        raise ValueError("Invalid token type")
    if payload.get("sub") != my_processor_id:
        raise ValueError("Token not issued for this processor")

    return payload