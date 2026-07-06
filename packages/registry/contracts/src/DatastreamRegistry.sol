// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./lib/BabyJubJub.sol";
import "./Interfaces.sol";

/// @title DatastreamRegistry
/// @notice Permissionless registry for Nihilium datastream operators (§3.3).
///
///         Mirrors the ProcessorRegistry stake model:
///           1. `register()` — creates the operator record with metadata and
///              registers the IDataStream contract address.  No stake required.
///           2. `addStake(token, amount)` — deposit ETH or approved ERC-20.
///           3. `signalStakeRemoval(token, amount)` — begin grace-period.
///           4. `finalizeStakeRemoval(token)` — withdraw after grace period.
///
///         The same committee-governed approved-token list (add-only) and
///         independent `rewardRecipient` / `slashingAuthority` pattern apply.
contract DatastreamRegistry is ReentrancyGuard, IDatastreamRegistry {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    /// @dev Per-key record.  Key ID = keccak256(abi.encodePacked(keyX, keyY)).
    struct KeyInfo {
        uint256 keyX;
        uint256 keyY;
        address owner;          // operator Ethereum address
        uint256 deactivatedAt;  // block.timestamp when deactivated; 0 = active
    }

    /// @dev Human-readable metadata.
    struct DatastreamMetadata {
        string name;
        string description;
        string url;   // clearnet endpoint
        string tor;   // .onion address
    }

    /// @dev Per-operator state (no stake stored here — see `stakes` mapping).
    struct DatastreamInfo {
        address contractAddress;       // IDataStream implementation
        uint256 gracePeriodSeconds;
        uint256 pendingGracePeriodSeconds;
        uint256 pendingGracePeriodRequestedAt;
        bool    active;
        DatastreamMetadata metadata;
    }

    /// @dev A pending stake-removal request for one token.
    struct PendingRemoval {
        uint256 amount;
        uint256 signaledAt; // block.timestamp when signalled; 0 = none pending
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    mapping(address => DatastreamInfo) public datastreams;
    mapping(bytes32 => KeyInfo)        public keys;
    mapping(address => bytes32[])      public operatorKeys;
    mapping(bytes32 => bool)           public keyRegistered;
    mapping(address => bool)           public contractRegistered;

    /// @dev stakes[operator][token] — token == address(0) means ETH.
    mapping(address => mapping(address => uint256))        public stakes;
    mapping(address => mapping(address => PendingRemoval)) public pendingRemovals;

    mapping(address => bool) public allowedStakeTokens;
    address[]                public allowedTokenList;

    address[] private _operators;

    address public committee;
    address public rewardRecipient;
    address public slashingAuthority;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event DatastreamRegistered(
        address indexed operator,
        address indexed contractAddress,
        uint256 gracePeriodSeconds
    );

    event StakeAdded(
        address indexed operator,
        address indexed token,
        uint256 amount,
        uint256 newTotal
    );
    event StakeRemovalSignalled(
        address indexed operator,
        address indexed token,
        uint256 amount,
        uint256 withdrawableAfterTimestamp
    );
    event StakeRemovalFinalized(
        address indexed operator,
        address indexed token,
        uint256 amount
    );

    event KeyAdded(
        address indexed operator,
        bytes32 indexed keyId,
        uint256 keyX,
        uint256 keyY
    );
    event KeyDeactivated(
        address indexed operator,
        bytes32 indexed keyId,
        uint256 deactivatedAt
    );

    event MetadataUpdated(address indexed operator);

    event GracePeriodUpdateQueued(
        address indexed operator,
        uint256 newGracePeriodSeconds,
        uint256 effectiveAfterTimestamp
    );
    event GracePeriodUpdated(address indexed operator, uint256 newGracePeriodSeconds);

    event Slashed(
        address indexed operator,
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
        require(msg.sender == committee, "DatastreamRegistry: not committee");
        _;
    }

    modifier onlySlashingAuthority() {
        require(msg.sender == slashingAuthority, "DatastreamRegistry: not slashing authority");
        _;
    }

    modifier onlyActiveOperator(address operator) {
        require(datastreams[operator].active, "DatastreamRegistry: not active");
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address _committee, address _rewardRecipient, address _slashingAuthority) {
        require(_committee         != address(0), "DatastreamRegistry: zero committee");
        require(_rewardRecipient   != address(0), "DatastreamRegistry: zero rewardRecipient");
        require(_slashingAuthority != address(0), "DatastreamRegistry: zero slashingAuthority");

        committee          = _committee;
        rewardRecipient    = _rewardRecipient;
        slashingAuthority  = _slashingAuthority;
    }

    // -------------------------------------------------------------------------
    // Registration  (no stake required)
    // -------------------------------------------------------------------------

    /// @notice Register a datastream operator.  No stake is required at registration.
    ///
    /// @param datastreamContract  Deployed IDataStream contract.
    /// @param gracePeriodSeconds  Minimum seconds between stake removal signal and withdrawal.
    function register(
        address datastreamContract,
        uint256 gracePeriodSeconds,
        string calldata name,
        string calldata description,
        string calldata url,
        string calldata tor
    ) external {
        require(!datastreams[msg.sender].active,         "DatastreamRegistry: already registered");
        require(datastreamContract != address(0),        "DatastreamRegistry: zero contract address");
        require(!contractRegistered[datastreamContract], "DatastreamRegistry: contract already registered");
        require(gracePeriodSeconds > 0,                   "DatastreamRegistry: grace period must be > 0");

        try IDataStream(datastreamContract).isKnownValueRoot(bytes32(0)) returns (bool) {
            // interface satisfied
        } catch {
            revert("DatastreamRegistry: contract does not implement IDataStream");
        }

        contractRegistered[datastreamContract] = true;
        _operators.push(msg.sender);

        datastreams[msg.sender] = DatastreamInfo({
            contractAddress:               datastreamContract,
            gracePeriodSeconds:             gracePeriodSeconds,
            pendingGracePeriodSeconds:      0,
            pendingGracePeriodRequestedAt: 0,
            active:                        true,
            metadata: DatastreamMetadata({
                name:        name,
                description: description,
                url:         url,
                tor:         tor
            })
        });

        emit DatastreamRegistered(msg.sender, datastreamContract, gracePeriodSeconds);
    }

    // -------------------------------------------------------------------------
    // Stake management
    // -------------------------------------------------------------------------

    /// @notice Deposit stake in ETH or an approved ERC-20 token.
    function addStake(address token, uint256 amount)
        external
        payable
        nonReentrant
        onlyActiveOperator(msg.sender)
    {
        require(amount > 0, "DatastreamRegistry: amount must be > 0");

        if (token == address(0)) {
            require(msg.value == amount, "DatastreamRegistry: ETH amount mismatch");
        } else {
            require(allowedStakeTokens[token], "DatastreamRegistry: token not allowed");
            require(msg.value == 0,            "DatastreamRegistry: ETH sent with token stake");
            IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        }

        stakes[msg.sender][token] += amount;
        emit StakeAdded(msg.sender, token, amount, stakes[msg.sender][token]);
    }

    /// @notice Signal intent to remove `amount` of `token` stake.
    ///         The amount is reserved (deducted from active stake) immediately.
    function signalStakeRemoval(address token, uint256 amount)
        external
        onlyActiveOperator(msg.sender)
    {
        require(amount > 0, "DatastreamRegistry: amount must be > 0");
        require(
            stakes[msg.sender][token] >= amount,
            "DatastreamRegistry: insufficient stake"
        );
        require(
            pendingRemovals[msg.sender][token].signaledAt == 0,
            "DatastreamRegistry: removal already pending for this token"
        );

        stakes[msg.sender][token] -= amount;
        pendingRemovals[msg.sender][token] = PendingRemoval({
            amount:     amount,
            signaledAt: block.timestamp
        });

        uint256 gracePeriod = datastreams[msg.sender].gracePeriodSeconds;
        emit StakeRemovalSignalled(
            msg.sender,
            token,
            amount,
            block.timestamp + gracePeriod
        );
    }

    /// @notice Finalise a pending stake removal once the grace period has elapsed.
    function finalizeStakeRemoval(address token)
        external
        nonReentrant
        onlyActiveOperator(msg.sender)
    {
        PendingRemoval storage pr = pendingRemovals[msg.sender][token];
        require(pr.signaledAt != 0, "DatastreamRegistry: no pending removal");
        require(
            block.timestamp >= pr.signaledAt + datastreams[msg.sender].gracePeriodSeconds,
            "DatastreamRegistry: grace period not elapsed"
        );

        uint256 amount = pr.amount;
        pr.amount     = 0;
        pr.signaledAt = 0;

        emit StakeRemovalFinalized(msg.sender, token, amount);
        _transfer(token, msg.sender, amount);
    }

    // -------------------------------------------------------------------------
    // Key management
    // -------------------------------------------------------------------------

    /// @notice Add a Baby Jubjub signing key.
    ///
    ///         Schnorr PoK challenge:
    ///           keccak256(msg.sender, keyX, keyY, address(this), block.chainid) % BJJ_ORDER
    function addKey(
        uint256 keyX,
        uint256 keyY,
        uint256 proofRx,
        uint256 proofRy,
        uint256 proofS
    ) external onlyActiveOperator(msg.sender) {
        require(BabyJubJub.isOnCurve(keyX, keyY),   "DatastreamRegistry: key not on curve");
        require(!BabyJubJub.isIdentity(keyX, keyY), "DatastreamRegistry: key is identity");

        bytes32 keyId = keccak256(abi.encodePacked(keyX, keyY));
        require(!keyRegistered[keyId], "DatastreamRegistry: key already registered");

        uint256 challenge = BabyJubJub.hashToScalar(
            keccak256(abi.encodePacked(
                msg.sender, keyX, keyY,
                address(this),
                block.chainid
            ))
        );
        require(
            BabyJubJub.verifySchnorr(keyX, keyY, proofRx, proofRy, proofS, challenge),
            "DatastreamRegistry: invalid key PoK"
        );

        keyRegistered[keyId] = true;
        keys[keyId] = KeyInfo({
            keyX:          keyX,
            keyY:          keyY,
            owner:         msg.sender,
            deactivatedAt: 0
        });
        operatorKeys[msg.sender].push(keyId);

        emit KeyAdded(msg.sender, keyId, keyX, keyY);
    }

    /// @notice Deactivate one of the caller's keys.
    function deactivateKey(bytes32 keyId) external {
        KeyInfo storage k = keys[keyId];
        require(k.owner == msg.sender,  "DatastreamRegistry: not key owner");
        require(k.deactivatedAt == 0,   "DatastreamRegistry: key already inactive");
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
    ) external onlyActiveOperator(msg.sender) {
        DatastreamMetadata storage m = datastreams[msg.sender].metadata;
        m.name        = name;
        m.description = description;
        m.url         = url;
        m.tor         = tor;
        emit MetadataUpdated(msg.sender);
    }

    // -------------------------------------------------------------------------
    // Grace period changes
    // -------------------------------------------------------------------------

    function setGracePeriod(uint256 newGracePeriodSeconds)
        external
        onlyActiveOperator(msg.sender)
    {
        require(newGracePeriodSeconds > 0, "DatastreamRegistry: must be > 0");
        DatastreamInfo storage d = datastreams[msg.sender];

        d.pendingGracePeriodSeconds      = newGracePeriodSeconds;
        d.pendingGracePeriodRequestedAt = block.timestamp;

        emit GracePeriodUpdateQueued(
            msg.sender,
            newGracePeriodSeconds,
            block.timestamp + d.gracePeriodSeconds
        );
    }

    function applyPendingGracePeriod() external onlyActiveOperator(msg.sender) {
        DatastreamInfo storage d = datastreams[msg.sender];
        require(d.pendingGracePeriodSeconds != 0, "DatastreamRegistry: no pending update");
        require(
            block.timestamp >= d.pendingGracePeriodRequestedAt + d.gracePeriodSeconds,
            "DatastreamRegistry: current grace period not yet elapsed"
        );

        uint256 newGrace = d.pendingGracePeriodSeconds;
        d.gracePeriodSeconds             = newGrace;
        d.pendingGracePeriodSeconds      = 0;
        d.pendingGracePeriodRequestedAt = 0;

        emit GracePeriodUpdated(msg.sender, newGrace);
    }

    // -------------------------------------------------------------------------
    // Slashing
    // -------------------------------------------------------------------------

    /// @notice Slash all active + pending stake in `token` held by the owner
    ///         of `keyId`.  Sends funds to `rewardRecipient`.
    function slash(bytes32 keyId, address token)
        external
        onlySlashingAuthority
        nonReentrant
    {
        KeyInfo storage k = keys[keyId];
        require(k.owner != address(0), "DatastreamRegistry: key not found");

        address operator = k.owner;

        if (k.deactivatedAt == 0) {
            k.deactivatedAt = block.timestamp;
        }

        uint256 activeStake = stakes[operator][token];
        if (activeStake > 0) stakes[operator][token] = 0;

        PendingRemoval storage pr = pendingRemovals[operator][token];
        uint256 pendingAmount = pr.amount;
        if (pendingAmount > 0) {
            pr.amount          = 0;
            pr.signaledAt = 0;
        }

        uint256 total = activeStake + pendingAmount;
        emit Slashed(operator, keyId, token, total, rewardRecipient);

        if (total > 0) {
            _transfer(token, rewardRecipient, total);
        }
    }

    // -------------------------------------------------------------------------
    // Governance
    // -------------------------------------------------------------------------

    function addAllowedToken(address token) external onlyCommittee {
        require(token != address(0),        "DatastreamRegistry: use ETH directly");
        require(!allowedStakeTokens[token], "DatastreamRegistry: token already allowed");
        allowedStakeTokens[token] = true;
        allowedTokenList.push(token);
        emit TokenAllowed(token);
    }

    function transferCommittee(address newCommittee) external onlyCommittee {
        require(newCommittee != address(0), "DatastreamRegistry: zero address");
        emit CommitteeTransferred(committee, newCommittee);
        committee = newCommittee;
    }

    function setRewardRecipient(address newRecipient) external onlyCommittee {
        require(newRecipient != address(0), "DatastreamRegistry: zero address");
        emit RewardRecipientUpdated(rewardRecipient, newRecipient);
        rewardRecipient = newRecipient;
    }

    function setSlashingAuthority(address newAuthority) external onlyCommittee {
        require(newAuthority != address(0), "DatastreamRegistry: zero address");
        emit SlashingAuthorityUpdated(slashingAuthority, newAuthority);
        slashingAuthority = newAuthority;
    }

    // -------------------------------------------------------------------------
    // View helpers
    // -------------------------------------------------------------------------

    /// @inheritdoc IDatastreamRegistry
    function isActiveOperator(address operator) external view override returns (bool) {
        return datastreams[operator].active;
    }

    /// @inheritdoc IDatastreamRegistry
    function getDatastreamContract(address operator) external view override returns (address) {
        return datastreams[operator].contractAddress;
    }

    function getDatastreamInfo(address operator) external view returns (DatastreamInfo memory) {
        return datastreams[operator];
    }

    function getKeyInfo(bytes32 keyId) external view returns (KeyInfo memory) {
        return keys[keyId];
    }

    function isKeyActive(bytes32 keyId) external view returns (bool) {
        KeyInfo storage k = keys[keyId];
        return k.owner != address(0) && k.deactivatedAt == 0;
    }

    function getOperatorKeys(address operator) external view returns (bytes32[] memory) {
        return operatorKeys[operator];
    }

    function getAllowedTokens() external view returns (address[] memory) {
        return allowedTokenList;
    }

    function removalAvailableAt(address operator, address token)
        external
        view
        returns (uint256)
    {
        PendingRemoval storage pr = pendingRemovals[operator][token];
        if (pr.signaledAt == 0) return 0;
        return pr.signaledAt + datastreams[operator].gracePeriodSeconds;
    }

    function getAllOperators() external view returns (address[] memory) {
        return _operators;
    }

    function getActiveOperators() external view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < _operators.length; ) {
            if (datastreams[_operators[i]].active) ++count;
            unchecked { ++i; }
        }
        address[] memory result = new address[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < _operators.length; ) {
            if (datastreams[_operators[i]].active) {
                result[j] = _operators[i];
                unchecked { ++j; }
            }
            unchecked { ++i; }
        }
        return result;
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _transfer(address token, address to, uint256 amount) private {
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            require(ok, "DatastreamRegistry: ETH transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
