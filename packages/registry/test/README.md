# Registry Forge tests

End-to-end Schnorr proof-of-knowledge tests for `ProcessorRegistry.addKey`.

## Run

```bash
cd packages/registry
npm run test:forge:signing
# or
forge test --ffi --match-contract ProcessorRegistryPoKTest -vvv
```

Requires `npx` + `ts-node` (uses the same `@nihilium/zkp-circuits` and `src/babyjubjub.ts` helpers as `ProcessorClient`).

## What is covered

| Test | Meaning |
|------|---------|
| `test_signing_addKey_withLeadingZeroHex` | `0x00c0…` env secret registers successfully |
| `test_signing_addKey_canonicalHexWithoutLeadingZero` | `0xc0…` (same integer) registers with identical pubkey |
| `test_signing_keyMaterial_isCanonicalInteger` | `keyMaterial` matches for both hex forms |
| `test_signing_challenge_matchesHarness` | TS proof verifies against on-chain challenge |
| `test_signing_legacyChallenge_revertsOnAddKey` | Old challenge (no `keyMaterial`) fails |
| `test_signing_wrongKeyMaterial_revertsOnAddKey` | Wrong `keyMaterial` fails |
| `test_he_addKey_succeeds` | HE PoK uses `formatPrivKeyForBabyJub` scalar matching `genPubKey` |

## FFI helper

`test/helpers/generateAddKeyArgs.ts` writes ABI-encoded `addKey` arguments to per-test files under `cache_forge/` (see `foundry.toml` `fs_permissions`).

## Debug live `addKey` failures

If Forge tests pass but `registry-manager` reverts with `invalid key PoK`, the proof math is fine — check **context**:

| Field | Must match on-chain |
|-------|---------------------|
| `msg.sender` | Processor ETH address (`PROCESSOR_PRIVATE_KEY`) |
| `address(this)` | `PROCESSOR_REGISTRY_ADDRESS` in `.env` |
| `block.chainid` | `CHAIN_ID` (e.g. `43113` on Fuji) |

Print the exact values used off-chain:

```bash
npm run debug:pok -- 0xYOUR_SIGNING_KEY 1 0xPROCESSOR_ETH 0xREGISTRY 43113
```

## PoK challenge (Signing)

```
challenge = keccak256(abi.encodePacked(
  msg.sender, keyX, keyY, uint256(1), keyMaterial, address(this), block.chainid
)) % ORDER
```

`keyMaterial = uint256(hexSecret)` (leading zero nybbles in hex are ignored).

PoK scalar: EdDSA `deriveSecretScalar(hexToSkBuffer(hex))` where `hexToSkBuffer` uses canonical `BigInt(hex)`.

## HE keys

Schnorr scalar is `formatPrivKeyForBabyJub(BigInt(hex))` (same effective scalar as `genPubKey`), not raw `BigInt(hex)`.
