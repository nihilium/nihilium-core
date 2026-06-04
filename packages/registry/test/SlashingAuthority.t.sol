// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import {Test} from "forge-std/Test.sol";
import {ChainedProofV2, ProvingStateV2} from "@nihilium/core/contracts/ChainedProofV2.sol";
import {IVerifier} from "@nihilium/core/contracts/Interfaces.sol";
import {ProcessorRegistry} from "../contracts/src/ProcessorRegistry.sol";
import {ConditionVerifierRegistry} from "../contracts/src/ConditionVerifierRegistry.sol";
import {SlashingAuthority} from "../contracts/src/SlashingAuthority.sol";
import {SlashingChallengeStatus, SlashingType} from "../contracts/src/Interfaces.sol";

contract MockVerifier is IVerifier {
    function verify(bytes calldata, bytes32[] calldata) external pure returns (bool) {
        return true;
    }
}

contract SlashingAuthorityHarness is SlashingAuthority {
    constructor(
        address chainedProofV2,
        address openingProof,
        address conditionVerifierRegistry,
        uint256 challengeWindowSeconds
    )
        SlashingAuthority(chainedProofV2, openingProof, conditionVerifierRegistry, challengeWindowSeconds)
    {}

    function seedChallenge(
        bytes32 challengeId,
        address challenger,
        address defendant,
        bytes32 keyId,
        bytes32 expectedUnsealRoot
    ) external {
        ProvingStateV2 memory initialState;
        initialState.current_hash = bytes32(0);
        initialState.current_index = 0;
        initialState.outputs = new bytes32[](0);
        initialState.prepared_public_inputs = new bytes32[](0);
        initialState.prepared_proof = "";
        initialState.verifier_must_be_true = false;
        initialState.proof_verifier = address(0);
        initialState.initiator = address(0);

        bytes32 stateHash = chainedProofV2.hashProvingState(initialState);

        challenges[challengeId] = ConditionCheckChallenge({
            status: SlashingChallengeStatus.CHALLENGED,
            timeout_timestamp: block.timestamp + challengeWindowSeconds,
            challenger: challenger,
            defendant: defendant,
            keyId: keyId,
            expectedUnsealRoot: expectedUnsealRoot,
            provingState: initialState,
            stateHash: stateHash,
            deadline: block.timestamp + challengeWindowSeconds
        });
    }
}

contract SlashingAuthorityTest is Test {
    uint256 private constant SNARK_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    ChainedProofV2 internal chainedProof;
    MockVerifier internal mockVerifier;
    ProcessorRegistry internal processorRegistry;
    ConditionVerifierRegistry internal conditionRegistry;
    SlashingAuthorityHarness internal authority;

    address internal committee = makeAddr("committee");
    address internal challenger = makeAddr("challenger");
    address internal processor = makeAddr("processor");

    bytes32 internal challengeId = keccak256("test-challenge");
    bytes32 internal keyId;

    function setUp() public {
        mockVerifier = new MockVerifier();
        chainedProof = new ChainedProofV2(address(mockVerifier), address(mockVerifier));
        processorRegistry =
            new ProcessorRegistry(committee, committee, address(0xdead));
        conditionRegistry = new ConditionVerifierRegistry(committee);

        authority = new SlashingAuthorityHarness(
            address(chainedProof),
            address(mockVerifier),
            address(conditionRegistry),
            7 days
        );

        vm.prank(committee);
        conditionRegistry.register(address(mockVerifier), "mock");

        vm.prank(processor);
        processorRegistry.register(100, "p", "d", "http://x", "");

        keyId = keccak256(abi.encodePacked(uint256(12345), uint256(67890)));
    }

    function test_unsupportedSlashingTypeReverts() public {
        vm.expectRevert("SlashingAuthority: unsupported slashing type");
        authority.startSlashingChallenge(
            SlashingType.DLEQ_LEAK, block.timestamp + 1 days, processor, hex"", new bytes32[](11)
        );
    }

    function test_progressPrepareAndChainProofVerify() public {
        ProvingStateV2 memory emptyState = _emptyState();

        bytes32[] memory zkInputs = new bytes32[](1);
        zkInputs[0] = bytes32(uint256(99));

        ProvingStateV2 memory afterPrepare =
            chainedProof._dryrun_prepare_next_proof(emptyState, address(mockVerifier), true, zkInputs, hex"");
        uint256 mask = (uint256(1) << 1) - 1;
        ProvingStateV2 memory afterVerify =
            chainedProof._dryrun_chain_proof_verify(afterPrepare, mask, false);

        bytes32 expectedRoot = bytes32(uint256(afterVerify.current_hash) % SNARK_FIELD);

        authority.seedChallenge(challengeId, challenger, processor, keyId, expectedRoot);

        bytes32[] memory prepareParams = new bytes32[](2 + zkInputs.length);
        prepareParams[0] = bytes32(uint256(uint160(address(mockVerifier))));
        prepareParams[1] = bytes32(uint256(1));
        for (uint256 i = 0; i < zkInputs.length; i++) {
            prepareParams[2 + i] = zkInputs[i];
        }

        vm.prank(processor);
        authority.progressConditionCheckChallenge(
            challengeId, emptyState, "prepare_next_proof", hex"", prepareParams
        );

        (ProvingStateV2 memory midState, bytes32 midHash) = authority.getChallengeProgress(challengeId);

        bytes32[] memory verifyParams = new bytes32[](1);
        verifyParams[0] = bytes32(mask);

        vm.prank(processor);
        authority.progressConditionCheckChallenge(
            challengeId, midState, "chain_proof_verify", hex"", verifyParams
        );

        assertEq(
            uint256(authority.getChallengeStatus(challengeId)),
            uint256(SlashingChallengeStatus.CHALLENGED_AND_PROVED)
        );
        assertEq(midHash, chainedProof.hashProvingState(midState));
    }

    function _emptyState() internal pure returns (ProvingStateV2 memory s) {
        s.current_hash = bytes32(0);
        s.current_index = 0;
        s.outputs = new bytes32[](0);
        s.prepared_public_inputs = new bytes32[](0);
        s.prepared_proof = "";
        s.verifier_must_be_true = false;
        s.proof_verifier = address(0);
        s.initiator = address(0);
    }
}
