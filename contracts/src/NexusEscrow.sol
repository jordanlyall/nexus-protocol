// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title NexusEscrow
 * @notice USDC escrow for AI agent payments with human approval.
 * @dev MVP — single approver (owner), USDC only, Base Sepolia.
 *      Positioning: the $10–$10K agent service range where trust matters
 *      and work delivery isn't instant. x402 owns micropayments; Stripe
 *      owns consumer commerce. This fills the gap in between.
 */
contract NexusEscrow is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    uint256 public constant REFUND_TIMEOUT = 30 days;

    enum Status { Pending, Released, Refunded }

    struct Escrow {
        address depositor;
        address recipient;
        uint256 amount;
        string description;
        Status status;
        uint256 createdAt;
    }

    uint256 public nextEscrowId;
    mapping(uint256 => Escrow) public escrows;

    // Track pending IDs for efficient UI querying
    uint256[] private _pendingIds;
    mapping(uint256 => uint256) private _pendingIndex; // escrowId => index in _pendingIds

    event EscrowCreated(uint256 indexed escrowId, address indexed depositor, address indexed recipient, uint256 amount, string description);
    event EscrowReleased(uint256 indexed escrowId, address indexed recipient, uint256 amount);
    event EscrowRefunded(uint256 indexed escrowId, address indexed depositor, uint256 amount);

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
    }

    /**
     * @notice Create a new escrow. Agent calls this to lock USDC.
     * @param recipient Address to pay if approved.
     * @param amount USDC amount (6 decimals).
     * @param description Human-readable description shown in approval UI.
     * @return escrowId The ID of the created escrow.
     */
    function createEscrow(
        address recipient,
        uint256 amount,
        string calldata description
    ) external returns (uint256 escrowId) {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");
        require(bytes(description).length > 0, "Description required");

        escrowId = nextEscrowId++;

        escrows[escrowId] = Escrow({
            depositor: msg.sender,
            recipient: recipient,
            amount: amount,
            description: description,
            status: Status.Pending,
            createdAt: block.timestamp
        });

        _pendingIndex[escrowId] = _pendingIds.length;
        _pendingIds.push(escrowId);

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit EscrowCreated(escrowId, msg.sender, recipient, amount, description);
    }

    /**
     * @notice Approve and release escrow funds to recipient. Owner only.
     */
    function approveRelease(uint256 escrowId) external onlyOwner {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == Status.Pending, "Not pending");

        escrow.status = Status.Released;
        _removePending(escrowId);
        usdc.safeTransfer(escrow.recipient, escrow.amount);

        emit EscrowReleased(escrowId, escrow.recipient, escrow.amount);
    }

    /**
     * @notice Refund escrow back to depositor. Owner only.
     */
    function refund(uint256 escrowId) external onlyOwner {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == Status.Pending, "Not pending");

        escrow.status = Status.Refunded;
        _removePending(escrowId);
        usdc.safeTransfer(escrow.depositor, escrow.amount);

        emit EscrowRefunded(escrowId, escrow.depositor, escrow.amount);
    }

    /**
     * @notice Safety hatch: depositor can self-refund after 30 days with no action.
     *         Prevents funds being permanently locked if owner wallet is lost.
     */
    function refundExpired(uint256 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.depositor == msg.sender, "Not depositor");
        require(escrow.status == Status.Pending, "Not pending");
        require(block.timestamp >= escrow.createdAt + REFUND_TIMEOUT, "Not expired yet");

        escrow.status = Status.Refunded;
        _removePending(escrowId);
        usdc.safeTransfer(escrow.depositor, escrow.amount);

        emit EscrowRefunded(escrowId, escrow.depositor, escrow.amount);
    }

    /**
     * @notice Get all details for an escrow.
     */
    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return escrows[escrowId];
    }

    /**
     * @notice Get IDs of all currently pending escrows. Used by approval UI.
     */
    function getPendingIds() external view returns (uint256[] memory) {
        return _pendingIds;
    }

    /**
     * @notice Total escrows ever created.
     */
    function totalEscrows() external view returns (uint256) {
        return nextEscrowId;
    }

    // --- Internal ---

    function _removePending(uint256 escrowId) internal {
        uint256 idx = _pendingIndex[escrowId];
        uint256 last = _pendingIds[_pendingIds.length - 1];
        _pendingIds[idx] = last;
        _pendingIndex[last] = idx;
        _pendingIds.pop();
        delete _pendingIndex[escrowId];
    }
}
