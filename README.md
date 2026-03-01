# Nexus Protocol

USDC escrow for AI agents with human approval. Agents propose payments, humans approve them, funds move on-chain.

**The gap**: x402 owns micropayments. Stripe owns consumer commerce. The $10–$10K range for agent services where trust matters has no dominant escrow primitive. This is it.

## Architecture

```
AI Agent (Claude)
    ↓ MCP tools
Nexus MCP Server
    ↓ viem
NexusEscrow.sol (Base Sepolia)
    ↓ getPendingIds()
Approval UI (React)
    ↓ wallet tx
NexusEscrow.sol → USDC transfer
```

## Quickstart

### 1. Deploy the contract

```bash
cd contracts
forge install
cp ../.env.example .env  # fill in PRIVATE_KEY, BASE_SEPOLIA_RPC
forge test
forge script script/Deploy.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast
# Copy deployed address into .env as CONTRACT_ADDRESS
```

Get testnet USDC: https://faucet.circle.com

### 2. Run the MCP server

```bash
cd mcp && npm install && npm run dev
```

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

### 3. Run the approval UI

```bash
cd ui && npm install
VITE_CONTRACT_ADDRESS=0x... npm run dev
```

Visit `http://localhost:5173`. Connect the owner wallet to approve/reject.

## MCP Tools

| Tool | Description |
|------|-------------|
| `create_escrow` | Lock USDC in escrow, pending human approval |
| `get_escrow` | Check status of an escrow by ID |
| `list_escrows` | List pending (fast) or recent escrows |

## Safety

- Depositors can self-refund after 30 days if owner is unresponsive (`refundExpired`)
- Approve/reject buttons hidden in UI if connected wallet isn't the contract owner

## Network

- Chain: Base Sepolia
- Token: USDC (`0x036CbD53842c5426634e7929541eC2318f3dCF7e`)

## License

MIT
