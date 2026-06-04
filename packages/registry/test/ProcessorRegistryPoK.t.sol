// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";
import {ProcessorRegistry} from "../contracts/src/ProcessorRegistry.sol";
import {BabyJubJubHarness} from "./BabyJubJubHarness.sol";

/// @notice End-to-end PoK tests: TypeScript (@nihilium/zkp-circuits + babyjubjub.ts)
///         builds proofs; ProcessorRegistry verifies them on-chain.
/// @dev Requires `forge test --ffi` (calls test/helpers/generateAddKeyArgs.ts).
contract ProcessorRegistryPoKTest is Test {
    ProcessorRegistry internal registry;
    BabyJubJubHarness internal harness;
    address internal processor;

    uint256 internal constant CHAIN_ID = 31_337;

    // Same material as apps/registry-manager & apps/processor .env examples
    string internal constant SIGNING_SK =
        "0x00c02c2c80ec46a6cbc5ccce6b0ce9e293c46a568cd2ffdfb69315efd7dafa36";
    string internal constant SIGNING_SK_NO_LEADING_ZERO =
        "0xc02c2c80ec46a6cbc5ccce6b0ce9e293c46a568cd2ffdfb69315efd7dafa36";
    string internal constant HE_SK = "0xFFFFF36080AB5C51FBE1557D72EFF5";

    function setUp() public {
        vm.chainId(CHAIN_ID);
        processor = makeAddr("processor");
        registry = new ProcessorRegistry(makeAddr("committee"), makeAddr("rewards"), makeAddr("slash"));
        harness = new BabyJubJubHarness();

        vm.prank(processor);
        registry.register(100, "test", "proc", "http://localhost", "");
    }

    // -------------------------------------------------------------------------
    // Signing keys
    // -------------------------------------------------------------------------

    function test_signing_addKey_withLeadingZeroHex() public {
        _addKeyViaTs(SIGNING_SK, 1, false);
    }

    function test_signing_addKey_canonicalHexWithoutLeadingZero() public {
        _addKeyViaTs(SIGNING_SK_NO_LEADING_ZERO, 1, false);
    }

    function test_signing_keyMaterial_isCanonicalInteger() public {
        AddKeyArgs memory args = _loadArgs(SIGNING_SK, 1, false);
        AddKeyArgs memory argsCanon = _loadArgs(SIGNING_SK_NO_LEADING_ZERO, 1, false);

        assertEq(args.keyMaterial, argsCanon.keyMaterial, "keyMaterial must ignore leading zero nybbles");
        assertEq(args.keyX, argsCanon.keyX, "EdDSA pk must match for same integer secret");
        assertEq(args.keyY, argsCanon.keyY);
    }

    function test_signing_challenge_matchesHarness() public {
        AddKeyArgs memory args = _loadArgs(SIGNING_SK, 1, false);

        uint256 onChain = harness.signingChallenge(
            processor, args.keyX, args.keyY, 1, args.keyMaterial, address(registry), CHAIN_ID
        );

        assertTrue(
            harness.verifySchnorr(args.keyX, args.keyY, args.proofRx, args.proofRy, args.proofS, onChain),
            "TS proof must verify with harness challenge"
        );
    }

    function test_signing_legacyChallenge_revertsOnAddKey() public {
        vm.expectRevert("ProcessorRegistry: invalid key PoK");
        _addKeyViaTs(SIGNING_SK, 1, true);
    }

    function test_signing_wrongKeyMaterial_revertsOnAddKey() public {
        AddKeyArgs memory args = _loadArgs(SIGNING_SK, 1, false);

        vm.expectRevert("ProcessorRegistry: invalid key PoK");
        vm.prank(processor);
        registry.addKey(
            args.keyX,
            args.keyY,
            ProcessorRegistry.KeyType.Signing,
            args.proofRx,
            args.proofRy,
            args.proofS,
            args.keyMaterial + 1
        );
    }

    // -------------------------------------------------------------------------
    // HE keys (Schnorr scalar = formatPrivKeyForBabyJub, pk = genPubKey)
    // -------------------------------------------------------------------------

    function test_he_addKey_succeeds() public {
        _addKeyViaTs(HE_SK, 0, false);
    }

    // -------------------------------------------------------------------------
    // FFI helpers
    // -------------------------------------------------------------------------

    struct AddKeyArgs {
        uint256 keyX;
        uint256 keyY;
        uint256 keyType;
        uint256 proofRx;
        uint256 proofRy;
        uint256 proofS;
        uint256 keyMaterial;
    }

    function _loadArgs(string memory hexKey, uint256 keyType, bool legacy)
        internal
        returns (AddKeyArgs memory args)
    {
        string memory outPath = _ffiOutPath(hexKey, keyType, legacy);
        _ffiGenerate(hexKey, keyType, legacy, outPath);
        bytes memory raw = vm.readFileBinary(outPath);
        (args.keyX, args.keyY, args.keyType, args.proofRx, args.proofRy, args.proofS, args.keyMaterial) =
            abi.decode(raw, (uint256, uint256, uint256, uint256, uint256, uint256, uint256));
    }

    function _addKeyViaTs(string memory hexKey, uint256 keyType, bool legacy) internal {
        AddKeyArgs memory args = _loadArgs(hexKey, keyType, legacy);

        vm.prank(processor);
        if (keyType == 0) {
            registry.addKey(
                args.keyX,
                args.keyY,
                ProcessorRegistry.KeyType.HE,
                args.proofRx,
                args.proofRy,
                args.proofS,
                0
            );
        } else {
            registry.addKey(
                args.keyX,
                args.keyY,
                ProcessorRegistry.KeyType.Signing,
                args.proofRx,
                args.proofRy,
                args.proofS,
                args.keyMaterial
            );
        }
    }

    /// @dev Unique path per (hexKey, keyType, legacy) so parallel `forge test` runs do not clobber FFI output.
    function _ffiOutPath(string memory hexKey, uint256 keyType, bool legacy)
        internal
        view
        returns (string memory)
    {
        bytes32 tag = keccak256(abi.encodePacked(hexKey, keyType, legacy));
        return string.concat(vm.projectRoot(), "/cache_forge/addkey_", vm.toString(uint256(tag)), ".bin");
    }

    function _ffiGenerate(string memory hexKey, uint256 keyType, bool legacy, string memory outPath) internal {
        uint256 argc = legacy ? 12 : 11;
        string[] memory inputs = new string[](argc);
        inputs[0] = "npx";
        inputs[1] = "ts-node";
        inputs[2] = "--project";
        inputs[3] = string.concat(vm.projectRoot(), "/test/tsconfig.json");
        inputs[4] = string.concat(vm.projectRoot(), "/test/helpers/generateAddKeyArgs.ts");
        inputs[5] = hexKey;
        inputs[6] = vm.toString(keyType);
        inputs[7] = vm.toString(processor);
        inputs[8] = vm.toString(address(registry));
        inputs[9] = vm.toString(CHAIN_ID);
        inputs[10] = outPath;
        if (legacy) {
            inputs[11] = "legacy";
        }
        vm.ffi(inputs);
    }
}
