import { describe, expect, it } from "vitest";
import { FundsCategory } from "../src/model";
import {
  BondQueue,
  ClassifyInput,
  TrackedInfo,
  classifyTransfer,
  dayTimestamp,
  evictionRowId,
  eventId,
  mergeUnique,
  pushUnique,
} from "../src/logic";
import {
  ROLE_AGENT,
  ROLE_AGENT_EOA,
  ROLE_MASTER,
  ROLE_MASTER_EOA,
  ROLE_STAKING,
} from "../src/constants";

const MASTER = "0x1111111111111111111111111111111111111111";
const MASTER2 = "0x1212121212121212121212121212121212121212";
const MASTER_EOA = "0x2222222222222222222222222222222222222222";
const AGENT = "0x3333333333333333333333333333333333333333";
const AGENT_EOA = "0x4444444444444444444444444444444444444444";
const STAKING = "0x5555555555555555555555555555555555555555";
const STRANGER = "0x9999999999999999999999999999999999999999";
const SERVICE = "42";

const tracked = (
  id: string,
  role: string,
  masterSafeId: string | null = MASTER,
  serviceId: string | null = null
): TrackedInfo => ({ id, role, masterSafeId, serviceId });

const input = (over: Partial<ClassifyInput>): ClassifyInput => ({
  fromTracked: null,
  toTracked: null,
  fromIsSrtu: false,
  toIsSrtu: false,
  fromIsServiceRegistry: false,
  toMasterSetupTransferSeen: false,
  ...over,
});

describe("classifyTransfer", () => {
  it("returns null when neither side is tracked (the chain-wide noise case)", () => {
    expect(classifyTransfer(input({}))).toBeNull();
  });

  it("suppresses Master <-> SRTU legs so bonds are not double-counted", () => {
    // The canonical row is the SEMANTIC BondMovement written by the SRTU
    // handler; a RAW_TRANSFER row here would double-count.
    expect(
      classifyTransfer(
        input({ fromTracked: tracked(MASTER, ROLE_MASTER), toIsSrtu: true })
      )
    ).toBeNull();
    expect(
      classifyTransfer(
        input({ fromIsSrtu: true, toTracked: tracked(MASTER, ROLE_MASTER) })
      )
    ).toBeNull();
  });

  it("classifies Master -> Agent Safe as MASTER_TO_AGENT and carries the agent", () => {
    const r = classifyTransfer(
      input({
        fromTracked: tracked(MASTER, ROLE_MASTER),
        toTracked: tracked(AGENT, ROLE_AGENT, MASTER, SERVICE),
      })
    );
    expect(r?.category).toBe(FundsCategory.MASTER_TO_AGENT);
    expect(r?.agentSafeId).toBe(AGENT);
    expect(r?.serviceId).toBe(SERVICE);
  });

  it("classifies Master -> Agent EOA as MASTER_TO_AGENT with no agent safe", () => {
    const r = classifyTransfer(
      input({
        fromTracked: tracked(MASTER, ROLE_MASTER),
        toTracked: tracked(AGENT_EOA, ROLE_AGENT_EOA, MASTER, SERVICE),
      })
    );
    expect(r?.category).toBe(FundsCategory.MASTER_TO_AGENT);
    expect(r?.agentSafeId).toBeNull();
  });

  it("classifies Agent -> Master as AGENT_TO_MASTER (OLAS split happens later)", () => {
    const r = classifyTransfer(
      input({
        fromTracked: tracked(AGENT, ROLE_AGENT, MASTER, SERVICE),
        toTracked: tracked(MASTER, ROLE_MASTER),
      })
    );
    expect(r?.category).toBe(FundsCategory.AGENT_TO_MASTER);
    expect(r?.serviceId).toBe(SERVICE);
  });

  it("classifies staking proxy -> Agent as STAKING_REWARD_CLAIM", () => {
    const r = classifyTransfer(
      input({
        fromTracked: tracked(STAKING, ROLE_STAKING, null),
        toTracked: tracked(AGENT, ROLE_AGENT, MASTER, SERVICE),
      })
    );
    expect(r?.category).toBe(FundsCategory.STAKING_REWARD_CLAIM);
  });

  describe("inbound to a Master Safe", () => {
    it("tags the first Master EOA hop SAFE_SETUP_TRANSFER", () => {
      const r = classifyTransfer(
        input({
          fromTracked: tracked(MASTER_EOA, ROLE_MASTER_EOA),
          toTracked: tracked(MASTER, ROLE_MASTER),
          toMasterSetupTransferSeen: false,
        })
      );
      expect(r?.category).toBe(FundsCategory.SAFE_SETUP_TRANSFER);
    });

    it("tags subsequent Master EOA hops MASTER_FUNDING_IN", () => {
      const r = classifyTransfer(
        input({
          fromTracked: tracked(MASTER_EOA, ROLE_MASTER_EOA),
          toTracked: tracked(MASTER, ROLE_MASTER),
          toMasterSetupTransferSeen: true,
        })
      );
      expect(r?.category).toBe(FundsCategory.MASTER_FUNDING_IN);
    });

    it("tags registry dust OTHER, not a user deposit", () => {
      // ServiceRegistryL2 sends 1-wei native refunds during terminate /
      // unbond; those are protocol bookkeeping.
      const r = classifyTransfer(
        input({
          toTracked: tracked(MASTER, ROLE_MASTER),
          fromIsServiceRegistry: true,
        })
      );
      expect(r?.category).toBe(FundsCategory.OTHER);
    });

    it("surfaces the sender on Master -> Master so both balances move", () => {
      const r = classifyTransfer(
        input({
          fromTracked: tracked(MASTER2, ROLE_MASTER, MASTER2),
          toTracked: tracked(MASTER, ROLE_MASTER),
        })
      );
      expect(r?.category).toBe(FundsCategory.MASTER_FUNDING_IN);
      expect(r?.masterSafeId).toBe(MASTER);
      expect(r?.senderMasterId).toBe(MASTER2);
    });

    it("treats an unknown sender as MASTER_FUNDING_IN with no sender debit", () => {
      const r = classifyTransfer(
        input({ toTracked: tracked(MASTER, ROLE_MASTER) })
      );
      expect(r?.category).toBe(FundsCategory.MASTER_FUNDING_IN);
      expect(r?.senderMasterId).toBeNull();
    });
  });

  it("classifies Master -> stranger as MASTER_WITHDRAWAL", () => {
    const r = classifyTransfer(
      input({ fromTracked: tracked(MASTER, ROLE_MASTER) })
    );
    expect(r?.category).toBe(FundsCategory.MASTER_WITHDRAWAL);
  });

  it("classifies Agent <-> unknown as app interactions", () => {
    expect(
      classifyTransfer(
        input({ fromTracked: tracked(AGENT, ROLE_AGENT, MASTER, SERVICE) })
      )?.category
    ).toBe(FundsCategory.AGENT_TO_APP);
    expect(
      classifyTransfer(
        input({ toTracked: tracked(AGENT, ROLE_AGENT, MASTER, SERVICE) })
      )?.category
    ).toBe(FundsCategory.APP_TO_AGENT);
  });

  it("keeps an unmatched tracked side as OTHER rather than dropping it", () => {
    const r = classifyTransfer(
      input({ fromTracked: tracked(MASTER_EOA, ROLE_MASTER_EOA, MASTER) })
    );
    expect(r?.category).toBe(FundsCategory.OTHER);
    expect(r?.masterSafeId).toBe(MASTER);
  });

  it("prefers MASTER_TO_AGENT over the plain Master-outbound branch", () => {
    // Branch order is load-bearing: a Master -> Agent transfer must not fall
    // through to MASTER_WITHDRAWAL.
    const r = classifyTransfer(
      input({
        fromTracked: tracked(MASTER, ROLE_MASTER),
        toTracked: tracked(AGENT, ROLE_AGENT, MASTER, SERVICE),
      })
    );
    expect(r?.category).not.toBe(FundsCategory.MASTER_WITHDRAWAL);
  });
});

describe("BondQueue", () => {
  const TX = "0xabc";

  it("dequeues in FIFO order", () => {
    const q = new BondQueue();
    q.enqueue(TX, "row-1");
    q.enqueue(TX, "row-2");
    expect(q.dequeue(TX)).toBe("row-1");
    expect(q.dequeue(TX)).toBe("row-2");
    expect(q.dequeue(TX)).toBeNull();
  });

  it("returns null for a tx with no enqueued rows", () => {
    // A registry event without a matching SRTU event: a natively-secured
    // service that never touches the SRTU. Not an error.
    expect(new BondQueue().dequeue(TX)).toBeNull();
  });

  it("keeps transactions isolated from one another", () => {
    const q = new BondQueue();
    q.enqueue(TX, "row-1");
    expect(q.dequeue("0xdef")).toBeNull();
    expect(q.dequeue(TX)).toBe("row-1");
  });

  it("attributes an agent bond at most once per (tx, service)", () => {
    // RegisterInstance fires once per agent instance, but
    // registerAgentsTokenDeposit emits a single combined TokenDeposit.
    const q = new BondQueue();
    q.enqueue(TX, "row-1");
    q.enqueue(TX, "row-2");
    expect(q.dequeueAgentBondOnce(TX, 42n)).toBe("row-1");
    expect(q.dequeueAgentBondOnce(TX, 42n)).toBeNull();
    // A different service in the same tx still gets its own row.
    expect(q.dequeueAgentBondOnce(TX, 43n)).toBe("row-2");
  });

  it("clears all state", () => {
    const q = new BondQueue();
    q.enqueue(TX, "row-1");
    q.clear();
    expect(q.dequeue(TX)).toBeNull();
  });
});

describe("dayTimestamp", () => {
  it("buckets to UTC midnight", () => {
    // 2026-09-04T08:16:01Z -> 2026-09-04T00:00:00Z
    expect(dayTimestamp(1788509761n)).toBe(1788480000n);
  });

  it("is idempotent on an exact midnight", () => {
    expect(dayTimestamp(1788480000n)).toBe(1788480000n);
  });
});

describe("id helpers", () => {
  it("builds event ids from tx hash and log index", () => {
    expect(eventId("0xabc", 7)).toBe("0xabc-7");
  });

  it("keeps the eviction slot a separate segment", () => {
    // `logIndex + i` would collide with another event in the same tx whose
    // logIndex falls in the consumed range.
    expect(evictionRowId("0xabc", 3, 1)).toBe("0xabc-3-1");
    expect(evictionRowId("0xabc", 3, 1)).not.toBe(eventId("0xabc", 4));
  });
});

describe("dedupe helpers", () => {
  it("pushUnique appends only new values", () => {
    expect(pushUnique([1, 2], 3)).toEqual([1, 2, 3]);
    expect(pushUnique([1, 2], 2)).toEqual([1, 2]);
  });

  it("mergeUnique unions without duplicates and keeps order", () => {
    expect(mergeUnique([1, 2], [2, 3])).toEqual([1, 2, 3]);
  });
});
