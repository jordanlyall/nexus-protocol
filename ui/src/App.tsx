import { useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  http,
  custom,
  formatUnits,
} from "viem";
import { baseSepolia } from "viem/chains";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}`;

const NEXUS_ABI = [
  {
    name: "owner",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
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
  {
    name: "approveRelease",
    type: "function",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "refund",
    type: "function",
    inputs: [{ name: "escrowId", type: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const STATUS_LABELS = ["Pending", "Released", "Refunded"];

type EscrowData = {
  id: number;
  depositor: `0x${string}`;
  recipient: `0x${string}`;
  amount: bigint;
  description: string;
  status: number;
  createdAt: bigint;
};

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

export default function App() {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [pending, setPending] = useState<EscrowData[]>([]);
  const [history, setHistory] = useState<EscrowData[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setError(null);
    const [addr] = await (window as any).ethereum.request({
      method: "eth_requestAccounts",
    });
    setAddress(addr);

    const owner = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: NEXUS_ABI,
      functionName: "owner",
    });

    const ownerMatch = owner.toLowerCase() === addr.toLowerCase();
    setIsOwner(ownerMatch);

    await load();
  }

  async function load() {
    setLoading(true);
    setError(null);

    try {
      // Pending: use efficient on-chain index
      const pendingIds = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: NEXUS_ABI,
        functionName: "getPendingIds",
      });

      const pendingEscrows: EscrowData[] = [];
      for (const id of pendingIds) {
        const e = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: NEXUS_ABI,
          functionName: "getEscrow",
          args: [id],
        });
        pendingEscrows.push({ id: Number(id), ...e });
      }
      setPending(pendingEscrows);

      // History: recent 20 non-pending (iterate from end)
      const total = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: NEXUS_ABI,
        functionName: "totalEscrows",
      });

      const historyEscrows: EscrowData[] = [];
      const count = Number(total);
      for (let i = count - 1; i >= 0 && historyEscrows.length < 20; i--) {
        const e = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: NEXUS_ABI,
          functionName: "getEscrow",
          args: [BigInt(i)],
        });
        if (e.status !== 0) {
          historyEscrows.push({ id: i, ...e });
        }
      }
      setHistory(historyEscrows);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load escrows");
    } finally {
      setLoading(false);
    }
  }

  async function approve(id: number) {
    if (!address) return;
    setProcessing(id);
    setError(null);
    try {
      const walletClient = createWalletClient({
        chain: baseSepolia,
        transport: custom((window as any).ethereum),
      });
      await walletClient.writeContract({
        account: address,
        address: CONTRACT_ADDRESS,
        abi: NEXUS_ABI,
        functionName: "approveRelease",
        args: [BigInt(id)],
      });
      await load();
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? "Transaction failed");
    } finally {
      setProcessing(null);
    }
  }

  async function reject(id: number) {
    if (!address) return;
    setProcessing(id);
    setError(null);
    try {
      const walletClient = createWalletClient({
        chain: baseSepolia,
        transport: custom((window as any).ethereum),
      });
      await walletClient.writeContract({
        account: address,
        address: CONTRACT_ADDRESS,
        abi: NEXUS_ABI,
        functionName: "refund",
        args: [BigInt(id)],
      });
      await load();
    } catch (e: any) {
      setError(e?.shortMessage ?? e?.message ?? "Transaction failed");
    } finally {
      setProcessing(null);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: 640, margin: "40px auto", padding: "0 20px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Nexus</h1>
      <p style={{ color: "#666", marginBottom: 32 }}>AI Agent Payment Approvals</p>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, padding: "10px 14px", marginBottom: 16, color: "#dc2626", fontSize: 14 }}>
          {error}
        </div>
      )}

      {!address ? (
        <button onClick={connect} style={btnStyle("#000", "#fff")}>
          Connect Wallet
        </button>
      ) : (
        <>
          <div style={{ marginBottom: 20, fontSize: 13, color: "#666" }}>
            {address.slice(0, 6)}...{address.slice(-4)}
            {" "}
            {isOwner ? (
              <span style={{ color: "#16a34a", fontWeight: 600 }}>Approver</span>
            ) : (
              <span style={{ color: "#dc2626" }}>Not the contract owner — approve/reject disabled</span>
            )}
          </div>

          {loading ? (
            <p style={{ color: "#999" }}>Loading...</p>
          ) : (
            <>
              <section>
                <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
                  Pending Approval ({pending.length})
                </h2>
                {pending.length === 0 ? (
                  <p style={{ color: "#999" }}>No pending approvals.</p>
                ) : (
                  pending.map((e) => {
                    const expiresAt = new Date(
                      (Number(e.createdAt) + 30 * 24 * 60 * 60) * 1000
                    ).toLocaleDateString();
                    return (
                      <div key={e.id} style={cardStyle}>
                        <div style={{ marginBottom: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: 18 }}>
                            ${formatUnits(e.amount, 6)} USDC
                          </span>
                          <span style={{ color: "#999", marginLeft: 8, fontSize: 13 }}>
                            #{e.id}
                          </span>
                        </div>
                        <p style={{ margin: "0 0 4px", fontWeight: 500 }}>{e.description}</p>
                        <p style={{ margin: "0 0 2px", fontSize: 12, color: "#888" }}>
                          To: {e.recipient}
                        </p>
                        <p style={{ margin: "0 0 14px", fontSize: 11, color: "#bbb" }}>
                          Self-refund eligible: {expiresAt}
                        </p>
                        {isOwner && (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={() => approve(e.id)}
                              disabled={processing === e.id}
                              style={btnStyle("#16a34a", "#fff")}
                            >
                              {processing === e.id ? "..." : "Approve"}
                            </button>
                            <button
                              onClick={() => reject(e.id)}
                              disabled={processing === e.id}
                              style={btnStyle("#dc2626", "#fff")}
                            >
                              {processing === e.id ? "..." : "Reject"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </section>

              {history.length > 0 && (
                <section style={{ marginTop: 32 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>History</h2>
                  {history.map((e) => (
                    <div key={e.id} style={{ ...cardStyle, opacity: 0.55 }}>
                      <span style={{ fontWeight: 600 }}>${formatUnits(e.amount, 6)} USDC</span>
                      <span
                        style={{
                          marginLeft: 8,
                          color: e.status === 1 ? "#16a34a" : "#dc2626",
                          fontWeight: 500,
                        }}
                      >
                        {STATUS_LABELS[e.status]}
                      </span>
                      <span style={{ marginLeft: 8, color: "#999", fontSize: 13 }}>
                        #{e.id} — {e.description}
                      </span>
                    </div>
                  ))}
                </section>
              )}

              <button
                onClick={load}
                style={{ marginTop: 24, ...btnStyle("#f3f4f6", "#000") }}
              >
                Refresh
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "16px",
  marginBottom: 12,
};

function btnStyle(bg: string, color: string): React.CSSProperties {
  return {
    background: bg,
    color,
    border: "none",
    borderRadius: 6,
    padding: "8px 16px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500,
  };
}
