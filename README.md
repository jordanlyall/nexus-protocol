# Nexus

**AI agent payment clearance.** Agents lock USDC in escrow, humans approve or reject, funds move on-chain.

**Live demo**: [nexus-clearance.vercel.app](https://nexus-clearance.vercel.app)

---

## The gap

x402 owns micropayments. Stripe owns consumer commerce. The $10–$10K range for agent services — where trust matters and delivery is uncertain — has no dominant escrow primitive.

When an AI agent books a contractor, commissions research, or pays for a service on your behalf, what's the mechanism? Right now there isn't one. Nexus is a proof of concept for what that primitive could look like.

## How it works

```
AI Agent (Claude MCP)
    ↓  create_escrow("Build me a landing page", $500 USDC)
NexusEscrow.sol  ←— funds locked on-chain
    ↓  getPendingIds()
Approval UI  ←— human reviews work, approves or rejects
    ↓  approveRelease() or refund()
NexusEscrow.sol  →  USDC released to recipient
```

The agent proposes. The human decides. The contract enforces.

## Deployed (Base Sepolia)

| | |
|---|---|
| Contract | `0x39614af23b76a33e01f33d63657cB3a878217f24` |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Approval UI | [nexus-clearance.vercel.app](https://nexus-clearance.vercel.app) |

---

## What could be built on this

This is a minimal proof of concept. The interesting work is ahead. Some directions worth exploring:

**Protocol extensions**
- Multi-approver escrow — require M-of-N humans to approve before release
- Time-locked auto-release — funds release automatically after N days unless rejected
- Milestone-based escrow — split a payment across multiple approval checkpoints
- Dispute resolution — third-party arbitration when agent and human disagree
- Reputation layer — on-chain history of agent payment reliability

**Integrations**
- Any MCP-compatible agent (not just Claude) — the MCP server is the thin layer
- Webhook notifications — ping a URL when an escrow is created or actioned
- Multi-token support — ETH, any ERC-20 beyond USDC
- Mainnet deployment — Base, Optimism, Arbitrum

**UX**
- Mobile approval UI — approve agent payments from your phone
- Batch approvals — review and action multiple escrows at once
- Email/SMS alerts — get notified when an agent creates an escrow
- Slack/Discord bot — approve directly from where you work

---

## Setup

### 1. Deploy the contract

```bash
cd contracts
forge install
cp .env.example .env  # fill in PRIVATE_KEY, BASE_SEPOLIA_RPC
forge test
forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast
```

Get testnet USDC: https://faucet.circle.com

### 2. Configure the MCP server

Add to Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "nexus": {
      "command": "node",
      "args": ["/path/to/nexus-protocol/mcp/dist/index.js"],
      "env": {
        "PRIVATE_KEY": "0x...",
        "BASE_SEPOLIA_RPC": "https://sepolia.base.org",
        "CONTRACT_ADDRESS": "0x..."
      }
    }
  }
}
```

```bash
cd mcp && npm install && npm run build
```

### 3. Run the approval UI

```bash
cd ui && npm install
cp .env.example .env  # set VITE_CONTRACT_ADDRESS
npm run dev
```

Connect the contract owner wallet to approve/reject pending escrows.

---

## MCP tools

| Tool | Description |
|------|-------------|
| `create_escrow` | Lock USDC pending human approval |
| `get_escrow` | Check status of an escrow by ID |
| `list_escrows` | List pending (fast index) or recent history |

## Contract

`NexusEscrow.sol` is ~115 lines. Ownable, no upgradability, no fees. Read it before you trust it.

- Owner-only `approveRelease` and `refund`
- 30-day self-refund window — depositor reclaims if owner is unresponsive
- Emits events for all state changes

## Contributing

Fork it, extend it, break it. If you build something interesting on top of this, open a PR or tag [@jordanlyall](https://github.com/jordanlyall).

## License

MIT
