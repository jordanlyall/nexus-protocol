// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/NexusEscrow.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Minimal USDC mock — 6 decimals
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract NexusEscrowTest is Test {
    NexusEscrow public nexus;
    MockUSDC public usdc;

    address owner = address(this);
    address agent = makeAddr("agent");
    address recipient = makeAddr("recipient");
    address stranger = makeAddr("stranger");

    uint256 constant AMOUNT = 50e6; // $50 USDC

    function setUp() public {
        usdc = new MockUSDC();
        nexus = new NexusEscrow(address(usdc));

        usdc.mint(agent, 1000e6);
        vm.prank(agent);
        usdc.approve(address(nexus), type(uint256).max);
    }

    // --- createEscrow ---

    function test_CreateEscrow() public {
        vm.prank(agent);
        uint256 id = nexus.createEscrow(recipient, AMOUNT, "Pay for data analysis");

        assertEq(id, 0);
        assertEq(usdc.balanceOf(address(nexus)), AMOUNT);

        NexusEscrow.Escrow memory e = nexus.getEscrow(0);
        assertEq(e.depositor, agent);
        assertEq(e.recipient, recipient);
        assertEq(e.amount, AMOUNT);
        assertEq(uint8(e.status), uint8(NexusEscrow.Status.Pending));
    }

    function test_CreateEscrow_AppearsInPendingIds() public {
        vm.prank(agent);
        nexus.createEscrow(recipient, AMOUNT, "Test");

        uint256[] memory pending = nexus.getPendingIds();
        assertEq(pending.length, 1);
        assertEq(pending[0], 0);
    }

    function test_CreateEscrow_RejectsZeroRecipient() public {
        vm.prank(agent);
        vm.expectRevert("Invalid recipient");
        nexus.createEscrow(address(0), AMOUNT, "Test");
    }

    function test_CreateEscrow_RejectsZeroAmount() public {
        vm.prank(agent);
        vm.expectRevert("Amount must be > 0");
        nexus.createEscrow(recipient, 0, "Test");
    }

    function test_CreateEscrow_RejectsEmptyDescription() public {
        vm.prank(agent);
        vm.expectRevert("Description required");
        nexus.createEscrow(recipient, AMOUNT, "");
    }

    // --- approveRelease ---

    function test_ApproveRelease() public {
        vm.prank(agent);
        uint256 id = nexus.createEscrow(recipient, AMOUNT, "Test");

        nexus.approveRelease(id);

        assertEq(usdc.balanceOf(recipient), AMOUNT);
        assertEq(usdc.balanceOf(address(nexus)), 0);
        assertEq(uint8(nexus.getEscrow(id).status), uint8(NexusEscrow.Status.Released));
    }

    function test_ApproveRelease_RemovesFromPending() public {
        vm.prank(agent);
        uint256 id = nexus.createEscrow(recipient, AMOUNT, "Test");
        nexus.approveRelease(id);

        uint256[] memory pending = nexus.getPendingIds();
        assertEq(pending.length, 0);
    }

    function test_ApproveRelease_OnlyOwner() public {
        vm.prank(agent);
        uint256 id = nexus.createEscrow(recipient, AMOUNT, "Test");

        vm.prank(stranger);
        vm.expectRevert();
        nexus.approveRelease(id);
    }

    function test_ApproveRelease_RevertsIfNotPending() public {
        vm.prank(agent);
        uint256 id = nexus.createEscrow(recipient, AMOUNT, "Test");
        nexus.approveRelease(id);

        vm.expectRevert("Not pending");
        nexus.approveRelease(id);
    }

    // --- refund ---

    function test_Refund() public {
        vm.prank(agent);
        uint256 id = nexus.createEscrow(recipient, AMOUNT, "Test");

        uint256 balanceBefore = usdc.balanceOf(agent);
        nexus.refund(id);

        assertEq(usdc.balanceOf(agent), balanceBefore + AMOUNT);
        assertEq(uint8(nexus.getEscrow(id).status), uint8(NexusEscrow.Status.Refunded));
    }

    function test_Refund_RemovesFromPending() public {
        vm.prank(agent);
        uint256 id = nexus.createEscrow(recipient, AMOUNT, "Test");
        nexus.refund(id);

        assertEq(nexus.getPendingIds().length, 0);
    }

    function test_Refund_OnlyOwner() public {
        vm.prank(agent);
        uint256 id = nexus.createEscrow(recipient, AMOUNT, "Test");

        vm.prank(stranger);
        vm.expectRevert();
        nexus.refund(id);
    }

    // --- refundExpired ---

    function test_RefundExpired() public {
        vm.prank(agent);
        uint256 id = nexus.createEscrow(recipient, AMOUNT, "Test");

        vm.warp(block.timestamp + 31 days);

        uint256 balanceBefore = usdc.balanceOf(agent);
        vm.prank(agent);
        nexus.refundExpired(id);

        assertEq(usdc.balanceOf(agent), balanceBefore + AMOUNT);
        assertEq(uint8(nexus.getEscrow(id).status), uint8(NexusEscrow.Status.Refunded));
    }

    function test_RefundExpired_RemovesFromPending() public {
        vm.prank(agent);
        uint256 id = nexus.createEscrow(recipient, AMOUNT, "Test");
        vm.warp(block.timestamp + 31 days);
        vm.prank(agent);
        nexus.refundExpired(id);

        assertEq(nexus.getPendingIds().length, 0);
    }

    function test_RefundExpired_RevertsBeforeTimeout() public {
        vm.prank(agent);
        uint256 id = nexus.createEscrow(recipient, AMOUNT, "Test");

        vm.warp(block.timestamp + 29 days);
        vm.prank(agent);
        vm.expectRevert("Not expired yet");
        nexus.refundExpired(id);
    }

    function test_RefundExpired_RevertsIfNotDepositor() public {
        vm.prank(agent);
        uint256 id = nexus.createEscrow(recipient, AMOUNT, "Test");
        vm.warp(block.timestamp + 31 days);

        vm.prank(stranger);
        vm.expectRevert("Not depositor");
        nexus.refundExpired(id);
    }

    // --- getPendingIds with multiple escrows ---

    function test_PendingIds_MultipleEscrows() public {
        vm.startPrank(agent);
        nexus.createEscrow(recipient, AMOUNT, "First");
        nexus.createEscrow(recipient, AMOUNT, "Second");
        nexus.createEscrow(recipient, AMOUNT, "Third");
        vm.stopPrank();

        // Approve the middle one
        nexus.approveRelease(1);

        uint256[] memory pending = nexus.getPendingIds();
        assertEq(pending.length, 2);
        // IDs 0 and 2 should remain (order may vary due to swap-and-pop)
        bool has0 = pending[0] == 0 || pending[1] == 0;
        bool has2 = pending[0] == 2 || pending[1] == 2;
        assertTrue(has0);
        assertTrue(has2);
    }

    // --- Events ---

    event EscrowCreated(uint256 indexed escrowId, address indexed depositor, address indexed recipient, uint256 amount, string description);
    event EscrowReleased(uint256 indexed escrowId, address indexed recipient, uint256 amount);
    event EscrowRefunded(uint256 indexed escrowId, address indexed depositor, uint256 amount);

    function test_EmitsEscrowCreated() public {
        vm.prank(agent);
        vm.expectEmit(true, true, true, true);
        emit EscrowCreated(0, agent, recipient, AMOUNT, "Test");
        nexus.createEscrow(recipient, AMOUNT, "Test");
    }

    function test_EmitsEscrowReleased() public {
        vm.prank(agent);
        nexus.createEscrow(recipient, AMOUNT, "Test");

        vm.expectEmit(true, true, false, true);
        emit EscrowReleased(0, recipient, AMOUNT);
        nexus.approveRelease(0);
    }

    function test_EmitsEscrowRefunded() public {
        vm.prank(agent);
        nexus.createEscrow(recipient, AMOUNT, "Test");

        vm.expectEmit(true, true, false, true);
        emit EscrowRefunded(0, agent, AMOUNT);
        nexus.refund(0);
    }
}
