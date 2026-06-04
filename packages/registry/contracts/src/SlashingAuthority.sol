// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma experimental ABIEncoderV2;

import "@nihilium/core/contracts/ChainedProofV2.sol";
import "@nihilium/core/contracts/proofs/opening_proof.sol";
import "./Interfaces.sol";
import "./ProcessorRegistry.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title SlashingAuthority
/// @notice Condition-check challenges: opening proof + on-chain ChainedProofV2 progression.
///         All pipeline steps delegate to ChainedProofV2._dryrun_* (mirrors ChainedProofV2.ts).
///         Economic slash deferred — see ISlashingAuthority.
contract SlashingAuthority is ISlashingAuthority, ReentrancyGuard {
    string private constant ACTION_PREPARE_NEXT_PROOF = "prepare_next_proof";
    string private constant ACTION_CHAIN_PROOF_VERIFY = "chain_proof_verify";
    string private constant ACTION_STATIC_INPUT = "static_input";
    string private constant ACTION_PASS_SIGNAL = "pass_signal";
    string private constant ACTION_VALIDATE_DATA_ROOT = "validate_data_root";

    uint256 private constant SNARK_FIELD =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;

    uint256 private constant OPENING_PUBLIC_INPUT_COUNT = 11;
    /// @dev NihiliumCore(31,8) public outputs: publicKeyHe_validated at indices 7, 8 (not TS layout 37/38).
    uint256 private constant OPENING_HE_KEY_X_INDEX = 7;
    uint256 private constant OPENING_HE_KEY_Y_INDEX = 8;
    uint256 private constant OPENING_UNSEAL_ROOT_INDEX = 1;

    ChainedProofV2 public chainedProofV2;
    opening_proof public openingProof;
    
    IConditionVerifierRegistry public conditionVerifierRegistry;
    uint256 public challengeWindowSeconds;

    struct ConditionCheckChallenge {
        SlashingChallengeStatus status;
        uint256 timeout_timestamp;
        address challenger;
        address defendant;
        bytes32 keyId;
        bytes32 expectedUnsealRoot;
        ProvingStateV2 provingState;
        bytes32 stateHash;
        uint256 deadline;
    }

    mapping(bytes32 => ConditionCheckChallenge) public challenges;

    event ChallengeStarted(
        bytes32 indexed challengeId,
        address indexed challenger,
        address indexed defendant,
        bytes32 keyId,
        bytes32 expectedUnsealRoot,
        uint256 deadline
    );

    event ChallengeProgressed(bytes32 indexed challengeId, string action, bytes32 newStateHash);

    event ChallengeResolved(bytes32 indexed challengeId, SlashingChallengeStatus status);

    constructor(
        address _chainedProofV2,
        address _openingProof,        
        address _conditionVerifierRegistry,
        uint256 _challengeWindowSeconds
    ) {
        require(_chainedProofV2 != address(0), "SlashingAuthority: zero chainedProofV2");
        require(_openingProof != address(0), "SlashingAuthority: zero openingProof");
        
        require(_conditionVerifierRegistry != address(0), "SlashingAuthority: zero conditionVerifierRegistry");
        require(_challengeWindowSeconds > 0, "SlashingAuthority: zero challenge window");

        chainedProofV2 = ChainedProofV2(_chainedProofV2);
        openingProof = opening_proof(_openingProof);
        
        conditionVerifierRegistry = IConditionVerifierRegistry(_conditionVerifierRegistry);
        challengeWindowSeconds = _challengeWindowSeconds;
    }

    /// @inheritdoc ISlashingAuthority
    function startSlashingChallenge(
        SlashingType slashing_type,
        uint256 timeout_timestamp,
        address defendant,
        bytes calldata opening_proof_bytes,
        bytes32[] calldata opening_proof_public_inputs
    ) external nonReentrant returns (bytes32 challenge_id) {
        require(slashing_type == SlashingType.CONDITION_CHECK, "SlashingAuthority: unsupported slashing type");
        require(opening_proof_public_inputs.length == OPENING_PUBLIC_INPUT_COUNT, "SlashingAuthority: bad opening inputs");
        require(
            openingProof.verify(opening_proof_bytes, opening_proof_public_inputs),
            "SlashingAuthority: opening proof invalid"
        );

        uint256 keyX = uint256(opening_proof_public_inputs[OPENING_HE_KEY_X_INDEX]);
        uint256 keyY = uint256(opening_proof_public_inputs[OPENING_HE_KEY_Y_INDEX]);
        bytes32 keyId = keccak256(abi.encodePacked(keyX, keyY));

        
        

        bytes32 expectedUnsealRoot = opening_proof_public_inputs[OPENING_UNSEAL_ROOT_INDEX];

        ProvingStateV2 memory initialState = _emptyProvingState();
        bytes32 stateHash = chainedProofV2.hashProvingState(initialState);

        challenge_id = keccak256(
            abi.encodePacked(
                msg.sender,
                block.number,
                block.timestamp,
                keyId,
                expectedUnsealRoot,
                opening_proof_bytes
            )
        );
        require(challenges[challenge_id].deadline == 0, "SlashingAuthority: challenge exists");

        uint256 deadline = block.timestamp + challengeWindowSeconds;

        challenges[challenge_id] = ConditionCheckChallenge({
            status: SlashingChallengeStatus.CHALLENGED,
            timeout_timestamp: timeout_timestamp,
            challenger: msg.sender,
            defendant: defendant,
            keyId: keyId,
            expectedUnsealRoot: expectedUnsealRoot,
            provingState: initialState,
            stateHash: stateHash,
            deadline: deadline
        });

        emit ChallengeStarted(challenge_id, msg.sender, defendant, keyId, expectedUnsealRoot, deadline);
    }

    
    function progressConditionCheckChallenge(
        bytes32 challenge_id,
        ProvingStateV2 calldata state,
        string calldata action,
        bytes calldata rawBytes,
        bytes32[] calldata publicInputs
    ) external nonReentrant {
        ConditionCheckChallenge storage c = challenges[challenge_id];
        require(c.deadline != 0, "SlashingAuthority: unknown challenge");
        require(msg.sender == c.defendant, "SlashingAuthority: not defendant");
        require(c.status == SlashingChallengeStatus.CHALLENGED, "SlashingAuthority: not active");
        require(block.timestamp <= c.deadline, "SlashingAuthority: challenge expired");
        require(chainedProofV2.hashProvingState(state) == c.stateHash, "SlashingAuthority: state hash mismatch");

        ProvingStateV2 memory newState = _applyAction(_copyState(state), action, rawBytes, publicInputs);
        c.provingState = newState;
        c.stateHash = chainedProofV2.hashProvingState(newState);

        emit ChallengeProgressed(challenge_id, action, c.stateHash);

        if (_isAction(action, ACTION_CHAIN_PROOF_VERIFY)) {
            if (_reducedRoot(newState.current_hash) == c.expectedUnsealRoot) {
                c.status = SlashingChallengeStatus.CHALLENGED_AND_PROVED;
                emit ChallengeResolved(challenge_id, SlashingChallengeStatus.CHALLENGED_AND_PROVED);
            }
        }
    }

    function getChallengeStatus(bytes32 challenge_id) external nonReentrant returns (SlashingChallengeStatus) {
        ConditionCheckChallenge storage c = challenges[challenge_id];
        if (c.status != SlashingChallengeStatus.CHALLENGED_AND_PROVED && block.timestamp > c.timeout_timestamp) {
            c.status = SlashingChallengeStatus.CHALLENGED_AND_NOT_PROVED;
            emit ChallengeResolved(challenge_id, SlashingChallengeStatus.CHALLENGED_AND_NOT_PROVED);
        }
        return c.status;
    }

    function getChallengeProgress(bytes32 challenge_id)
        external
        view
        returns (ProvingStateV2 memory state, bytes32 stateHash)
    {
        ConditionCheckChallenge storage c = challenges[challenge_id];
        return (c.provingState, c.stateHash);
    }

    /// @notice Mark expired challenges as not proved (no stake slash).
    function finalizeExpiredChallenge(bytes32 challenge_id) external {
        ConditionCheckChallenge storage c = challenges[challenge_id];
        require(c.deadline != 0, "SlashingAuthority: unknown challenge");
        require(c.status == SlashingChallengeStatus.CHALLENGED, "SlashingAuthority: not active");
        require(block.timestamp > c.deadline, "SlashingAuthority: not expired");

        c.status = SlashingChallengeStatus.CHALLENGED_AND_NOT_PROVED;
        emit ChallengeResolved(challenge_id, SlashingChallengeStatus.CHALLENGED_AND_NOT_PROVED);
    }

    /// @dev Maps action string + encoded params to ChainedProofV2._dryrun_* (same semantics as ChainedProofV2.ts).
    function _applyAction(
        ProvingStateV2 memory state,
        string calldata action,
        bytes calldata rawBytes,
        bytes32[] calldata publicInputs
    ) internal returns (ProvingStateV2 memory) {
        if (_isAction(action, ACTION_PREPARE_NEXT_PROOF)) {
            require(publicInputs.length >= 2, "SlashingAuthority: bad prepare inputs");
            address verifier = address(uint160(uint256(publicInputs[0])));
            bool verifierMustBeTrue = uint256(publicInputs[1]) != 0;
            require(
                conditionVerifierRegistry.isRegistered(verifier)
                    && conditionVerifierRegistry.verifyIntegrity(verifier),
                "SlashingAuthority: verifier not approved"
            );
            uint256 zkLen = publicInputs.length - 2;
            bytes32[] memory zkPublicInputs = new bytes32[](zkLen);
            for (uint256 i = 0; i < zkLen; i++) {
                zkPublicInputs[i] = publicInputs[i + 2];
            }
            return chainedProofV2._dryrun_prepare_next_proof(
                state, verifier, verifierMustBeTrue, zkPublicInputs, rawBytes
            );
        }

        if (_isAction(action, ACTION_CHAIN_PROOF_VERIFY)) {
            require(publicInputs.length >= 1, "SlashingAuthority: bad verify inputs");
            uint256 mask = uint256(publicInputs[0]);
            return chainedProofV2._dryrun_chain_proof_verify(state, mask, false);
        }

        if (_isAction(action, ACTION_PASS_SIGNAL)) {
            require(publicInputs.length >= 4, "SlashingAuthority: bad pass_signal inputs");
            uint256[2] memory publicInputIndexes =
                [uint256(publicInputs[0]), uint256(publicInputs[1])];
            uint256[2] memory outputIndexes = [uint256(publicInputs[2]), uint256(publicInputs[3])];
            return chainedProofV2._dryrun_chain_pass_signal(state, publicInputIndexes, outputIndexes);
        }

        if (_isAction(action, ACTION_STATIC_INPUT)) {
            require(publicInputs.length >= 2, "SlashingAuthority: bad static_input inputs");
            uint256 publicInputIndex = uint256(publicInputs[0]);
            bytes32 value = publicInputs[1];
            return chainedProofV2._dryrun_chain_static_input(state, value, publicInputIndex);
        }

        if (_isAction(action, ACTION_VALIDATE_DATA_ROOT)) {
            require(publicInputs.length >= 2, "SlashingAuthority: bad validate_data_root inputs");
            address datastream = address(uint160(uint256(publicInputs[0])));
            uint256 outputSignalIndex = uint256(publicInputs[1]);
            return chainedProofV2._dryrun_validate_data_root(state, datastream, outputSignalIndex);
        }

        revert("SlashingAuthority: unknown action");
    }

    function _copyState(ProvingStateV2 calldata state) internal pure returns (ProvingStateV2 memory) {
        return ProvingStateV2({
            current_hash: state.current_hash,
            current_index: state.current_index,
            outputs: state.outputs,
            prepared_public_inputs: state.prepared_public_inputs,
            prepared_proof: state.prepared_proof,
            verifier_must_be_true: state.verifier_must_be_true,
            proof_verifier: state.proof_verifier,
            initiator: state.initiator
        });
    }

    function _emptyProvingState() internal pure returns (ProvingStateV2 memory s) {
        s.current_hash = bytes32(0);
        s.current_index = 0;
        s.outputs = new bytes32[](0);
        s.prepared_public_inputs = new bytes32[](0);
        s.prepared_proof = "";
        s.verifier_must_be_true = false;
        s.proof_verifier = address(0);
        s.initiator = address(0);
    }

    function _reducedRoot(bytes32 currentHash) internal pure returns (bytes32) {
        return bytes32(uint256(currentHash) % SNARK_FIELD);
    }

    function _isAction(string calldata action, string memory expected) internal pure returns (bool) {
        return keccak256(bytes(action)) == keccak256(bytes(expected));
    }
}
