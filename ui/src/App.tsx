import { useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  http,
  custom,
  formatUnits,
} from "viem";
import { base } from "viem/chains";
import "./App.css";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}`;
const chain = base;

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
  chain,
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
        chain,
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
        chain,
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
    <div className="app">
      <header className="header">
        <div className="wordmark">
          <h1>Nexus</h1>
          <span className="wordmark-dot" />
        </div>
        <p className="subtitle">Agent Payment Clearance</p>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {!address ? (
        <div className="connect-area">
          <p className="connect-label">Authorization required</p>
          <button className="btn-connect" onClick={connect}>
            Connect Wallet
          </button>
        </div>
      ) : (
        <>
          <div className="wallet-bar">
            <span className="wallet-address">
              {address.slice(0, 8)}...{address.slice(-6)}
            </span>
            {isOwner ? (
              <span className="wallet-status approver">Approver</span>
            ) : (
              <span className="wallet-status viewer">Read Only</span>
            )}
          </div>

          {loading ? (
            <div className="loading-state">
              <span className="loading-dot" />
              Reading chain...
            </div>
          ) : (
            <>
              <section className="pending-section">
                <div className="section-label">
                  Awaiting Clearance
                  {pending.length > 0 && (
                    <span className="section-count">{pending.length}</span>
                  )}
                </div>

                {pending.length === 0 ? (
                  <div className="empty-state">No pending authorizations</div>
                ) : (
                  pending.map((e, i) => {
                    const expiresAt = new Date(
                      (Number(e.createdAt) + 30 * 24 * 60 * 60) * 1000
                    ).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    });
                    return (
                      <div
                        key={e.id}
                        className="escrow-card"
                        style={{ animationDelay: `${i * 0.08}s` }}
                      >
                        <div className="escrow-amount-row">
                          <span className="escrow-amount">
                            ${formatUnits(e.amount, 6)}
                          </span>
                          <span className="escrow-id">
                            USDC / #{e.id}
                          </span>
                        </div>

                        <p className="escrow-description">{e.description}</p>

                        <div className="escrow-meta">
                          <div className="escrow-meta-row">
                            <span className="meta-label">To</span>
                            <span>
                              {e.recipient.slice(0, 10)}...{e.recipient.slice(-8)}
                            </span>
                          </div>
                          <div className="escrow-meta-row">
                            <span className="meta-label">From</span>
                            <span>
                              {e.depositor.slice(0, 10)}...{e.depositor.slice(-8)}
                            </span>
                          </div>
                        </div>

                        <p className="escrow-expiry">
                          Self-refund eligible {expiresAt}
                        </p>

                        {isOwner && (
                          <div className="action-row">
                            <button
                              className="btn-authorize"
                              onClick={() => approve(e.id)}
                              disabled={processing === e.id}
                            >
                              {processing === e.id ? "···" : "Authorize"}
                            </button>
                            <button
                              className="btn-reject"
                              onClick={() => reject(e.id)}
                              disabled={processing === e.id}
                            >
                              {processing === e.id ? "···" : "Reject"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </section>

              {history.length > 0 && (
                <section className="history-section">
                  <div className="section-label">History</div>
                  {history.map((e, i) => (
                    <div
                      key={e.id}
                      className="history-row"
                      style={{ animationDelay: `${i * 0.05}s` }}
                    >
                      <span className="history-amount">
                        ${formatUnits(e.amount, 6)}
                      </span>
                      <span
                        className={`history-badge ${
                          e.status === 1 ? "released" : "refunded"
                        }`}
                      >
                        {STATUS_LABELS[e.status]}
                      </span>
                      <span className="history-desc">{e.description}</span>
                      <span className="history-id">#{e.id}</span>
                    </div>
                  ))}
                </section>
              )}

              <div className="footer-bar">
                <button className="btn-refresh" onClick={load}>
                  ↻ Refresh
                </button>
                <div className="network-badge">
                  <span className="network-dot" />
                  {chain.name}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
