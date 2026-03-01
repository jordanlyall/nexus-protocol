import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

// NOTE: This MCP server uses a hot wallet (PRIVATE_KEY env var). The agent
// can deposit USDC from this wallet autonomously — that's intentional for MVP.
// Releases still require human approval via the UI (only contract owner can
// call approveRelease/refund). This is a known tradeoff for v1.

const NEXUS_ABI = [
  {
    name: "createEscrow",
    type: "function",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "description", type: "string" },
    ],
    outputs: [{ name: "escrowId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    name: "getEscrow",
    type: "function",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "depositor", type: "address" },
          { name: "recipient", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "description", type: "string" },
          { name: "status", type: "uint8" },
          { name: "createdAt", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    name: "getPendingIds",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    name: "totalEscrows",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const USDC_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS as `0x${string}`;
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const STATUS_LABELS = ["Pending", "Released", "Refunded"];

if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY not set");
if (!process.env.CONTRACT_ADDRESS) throw new Error("CONTRACT_ADDRESS not set");

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC),
});

const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC),
});

const server = new McpServer({
  name: "nexus-escrow",
  version: "0.1.0",
});

// Tool 1: create_escrow
server.tool(
  "create_escrow",
  "Lock USDC in escrow for a payment pending human approval. Use for agent service payments in the $10–$10,000 range where work quality or delivery is uncertain.",
  {
    recipient: z.string().describe("Ethereum address to pay if approved"),
    amount_usdc: z
      .number()
      .positive()
      .describe("Amount in USDC (e.g. 50 for $50)"),
    description: z
      .string()
      .describe(
        "What this payment is for — shown to human approver. Be specific."
      ),
  },
  async ({ recipient, amount_usdc, description }) => {
    const amount = parseUnits(amount_usdc.toString(), 6);

    // Approve USDC spend
    const approveTx = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: USDC_ABI,
      functionName: "approve",
      args: [CONTRACT_ADDRESS, amount],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });

    // Create escrow
    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: NEXUS_ABI,
      functionName: "createEscrow",
      args: [recipient as `0x${string}`, amount, description],
    });
    await publicClient.waitForTransactionReceipt({ hash });

    const total = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: NEXUS_ABI,
      functionName: "totalEscrows",
    });
    const escrowId = Number(total) - 1;

    return {
      content: [
        {
          type: "text",
          text: [
            `Escrow created.`,
            `  ID: ${escrowId}`,
            `  Amount: $${amount_usdc} USDC`,
            `  Recipient: ${recipient}`,
            `  Description: ${description}`,
            `  Tx: ${hash}`,
            ``,
            `Funds are locked. The human approver must visit the approval UI to release or refund.`,
            `Escrow expires (self-refundable) after 30 days with no action.`,
          ].join("\n"),
        },
      ],
    };
  }
);

// Tool 2: get_escrow
server.tool(
  "get_escrow",
  "Check the status and details of an escrow by ID",
  {
    escrow_id: z
      .number()
      .int()
      .min(0)
      .describe("The escrow ID to look up"),
  },
  async ({ escrow_id }) => {
    const escrow = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: NEXUS_ABI,
      functionName: "getEscrow",
      args: [BigInt(escrow_id)],
    });

    const amountUsdc = formatUnits(escrow.amount, 6);
    const status = STATUS_LABELS[escrow.status] ?? "Unknown";
    const createdAt = new Date(Number(escrow.createdAt) * 1000).toISOString();
    const expiresAt = new Date(
      (Number(escrow.createdAt) + 30 * 24 * 60 * 60) * 1000
    ).toISOString();

    return {
      content: [
        {
          type: "text",
          text: [
            `Escrow #${escrow_id}`,
            `  Status: ${status}`,
            `  Amount: $${amountUsdc} USDC`,
            `  Depositor: ${escrow.depositor}`,
            `  Recipient: ${escrow.recipient}`,
            `  Description: ${escrow.description}`,
            `  Created: ${createdAt}`,
            ...(status === "Pending" ? [`  Self-refund eligible: ${expiresAt}`] : []),
          ].join("\n"),
        },
      ],
    };
  }
);

// Tool 3: list_escrows
server.tool(
  "list_escrows",
  "List escrows — pending ones via efficient on-chain index, or recent history",
  {
    filter: z
      .enum(["pending", "recent"])
      .default("pending")
      .describe("'pending' = all awaiting approval (fast). 'recent' = last N by creation order."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(10)
      .describe("Max escrows to return (only used for 'recent' filter)"),
  },
  async ({ filter, limit }) => {
    if (filter === "pending") {
      const pendingIds = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: NEXUS_ABI,
        functionName: "getPendingIds",
      });

      if (pendingIds.length === 0) {
        return { content: [{ type: "text", text: "No pending escrows." }] };
      }

      const lines = [`Pending escrows (${pendingIds.length}):\n`];
      for (const id of pendingIds) {
        const e = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: NEXUS_ABI,
          functionName: "getEscrow",
          args: [id],
        });
        lines.push(
          `#${id} $${formatUnits(e.amount, 6)} USDC — ${e.description} (to: ${e.recipient})`
        );
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    // Recent
    const total = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: NEXUS_ABI,
      functionName: "totalEscrows",
    });

    const count = Number(total);
    if (count === 0) {
      return { content: [{ type: "text", text: "No escrows created yet." }] };
    }

    const start = Math.max(0, count - limit);
    const lines = [`Recent escrows (${count} total):\n`];
    for (let i = count - 1; i >= start; i--) {
      const e = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: NEXUS_ABI,
        functionName: "getEscrow",
        args: [BigInt(i)],
      });
      const status = STATUS_LABELS[e.status] ?? "Unknown";
      lines.push(
        `#${i} [${status}] $${formatUnits(e.amount, 6)} USDC — ${e.description}`
      );
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Nexus MCP server running");
