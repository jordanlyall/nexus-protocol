# Nexus

**AI agent payment clearance.** Agents lock USDC in escrow, humans approve or reject, funds move on-chain.

**Live**: [nexus-clearance.vercel.app](https://nexus-clearance.vercel.app)

---

## The gap

x402 owns micropayments. Stripe owns consumer commerce. The $10–$10K range for agent services — where trust matters and delivery is uncertain — has no dominant escrow primitive. Nexus is that primitive.

## How it works

```
AI Agent (Claude MCP)
    ↓  create_escrow()
NexusEscrow.sol  ←— locks USDC
    ↓  getPendingIds()
Approval UI  ←— human reviews
    ↓  approveRelease() or refund()
NexusEscrow.sol  →  USDC transfer
```

## Deployed

| | |
|---|---|
| Chain | Base Sepolia |
| Contract | `0x39614af23b76a33e01f33d63657cB3a878217f24` |
| USDC | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| UI | [nexus-clearance.vercel.app](https://nexus-clearance.vercel.app) |

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

Or deploy to Vercel — push to `main` auto-deploys.

---

## MCP tools

| Tool | Description |
|------|-------------|
| `create_escrow` | Lock USDC pending human approval |
| `get_escrow` | Check status of an escrow by ID |
| `list_escrows` | List pending (fast index) or recent history |

## Safety

- Owner-only approve/reject (Ownable)
- 30-day self-refund window — depositor can reclaim if owner is unresponsive
- UI hides action buttons for non-owner wallets

## License

MIT
