// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.27;

import {IDKIMRegistry} from "./interfaces/IDKIMRegistry.sol";

/**
 * @title DKIMRegistry
 * @notice A time-aware on-chain registry of DKIM public-key hashes.
 *
 * Design (adapted from zk-email's UserOverrideableDKIMRegistry, simplified to a
 * single trusted oracle signer):
 *
 *  - Keys are registered by submitting an ECDSA signature produced by the ZKEmail
 *    ICP DNS oracle (canister `fxmww-qiaaa-aaaaj-azu7a-cai`, `sign_dkim_public_key`).
 *    The oracle signs the exact message
 *        "SET:domain=<domain>;public_key_hash=<0xhex(uint256(publicKeyHash))>;"
 *    over an Ethereum Signed Message. Anyone may relay that signature here (the
 *    relayer only pays gas); this contract recovers the signer and requires it to
 *    equal the configured `oracleSigner`.
 *
 *  - Validity is time-aware. For each (domainNameHash, publicKeyHash) we store a
 *    revocation timestamp `revokedAt`:
 *        0                 => never registered  (invalid)
 *        type(uint256).max => registered, live  (valid at any time)
 *        t                 => revoked at time t  (valid only for timestamps < t)
 *    A key is valid at `timestamp` iff `timestamp < revokedAt`.
 *
 * @dev The signed-message construction below MUST byte-for-byte match what the
 *      deployed ICP oracle signs (including the lowercase, minimal-length hex
 *      formatting of the public key hash). It mirrors zk-email's `computeSignedMsg`.
 *
 * @dev DEMO REPOSITORY. Alongside the oracle-signed path, the owner may add keys
 *      directly through a small inlined timelock: every state change is a two-step
 *      `schedule -> (wait timelockPeriod) -> execute`, modelled on OpenZeppelin's
 *      TimelockController but kept dependency-free to match the inlined helpers below.
 *      `timelockPeriod` is 0 at construction (so adds are immediate) and can itself only
 *      be changed under the CURRENT delay. This is intentionally minimal for a demo; a
 *      production deployment should use audited OpenZeppelin Ownable + TimelockController /
 *      AccessControl behind a multisig owner rather than this single-owner shortcut.
 */
contract DKIMRegistry is IDKIMRegistry {
    /// @dev Sentinel stored for a live (never-revoked) key.
    uint256 public constant NOT_REVOKED = type(uint256).max;

    /// @notice EVM address the ICP oracle signs with — the registry's trust anchor.
    /// @dev Set at construction and thereafter changeable ONLY by the owner through the
    ///      timelock (scheduleSetOracleSigner -> executeSetOracleSigner), so it is not
    ///      permanently fixed. Always non-zero (constructor and the setter reject address(0)).
    address public oracleSigner;

    /// @notice Owner able to revoke keys and schedule/execute timelocked operations.
    address public owner;

    /// @notice revokedAt[domainNameHash][publicKeyHash] — see contract docs.
    mapping(bytes32 => mapping(bytes32 => uint256)) public revokedAt;

    event DKIMPublicKeyHashRegistered(bytes32 indexed domainNameHash, bytes32 indexed publicKeyHash);
    event DKIMPublicKeyHashRevoked(bytes32 indexed domainNameHash, bytes32 indexed publicKeyHash, uint256 revokedAt);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event OracleSignerChanged(address indexed previousSigner, address indexed newSigner);

    error InvalidSignature();
    error InvalidOracleSigner();
    error NotOwner();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address oracleSigner_) {
        if (oracleSigner_ == address(0)) revert ZeroAddress();
        oracleSigner = oracleSigner_;
        emit OracleSignerChanged(address(0), oracleSigner_);
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        // DEMO: start with a zero timelock, so owner-scheduled operations (adding keys,
        // and the first change to the delay itself) are immediately executable until the
        // owner raises it via scheduleSetTimelockPeriod / executeSetTimelockPeriod.
        timelockPeriod = 0;
    }

    // -------------------------------------------------------------------------
    // Reads
    // -------------------------------------------------------------------------

    /// @inheritdoc IDKIMRegistry
    function isKeyHashValidAt(
        bytes32 domainNameHash,
        bytes32 publicKeyHash,
        uint256 timestamp
    )
        external
        view
        returns (bool valid)
    {
        return timestamp < revokedAt[domainNameHash][publicKeyHash];
    }

    // -------------------------------------------------------------------------
    // Registration (ICP-oracle-signed) and revocation
    // -------------------------------------------------------------------------

    /**
     * @notice Register a DKIM public key hash for a domain using an ICP-oracle signature.
     * @param domainName The email domain (e.g. "gmail.com"), lower-case.
     * @param publicKeyHash Poseidon hash of the RSA public key, as produced by the oracle.
     * @param signature 65-byte ECDSA signature from `oracleSigner` over the signed message.
     */
    function setDKIMPublicKeyHash(
        string calldata domainName,
        bytes32 publicKeyHash,
        bytes calldata signature
    )
        external
    {
        bytes32 digest = _toEthSignedMessageHash(bytes(computeSignedMsg(domainName, publicKeyHash)));
        address recovered = _recover(digest, signature);
        if (recovered == address(0)) revert InvalidSignature();
        if (recovered != oracleSigner) revert InvalidOracleSigner();

        bytes32 domainNameHash = keccak256(bytes(domainName));
        revokedAt[domainNameHash][publicKeyHash] = NOT_REVOKED;
        emit DKIMPublicKeyHashRegistered(domainNameHash, publicKeyHash);
    }

    /**
     * @notice Revoke a key hash as of the current block time.
     * @dev Existing proofs/emails timestamped before `block.timestamp` remain valid.
     */
    function revokeDKIMPublicKeyHash(bytes32 domainNameHash, bytes32 publicKeyHash) external onlyOwner {
        revokedAt[domainNameHash][publicKeyHash] = block.timestamp;
        emit DKIMPublicKeyHashRevoked(domainNameHash, publicKeyHash, block.timestamp);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // -------------------------------------------------------------------------
    // Owner-managed, timelocked registration (DEMO governance)
    //
    // DEMO REPOSITORY: a deliberately small, self-contained timelock that lets the owner
    // add keys directly (no oracle signature) under a delay. It follows the
    // schedule/execute shape of OpenZeppelin's TimelockController but is inlined to keep
    // this contract dependency-free (like the crypto/string helpers below). Production
    // systems should use audited OpenZeppelin Ownable + TimelockController / AccessControl
    // behind a multisig, not this single-owner shortcut.
    //
    // Semantics:
    //   - `timelockPeriod` is the delay (seconds) between scheduling an operation and being
    //     able to execute it. It is 0 at construction, so operations are immediately
    //     executable until the owner raises it.
    //   - Every mutation (adding a key, replacing the oracle signer, or changing the period
    //     itself) is a two-step schedule -> execute. `schedule` stamps
    //     `readyAt = block.timestamp + timelockPeriod`; `execute` requires
    //     `block.timestamp >= readyAt`.
    //   - Changing `timelockPeriod` is itself timelocked under the CURRENT period (captured
    //     at schedule time), so the delay can never be shortened retroactively — a new value
    //     only takes effect after today's delay has elapsed.
    // -------------------------------------------------------------------------

    /// @notice Delay (seconds) between scheduling and executing a timelocked operation.
    ///         0 at construction (demo): operations are immediately executable until raised.
    uint256 public timelockPeriod;

    /// @notice operationId => unix timestamp at which it may be executed (0 = not scheduled).
    mapping(bytes32 => uint256) public scheduledAt;

    event OperationScheduled(bytes32 indexed operationId, uint256 readyAt);
    event OperationExecuted(bytes32 indexed operationId);
    event OperationCancelled(bytes32 indexed operationId);
    event TimelockPeriodChanged(uint256 previousPeriod, uint256 newPeriod);

    error OperationAlreadyScheduled();
    error OperationNotScheduled();
    error TimelockNotElapsed();

    /// @notice Deterministic id for the "add `publicKeyHash` for `domainName`" operation.
    function addKeyOperationId(string calldata domainName, bytes32 publicKeyHash)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode("ADD_KEY", domainName, publicKeyHash));
    }

    /// @notice Deterministic id for the "set the timelock period to `newPeriod`" operation.
    function setTimelockPeriodOperationId(uint256 newPeriod) public pure returns (bytes32) {
        return keccak256(abi.encode("SET_TIMELOCK_PERIOD", newPeriod));
    }

    /// @notice True once `operationId` is scheduled and its timelock has elapsed.
    function isOperationReady(bytes32 operationId) external view returns (bool) {
        uint256 readyAt = scheduledAt[operationId];
        return readyAt != 0 && block.timestamp >= readyAt;
    }

    /**
     * @notice Step 1/2: schedule the owner-addition of a DKIM key hash for a domain.
     *         Becomes executable via {executeAddKey} after `timelockPeriod` seconds.
     */
    function scheduleAddKey(string calldata domainName, bytes32 publicKeyHash) external onlyOwner {
        _schedule(addKeyOperationId(domainName, publicKeyHash));
    }

    /**
     * @notice Step 2/2: execute a previously-scheduled key addition once its timelock elapsed.
     * @dev Registers the key as live (never-revoked), identical to the oracle-signed path,
     *      and can later be revoked via {revokeDKIMPublicKeyHash}.
     */
    function executeAddKey(string calldata domainName, bytes32 publicKeyHash) external onlyOwner {
        _consume(addKeyOperationId(domainName, publicKeyHash));
        bytes32 domainNameHash = keccak256(bytes(domainName));
        revokedAt[domainNameHash][publicKeyHash] = NOT_REVOKED;
        emit DKIMPublicKeyHashRegistered(domainNameHash, publicKeyHash);
    }

    /**
     * @notice Step 1/2: schedule a change to `timelockPeriod`.
     * @dev Gated by the CURRENT period (captured now via {_schedule}), so the delay can
     *      only be changed after waiting the delay that is in force today.
     */
    function scheduleSetTimelockPeriod(uint256 newPeriod) external onlyOwner {
        _schedule(setTimelockPeriodOperationId(newPeriod));
    }

    /// @notice Step 2/2: apply a previously-scheduled timelock-period change.
    function executeSetTimelockPeriod(uint256 newPeriod) external onlyOwner {
        _consume(setTimelockPeriodOperationId(newPeriod));
        uint256 previous = timelockPeriod;
        timelockPeriod = newPeriod;
        emit TimelockPeriodChanged(previous, newPeriod);
    }

    /// @notice Deterministic id for the "set the oracle signer to `newSigner`" operation.
    function setOracleSignerOperationId(address newSigner) public pure returns (bytes32) {
        return keccak256(abi.encode("SET_ORACLE_SIGNER", newSigner));
    }

    /**
     * @notice Step 1/2: schedule a replacement of the oracle signer (the trust anchor).
     * @dev So the oracle key is not fixed at construction. Gated by the current timelock
     *      period, exactly like adding a key or changing the period. `newSigner` must be
     *      non-zero (a zero anchor would make every oracle signature invalid).
     */
    function scheduleSetOracleSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        _schedule(setOracleSignerOperationId(newSigner));
    }

    /// @notice Step 2/2: apply a previously-scheduled oracle-signer change once its timelock elapsed.
    function executeSetOracleSigner(address newSigner) external onlyOwner {
        _consume(setOracleSignerOperationId(newSigner));
        address previous = oracleSigner;
        oracleSigner = newSigner;
        emit OracleSignerChanged(previous, newSigner);
    }

    /// @notice Cancel a scheduled operation before it executes (owner safety valve).
    function cancelOperation(bytes32 operationId) external onlyOwner {
        if (scheduledAt[operationId] == 0) revert OperationNotScheduled();
        delete scheduledAt[operationId];
        emit OperationCancelled(operationId);
    }

    /// @dev Stamp an operation as ready `timelockPeriod` seconds from now.
    function _schedule(bytes32 operationId) internal {
        if (scheduledAt[operationId] != 0) revert OperationAlreadyScheduled();
        uint256 readyAt = block.timestamp + timelockPeriod;
        scheduledAt[operationId] = readyAt;
        emit OperationScheduled(operationId, readyAt);
    }

    /// @dev Require an operation is scheduled and its timelock elapsed, then clear it.
    ///      Clearing (rather than a DONE sentinel) lets the same operation be re-scheduled
    ///      later, e.g. re-adding a key after a revocation.
    function _consume(bytes32 operationId) internal {
        uint256 readyAt = scheduledAt[operationId];
        if (readyAt == 0) revert OperationNotScheduled();
        if (block.timestamp < readyAt) revert TimelockNotElapsed();
        delete scheduledAt[operationId];
        emit OperationExecuted(operationId);
    }

    // -------------------------------------------------------------------------
    // Signed-message construction — MUST match the ICP oracle exactly
    // -------------------------------------------------------------------------

    /**
     * @notice The exact message the ICP oracle signs for (domain, publicKeyHash).
     * @dev Mirrors zk-email's `computeSignedMsg` and the oracle's
     *      `format!("SET:domain={};public_key_hash={};", domain, public_key_hash_hex)`.
     */
    function computeSignedMsg(string memory domainName, bytes32 publicKeyHash) public pure returns (string memory) {
        return string.concat(
            "SET:", "domain=", domainName, ";public_key_hash=", _toHexString(uint256(publicKeyHash)), ";"
        );
    }

    // -------------------------------------------------------------------------
    // Inlined crypto/string helpers (avoids an OpenZeppelin dependency)
    // -------------------------------------------------------------------------

    function _toEthSignedMessageHash(bytes memory message) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n", _toString(message.length), message));
    }

    /// @dev ECDSA recover with malleability + validity checks (mirrors OpenZeppelin).
    function _recover(bytes32 hash, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 0x20))
            v := byte(0, calldataload(add(signature.offset, 0x40)))
        }
        if (v < 27) v += 27;
        // Reject the upper range of s to prevent signature malleability.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return address(0);
        }
        if (v != 27 && v != 28) return address(0);
        return ecrecover(hash, v, r, s);
    }

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    /// @dev Minimal-length lowercase hex with "0x" prefix (matches OZ Strings.toHexString(uint256)).
    function _toHexString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0x00";
        uint256 length = 0;
        uint256 temp = value;
        while (temp != 0) {
            length++;
            temp >>= 8;
        }
        bytes16 symbols = "0123456789abcdef";
        bytes memory buffer = new bytes(2 * length + 2);
        buffer[0] = "0";
        buffer[1] = "x";
        for (uint256 i = 2 * length + 1; i > 1; --i) {
            buffer[i] = symbols[value & 0xf];
            value >>= 4;
        }
        return string(buffer);
    }
}
