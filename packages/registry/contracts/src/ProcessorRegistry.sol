// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./lib/BabyJubJub.sol";
import "./Interfaces.sol";

/// @title ProcessorRegistry
/// @notice Permissionless registry for Nihilium processors.
///
///         Registration and staking are intentionally separate:
///           1. `register()` — creates the processor record with metadata.
///           2. `addStake(token, amount)` — deposit ETH or any committee-approved
///              ERC-20 as stake.  Multiple tokens may be staked simultaneously.
///           3. `signalStakeRemoval(token, amount)` — begin the grace-period
///              countdown for a specific token amount.
///           4. `finalizeStakeRemoval(token)` — withdraw after the grace period.
///
///         Stake tokens
///         ────────────
///         ETH (address(0)) is always accepted.  Additional ERC-20 tokens may
///         be added by the committee (the list can only grow, never shrink).
///         Stablecoins are deliberately excluded per §8.6 — only assets whose
///         transfer logic cannot be frozen by a third party should be added.
///
///         Slashing
///         ────────
///         The external `slashingAuthority` calls `slash(keyId, token)` to
///         forfeit all stake in a given token held by the key's owner.  All
///         slashed funds are sent to the configurable `rewardRecipient` address
///         (defaulting to the committee; independently settable).
///
///         Key management
///         ──────────────
///         Each processor may register any number of Baby Jubjub key pairs,
///         identified by `keccak256(keyX, keyY)`.  Keys are HE (ECElGamal,
///         used in composite-key sealing §6.2) or Signing (EdDSA, sealing
///         commitments §6.4).  Any key may be deactivated by its owner; the
///         deactivation timestamp is stored but the key ID is never removed.
contract ProcessorRegistry is ReentrancyGuard, IProcessorRegistry {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    enum KeyType { HE, Signing }

    /// @dev Per-key record.  Key ID = keccak256(abi.encodePacked(keyX, keyY)).
    struct KeyInfo {
        uint256  keyX;
        uint256  keyY;
        KeyType  keyType;
        address  owner;           // processor Ethereum address
        uint256  deactivatedAt;   // block.timestamp when deactivated; 0 = active
    }

    /// @dev Human-readable metadata.
    struct ProcessorMetadata {
        string name;
        string description;
        string url;   // clearnet API endpoint
        string tor;   // .onion address
    }

    /// @dev Per-processor state (no stake stored here — see `stakes` mapping).
    struct ProcessorInfo {
        uint256 gracePeriodBlocks;
        uint256 pendingGracePeriodBlocks;
        uint256 pendingGracePeriodRequestedAt;
        bool    active;
        ProcessorMetadata metadata;
    }

    /// @dev A pending stake-removal request for one token.
    struct PendingRemoval {
        uint256 amount;
        uint256 signaledAtBlock; // 0 = no pending removal
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    mapping(address => ProcessorInfo) public processors;
    mapping(bytes32 => KeyInfo)       public keys;
    mapping(address => bytes32[])     public processorKeys;
    mapping(bytes32 => bool)          public keyRegistered;

    /// @dev stakes[processor][token] — token == address(0) means ETH.
    mapping(address => mapping(address => uint256))          public stakes;
    /// @dev pendingRemovals[processor][token].
    mapping(address => mapping(address => PendingRemoval))   public pendingRemovals;

    /// @dev ERC-20 tokens approved for staking.  ETH (address(0)) is always
    ///      accepted and is NOT stored in this mapping.
    mapping(address => bool)  public allowedStakeTokens;
    address[]                 public allowedTokenList;

    address public committee;
    /// @dev Receives all slashed stake.  Defaults to committee at construction;
    ///      independently settable by the committee.
    address public rewardRecipient;
    address public slashingAuthority;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ProcessorRegistered(address indexed processor, uint256 gracePeriodBlocks);

    event StakeAdded(
        address indexed processor,
        address indexed token,
        uint256 amount,
        uint256 newTotal
    );
    event StakeRemovalSignalled(
        address indexed processor,
        address indexed token,
        uint256 amount,
        uint256 withdrawableAfterBlock
    );
    event StakeRemovalFinalized(
        address indexed processor,
        address indexed token,
        uint256 amount
    );

    event KeyAdded(
        address indexed processor,
        bytes32 indexed keyId,
        uint256 keyX,
        uint256 keyY,
        KeyType keyType
    );
    event KeyDeactivated(
        address indexed processor,
        bytes32 indexed keyId,
        uint256 deactivatedAt
    );

    event MetadataUpdated(address indexed processor);

    event GracePeriodUpdateQueued(
        address indexed processor,
        uint256 newGracePeriodBlocks,
        uint256 effectiveAfterBlock
    );
    event GracePeriodUpdated(address indexed processor, uint256 newGracePeriodBlocks);

    event Slashed(
        address indexed processor,
        bytes32 indexed keyId,
        address indexed token,
        uint256 amount,
        address rewardRecipient
    );

    event TokenAllowed(address indexed token);
    event CommitteeTransferred(address indexed oldCommittee, address indexed newCommittee);
    event RewardRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event SlashingAuthorityUpdated(address indexed oldAuthority, address indexed newAuthority);

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyCommittee() {
        require(msg.sender == committee, "ProcessorRegistry: not committee");
        _;
    }

    modifier onlySlashingAuthority() {
        require(msg.sender == slashingAuthority, "ProcessorRegistry: not slashing authority");
        _;
    }

    modifier onlyActiveProcessor(address processor) {
        require(processors[processor].active, "ProcessorRegistry: not active");
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _committee, address _rewardRecipient, address _slashingAuthority) {
        require(_committee         != address(0), "ProcessorRegistry: zero committee");
        require(_rewardRecipient   != address(0), "ProcessorRegistry: zero rewardRecipient");
        require(_slashingAuthority != address(0), "ProcessorRegistry: zero slashingAuthority");

        committee          = _committee;
        rewardRecipient    = _rewardRecipient;
        slashingAuthority  = _slashingAuthority;
    }

    // -------------------------------------------------------------------------
    // Registration  (no stake required)
    // -------------------------------------------------------------------------

    /// @notice Register as a processor.  No stake is required at this step.
    ///         Use `addStake` to deposit stake after registration.
    function register(
        uint256 gracePeriodBlocks,
        string calldata name,
        string calldata description,
        string calldata url,
        string calldata tor
    ) external {
        require(!processors[msg.sender].active, "ProcessorRegistry: already registered");
        require(gracePeriodBlocks > 0,          "ProcessorRegistry: grace period must be > 0");

        processors[msg.sender] = ProcessorInfo({
            gracePeriodBlocks:             gracePeriodBlocks,
            pendingGracePeriodBlocks:      0,
            pendingGracePeriodRequestedAt: 0,
            active:                        true,
            metadata: ProcessorMetadata({
                name:        name,
                description: description,
                url:         url,
                tor:         tor
            })
        });

        emit ProcessorRegistered(msg.sender, gracePeriodBlocks);
    }

    // -------------------------------------------------------------------------
    // Stake management
    // -------------------------------------------------------------------------

    /// @notice Deposit stake in ETH or an approved ERC-20 token.
    ///         For ETH: pass `token = address(0)` and send `amount` as msg.value.
    ///         For ERC-20: approve this contract first, then call with `token` and `amount`.
    function addStake(address token, uint256 amount)
        external
        payable
        nonReentrant
        onlyActiveProcessor(msg.sender)
    {
        require(amount > 0, "ProcessorRegistry: amount must be > 0");

        if (token == address(0)) {
            require(msg.value == amount, "ProcessorRegistry: ETH amount mismatch");
        } else {
            require(allowedStakeTokens[token], "ProcessorRegistry: token not allowed");
            require(msg.value == 0,            "ProcessorRegistry: ETH sent with token stake");
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }

        stakes[msg.sender][token] += amount;
        emit StakeAdded(msg.sender, token, amount, stakes[msg.sender][token]);
    }

    /// @notice Signal intent to remove `amount` of `token` stake.
    ///         The amount is reserved (deducted from active stake) immediately;
    ///         withdrawal becomes possible after `gracePeriodBlocks` blocks.
    ///         Only one pending removal per token is allowed at a time.
    function signalStakeRemoval(address token, uint256 amount)
        external
        onlyActiveProcessor(msg.sender)
    {
        require(amount > 0, "ProcessorRegistry: amount must be > 0");
        require(
            stakes[msg.sender][token] >= amount,
            "ProcessorRegistry: insufficient stake"
        );
        require(
            pendingRemovals[msg.sender][token].signaledAtBlock == 0,
            "ProcessorRegistry: removal already pending for this token"
        );

        // Reserve the amount immediately.
        stakes[msg.sender][token] -= amount;
        pendingRemovals[msg.sender][token] = PendingRemoval({
            amount:          amount,
            signaledAtBlock: block.number
        });

        uint256 gracePeriod = processors[msg.sender].gracePeriodBlocks;
        emit StakeRemovalSignalled(
            msg.sender,
            token,
            amount,
            block.number + gracePeriod
        );
    }

    /// @notice Finalise a pending stake removal once the grace period has elapsed.
    function finalizeStakeRemoval(address token)
        external
        nonReentrant
        onlyActiveProcessor(msg.sender)
    {
        PendingRemoval storage pr = pendingRemovals[msg.sender][token];
        require(pr.signaledAtBlock != 0, "ProcessorRegistry: no pending removal");
        require(
            block.number >= pr.signaledAtBlock + processors[msg.sender].gracePeriodBlocks,
            "ProcessorRegistry: grace period not elapsed"
        );

        uint256 amount = pr.amount;
        pr.amount          = 0;
        pr.signaledAtBlock = 0;

        emit StakeRemovalFinalized(msg.sender, token, amount);
        _transfer(token, msg.sender, amount);
    }

    // -------------------------------------------------------------------------
    // Key management
    // -------------------------------------------------------------------------

    /// @notice Add a Baby Jubjub key pair to the caller's processor record.
    ///
    ///         Schnorr proof-of-knowledge — challenge:
    ///           keccak256(msg.sender, keyX, keyY, uint256(keyType),
    ///                     address(this), block.chainid) % BJJ_ORDER
    function addKey(
        uint256 keyX,
        uint256 keyY,
        KeyType keyType,
        uint256 proofRx,
        uint256 proofRy,
        uint256 proofS
    ) external onlyActiveProcessor(msg.sender) {
        require(BabyJubJub.isOnCurve(keyX, keyY),   "ProcessorRegistry: key not on curve");
        require(!BabyJubJub.isIdentity(keyX, keyY), "ProcessorRegistry: key is identity");

        bytes32 keyId = keccak256(abi.encodePacked(keyX, keyY));
        require(!keyRegistered[keyId], "ProcessorRegistry: key already registered");

        uint256 challenge = BabyJubJub.hashToScalar(
            keccak256(abi.encodePacked(
                msg.sender, keyX, keyY,
                uint256(keyType),
                address(this),
                block.chainid
            ))
        );
        require(
            BabyJubJub.verifySchnorr(keyX, keyY, proofRx, proofRy, proofS, challenge),
            "ProcessorRegistry: invalid key PoK"
        );

        keyRegistered[keyId] = true;
        keys[keyId] = KeyInfo({
            keyX:          keyX,
            keyY:          keyY,
            keyType:       keyType,
            owner:         msg.sender,
            deactivatedAt: 0
        });
        processorKeys[msg.sender].push(keyId);

        emit KeyAdded(msg.sender, keyId, keyX, keyY, keyType);
    }

    /// @notice Deactivate one of the caller's keys (records block.timestamp).
    function deactivateKey(bytes32 keyId) external {
        KeyInfo storage k = keys[keyId];
        require(k.owner == msg.sender,  "ProcessorRegistry: not key owner");
        require(k.deactivatedAt == 0,   "ProcessorRegistry: key already inactive");
        k.deactivatedAt = block.timestamp;
        emit KeyDeactivated(msg.sender, keyId, block.timestamp);
    }

    // -------------------------------------------------------------------------
    // Metadata
    // -------------------------------------------------------------------------

    function updateMetadata(
        string calldata name,
        string calldata description,
        string calldata url,
        string calldata tor
    ) external onlyActiveProcessor(msg.sender) {
        ProcessorMetadata storage m = processors[msg.sender].metadata;
        m.name        = name;
        m.description = description;
        m.url         = url;
        m.tor         = tor;
        emit MetadataUpdated(msg.sender);
    }

    // -------------------------------------------------------------------------
    // Grace period changes
    // -------------------------------------------------------------------------

    /// @notice Queue a grace period change.  Takes effect only after the current
    ///         period has elapsed from the request block (§8.4).
    function setGracePeriod(uint256 newGracePeriodBlocks)
        external
        onlyActiveProcessor(msg.sender)
    {
        require(newGracePeriodBlocks > 0, "ProcessorRegistry: must be > 0");
        ProcessorInfo storage p = processors[msg.sender];

        p.pendingGracePeriodBlocks      = newGracePeriodBlocks;
        p.pendingGracePeriodRequestedAt = block.number;

        emit GracePeriodUpdateQueued(
            msg.sender,
            newGracePeriodBlocks,
            block.number + p.gracePeriodBlocks
        );
    }

    /// @notice Materialise a queued grace period change once eligible.
    function applyPendingGracePeriod() external onlyActiveProcessor(msg.sender) {
        ProcessorInfo storage p = processors[msg.sender];
        require(p.pendingGracePeriodBlocks != 0, "ProcessorRegistry: no pending update");
        require(
            block.number >= p.pendingGracePeriodRequestedAt + p.gracePeriodBlocks,
            "ProcessorRegistry: current grace period not yet elapsed"
        );

        uint256 newGrace = p.pendingGracePeriodBlocks;
        p.gracePeriodBlocks             = newGrace;
        p.pendingGracePeriodBlocks      = 0;
        p.pendingGracePeriodRequestedAt = 0;

        emit GracePeriodUpdated(msg.sender, newGrace);
    }

    // -------------------------------------------------------------------------
    // Slashing  (one-strike-out per token, §8.1)
    // -------------------------------------------------------------------------

    /// @notice Slash all active stake in `token` held by the owner of `keyId`.
    ///         Forfeits the entire balance for that token and marks the key
    ///         as deactivated.  Does NOT deactivate the processor record itself
    ///         — the processor may still have stake in other tokens and be
    ///         subject to further slashing for each.
    ///
    ///         Called exclusively by the `slashingAuthority` after verifying
    ///         the cryptographic slashing evidence off-chain (§8.2).
    ///
    /// @param keyId  keccak256(keyX ++ keyY) of the misbehaving key.
    /// @param token  Token to forfeit (address(0) = ETH).
    function slash(bytes32 keyId, address token)
        external
        onlySlashingAuthority
        nonReentrant
    {
        KeyInfo storage k = keys[keyId];
        require(k.owner != address(0), "ProcessorRegistry: key not found");

        address processor = k.owner;

        // Deactivate the specific key.
        if (k.deactivatedAt == 0) {
            k.deactivatedAt = block.timestamp;
        }

        // Forfeit active stake.
        uint256 activeStake = stakes[processor][token];
        if (activeStake > 0) {
            stakes[processor][token] = 0;
        }

        // Also forfeit any pending removal for this token (cancel the
        // pending withdrawal — the funds were already reserved).
        PendingRemoval storage pr = pendingRemovals[processor][token];
        uint256 pendingAmount = pr.amount;
        if (pendingAmount > 0) {
            pr.amount          = 0;
            pr.signaledAtBlock = 0;
        }

        uint256 total = activeStake + pendingAmount;
        emit Slashed(processor, keyId, token, total, rewardRecipient);

        if (total > 0) {
            _transfer(token, rewardRecipient, total);
        }
    }

    // -------------------------------------------------------------------------
    // Governance
    // -------------------------------------------------------------------------

    /// @notice Add an ERC-20 token to the approved stake-token list.
    ///         This operation is irreversible — tokens cannot be removed from
    ///         the list once added (§8.6).
    function addAllowedToken(address token) external onlyCommittee {
        require(token != address(0),          "ProcessorRegistry: use ETH directly");
        require(!allowedStakeTokens[token],   "ProcessorRegistry: token already allowed");
        allowedStakeTokens[token] = true;
        allowedTokenList.push(token);
        emit TokenAllowed(token);
    }

    function transferCommittee(address newCommittee) external onlyCommittee {
        require(newCommittee != address(0), "ProcessorRegistry: zero address");
        emit CommitteeTransferred(committee, newCommittee);
        committee = newCommittee;
    }

    function setRewardRecipient(address newRecipient) external onlyCommittee {
        require(newRecipient != address(0), "ProcessorRegistry: zero address");
        emit RewardRecipientUpdated(rewardRecipient, newRecipient);
        rewardRecipient = newRecipient;
    }

    function setSlashingAuthority(address newAuthority) external onlyCommittee {
        require(newAuthority != address(0), "ProcessorRegistry: zero address");
        emit SlashingAuthorityUpdated(slashingAuthority, newAuthority);
        slashingAuthority = newAuthority;
    }

    // -------------------------------------------------------------------------
    // View helpers
    // -------------------------------------------------------------------------

    /// @inheritdoc IProcessorRegistry
    function isActive(address processor) external view override returns (bool) {
        return processors[processor].active;
    }

    function getProcessorInfo(address processor) external view returns (ProcessorInfo memory) {
        return processors[processor];
    }

    function getKeyInfo(bytes32 keyId) external view returns (KeyInfo memory) {
        return keys[keyId];
    }

    function isKeyActive(bytes32 keyId) external view returns (bool) {
        KeyInfo storage k = keys[keyId];
        return k.owner != address(0) && k.deactivatedAt == 0;
    }

    function getProcessorKeys(address processor) external view returns (bytes32[] memory) {
        return processorKeys[processor];
    }

    /// @notice All approved ERC-20 stake tokens.
    function getAllowedTokens() external view returns (address[] memory) {
        return allowedTokenList;
    }

    /// @notice Block number after which a pending removal can be finalised.
    ///         Returns 0 if no removal is pending for this token.
    function removalAvailableAtBlock(address processor, address token)
        external
        view
        returns (uint256)
    {
        PendingRemoval storage pr = pendingRemovals[processor][token];
        if (pr.signaledAtBlock == 0) return 0;
        return pr.signaledAtBlock + processors[processor].gracePeriodBlocks;
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _transfer(address token, address to, uint256 amount) private {
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            require(ok, "ProcessorRegistry: ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
