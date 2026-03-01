# Nexus Protocol — Claude Code Project Memory

## Why This Exists

The AI agent payment market has bifurcated: x402 and Alby own micropayments (sub-$1, instant, no trust needed), Stripe ACP and Visa own consumer commerce. The **$10–$10,000 range** — agent services like code generation, data analysis, creative work, task completion — where trust matters and delivery isn't instant, has no dominant escrow primitive.

Nexus is that primitive. The core bet: as AI agents start buying real services from each other and from humans, conditional settlement with human oversight becomes essential infrastructure.

**Primary competitive threat**: Coinbase (AgentKit + x402 + Agentic Wallets). They could ship an escrow module inside AgentKit. Build fast and establish on-chain history.

## What This Is

USDC escrow for AI agents with human approval. Agents propose payments, humans approve them, funds move on-chain.

**The one-liner**: Corporate expense card with approval workflows, but for AI agents.

## Status

- MVP in progress — Base Sepolia testnet
- Stack: Foundry (Solidity) + TypeScript MCP server + React approval UI

## Repo Structure

```
nexus-protocol/
├── CLAUDE.md                  ← you are here
├── contracts/
│   ├── src/NexusEscrow.sol    ← the contract
│   ├── test/NexusEscrow.t.sol ← Foundry tests
│   ├── script/Deploy.s.sol    ← deploy script
│   └── foundry.toml
├── mcp/
│   ├── src/index.ts           ← MCP server (3 tools)
│   ├── package.json
│   └── tsconfig.json
├── ui/
│   ├── src/App.tsx            ← approval UI
│   └── package.json
└── README.md
```

## Core Flow

1. Agent calls `create_escrow` MCP tool → USDC locked in contract
2. Human visits approval UI → sees pending escrows via `getPendingIds()`
3. Human clicks Approve → `approveRelease()` sends USDC to recipient
4. Human clicks Reject → `refund()` returns USDC to depositor
5. Safety: depositor can self-refund after 30 days if owner is unresponsive

## Smart Contract: NexusEscrow.sol

Key design decisions:
- **Single approver = contract owner** (deployer). MVP only.
- **`getPendingIds()`** returns pending escrow IDs from an on-chain index. Never iterate total history in the UI.
- **`refundExpired()`** lets depositors self-refund after 30 days. Without this, lost owner wallet = permanently locked funds.
- **No autonomous releases** in v1. Human approval required for every release.
- **USDC only** (Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`).

## MCP Server Tools (3 total)

| Tool | Description |
|------|-------------|
| `create_escrow` | Lock USDC, returns escrow ID |
| `get_escrow` | Status + details for one escrow |
| `list_escrows` | Pending (fast, uses `getPendingIds`) or recent history |

**Note on hot wallet**: The MCP server holds a private key and deposits USDC autonomously. This is the "fully autonomous depositing" model — intentional for MVP simplicity. Human approval is still required for every release. Document this in any public writing about Nexus.

## Approval UI

- Reads pending escrows via `getPendingIds()` — O(pending) not O(total)
- Checks `owner()` after wallet connect — hides approve/reject if not owner
- Shows self-refund expiry date on each pending escrow
- Error messages surface viem's `shortMessage` for readable revert reasons

## Environment Variables

```
PRIVATE_KEY=           # deployer wallet (also the approver/owner)
BASE_SEPOLIA_RPC=      # e.g. https://sepolia.base.org
USDC_ADDRESS=          # 0x036CbD53842c5426634e7929541eC2318f3dCF7e
ETHERSCAN_API_KEY=     # for contract verification (optional)
CONTRACT_ADDRESS=      # set after deployment
```

## Useful Commands

```bash
# Contracts
cd contracts
forge install
forge build
forge test
forge test -vvv                    # verbose
forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast

# MCP server
cd mcp && npm install && npm run dev

# UI
cd ui && npm install
VITE_CONTRACT_ADDRESS=0x... npm run dev
```

## Build Order

1. `forge test` — all tests passing (contract is done)
2. Deploy to Base Sepolia → set `CONTRACT_ADDRESS`
3. Run MCP server, verify tools work with Claude Desktop
4. Run UI, connect wallet, test approve/reject flow
5. End-to-end: Claude agent creates escrow → UI shows it → approve → check on-chain

## What NOT to Build Yet

- Multi-approver / multisig
- Dispute resolution / slasher contracts
- ZK identity or TEE attestations
- ERC-8004 integration (on roadmap, not MVP)
- Token / tokenomics
- Mobile approval app
- 28LA integration (separate project — don't conflate)
