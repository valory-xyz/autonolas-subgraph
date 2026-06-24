// Real-transaction replay test for the Path A (CLOB v2 DepositWallet) fix.
//
// Inputs below are decoded from real Polygon mainnet transactions:
//   TOP-UP  0x10b36e032ecca22e325564b1cdc99825687ecac56c7f704cac2476dc11a5a4c9  (block 88,031,656)
//   BET     0x4934f717cdcae21ac1e5a5d7b9baaf41959e8b86d785ef6b852b175c9d57902b  (block 88,031,681)
// Example service safe 0x28c51c... is a tracked TraderAgent (serviceId 48) in prod.
// The bet tx emits TWO OrderFilled logs; only the one where maker == our DW must
// attribute. outcomeIndex/conditionId are test fixtures (their real values come
// from CTF position-id math, irrelevant to maker->agent attribution).
import {
  assert,
  describe,
  test,
  clearStore,
  beforeEach,
  newMockEvent,
} from "matchstick-as/assembly/index";
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import { handleCollateralTransfer } from "../src/deposit-wallet";
import { handleOrderFilledV2 } from "../src/ctf-exchange-v2";
import { Transfer } from "../generated/pUSD/ERC20";
import { OrderFilled } from "../generated/CTFExchangeV2/CTFExchangeV2";
import { TraderAgent, TokenRegistry } from "../generated/schema";

// --- real on-chain values ---
const SAFE = Address.fromString("0x28c51c6c3792502cc23722fbbc48034e1dfc97e6");
const DW = Address.fromString("0x936d8efda21ffdd63fa89ce778a8712fc26d94d1");
const COUNTERPARTY = Address.fromString(
  "0x04dbe94fc549e2bfff09aec1cd9d02960adaf0fd",
);
const V2EX = Address.fromString("0xe111180000d2663c0091e4f400237545b87b996b");
const TOPUP_VALUE = BigInt.fromI32(1991983);
const REAL_TOKEN_ID = BigInt.fromString(
  "40196820721219747078785170367226792686176836348651324109748693849381175359322",
);
const MAKER_AMT = BigInt.fromI32(1979996); // pUSD paid by the DW maker (BUY)
const TAKER_AMT = BigInt.fromI32(2041233); // outcome shares received
const CONDITION_ID = Bytes.fromHexString(
  "0x1111111111111111111111111111111111111111111111111111111111111111",
);
const ZERO32 = Bytes.fromHexString(
  "0x0000000000000000000000000000000000000000000000000000000000000000",
);

function createTransferEvent(
  from: Address,
  to: Address,
  value: BigInt,
): Transfer {
  let event = changetype<Transfer>(newMockEvent());
  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("from", ethereum.Value.fromAddress(from)),
  );
  event.parameters.push(
    new ethereum.EventParam("to", ethereum.Value.fromAddress(to)),
  );
  event.parameters.push(
    new ethereum.EventParam("value", ethereum.Value.fromUnsignedBigInt(value)),
  );
  return event;
}

function createOrderFilledV2Event(
  maker: Address,
  taker: Address,
  side: i32,
  tokenId: BigInt,
  makerAmountFilled: BigInt,
  takerAmountFilled: BigInt,
  logIndex: i32,
): OrderFilled {
  let event = changetype<OrderFilled>(newMockEvent());
  event.logIndex = BigInt.fromI32(logIndex);
  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam("orderHash", ethereum.Value.fromFixedBytes(ZERO32)),
  );
  event.parameters.push(
    new ethereum.EventParam("maker", ethereum.Value.fromAddress(maker)),
  );
  event.parameters.push(
    new ethereum.EventParam("taker", ethereum.Value.fromAddress(taker)),
  );
  event.parameters.push(
    new ethereum.EventParam(
      "side",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(side)),
    ),
  );
  event.parameters.push(
    new ethereum.EventParam(
      "tokenId",
      ethereum.Value.fromUnsignedBigInt(tokenId),
    ),
  );
  event.parameters.push(
    new ethereum.EventParam(
      "makerAmountFilled",
      ethereum.Value.fromUnsignedBigInt(makerAmountFilled),
    ),
  );
  event.parameters.push(
    new ethereum.EventParam(
      "takerAmountFilled",
      ethereum.Value.fromUnsignedBigInt(takerAmountFilled),
    ),
  );
  event.parameters.push(
    new ethereum.EventParam("fee", ethereum.Value.fromUnsignedBigInt(BigInt.zero())),
  );
  event.parameters.push(
    new ethereum.EventParam("builder", ethereum.Value.fromFixedBytes(ZERO32)),
  );
  event.parameters.push(
    new ethereum.EventParam("metadata", ethereum.Value.fromFixedBytes(ZERO32)),
  );
  return event;
}

function setupTraderAgent(address: Address): void {
  let agent = new TraderAgent(address);
  agent.serviceId = BigInt.fromI32(48);
  agent.totalBets = 0;
  agent.totalTraded = BigInt.zero();
  agent.totalTradedSettled = BigInt.zero();
  agent.totalPayout = BigInt.zero();
  agent.totalExpectedPayout = BigInt.zero();
  agent.blockNumber = BigInt.fromI32(1);
  agent.blockTimestamp = BigInt.fromI32(1);
  agent.transactionHash = ZERO32;
  agent.save();
}

function setupTokenRegistry(tokenId: BigInt, outcomeIndex: i32): void {
  let id = Bytes.fromByteArray(Bytes.fromBigInt(tokenId));
  let registry = new TokenRegistry(id);
  registry.tokenId = tokenId;
  registry.conditionId = CONDITION_ID;
  registry.outcomeIndex = BigInt.fromI32(outcomeIndex);
  registry.transactionHash = ZERO32;
  registry.save();
}

describe("Path A - real transaction replay", () => {
  beforeEach(() => {
    clearStore();
  });

  test("Real top-up + bet: DW links to safe and the bet attributes to the safe", () => {
    // The safe is a registered TraderAgent (as on mainnet, serviceId 48).
    setupTraderAgent(SAFE);
    setupTokenRegistry(REAL_TOKEN_ID, 1);

    // 1) Replay the real top-up pUSD Transfer (safe -> DW), which precedes the bet.
    handleCollateralTransfer(createTransferEvent(SAFE, DW, TOPUP_VALUE));
    assert.fieldEquals(
      "DepositWallet",
      DW.toHexString(),
      "traderAgent",
      SAFE.toHexString(),
    );

    // 2) Replay the real bet's two OrderFilled logs.
    //    Log A: counterparty is maker, DW is taker -> must NOT attribute.
    handleOrderFilledV2(
      createOrderFilledV2Event(
        COUNTERPARTY,
        DW,
        0,
        REAL_TOKEN_ID,
        BigInt.fromI32(61237),
        TAKER_AMT,
        0,
      ),
    );
    //    Log B: our DW is the maker -> must attribute to the funding safe.
    handleOrderFilledV2(
      createOrderFilledV2Event(
        DW,
        V2EX,
        0,
        REAL_TOKEN_ID,
        MAKER_AMT,
        TAKER_AMT,
        1,
      ),
    );

    // Counterparty log produced no Bet.
    let counterpartyBetId = newMockEvent().transaction.hash
      .concat(Bytes.fromI32(0))
      .toHexString();
    assert.notInStore("Bet", counterpartyBetId);

    // DW-maker log produced a Bet attributed to the SAFE, with the real amounts.
    let betId = newMockEvent().transaction.hash
      .concat(Bytes.fromI32(1))
      .toHexString();
    assert.fieldEquals("Bet", betId, "bettor", SAFE.toHexString());
    assert.fieldEquals("Bet", betId, "amount", "1979996");
    assert.fieldEquals("Bet", betId, "shares", "2041233");
    assert.fieldEquals("Bet", betId, "isBuy", "true");

    // Aggregates land on the safe; the DW is never itself a TraderAgent.
    assert.fieldEquals("TraderAgent", SAFE.toHexString(), "totalBets", "1");
    assert.fieldEquals("TraderAgent", SAFE.toHexString(), "totalTraded", "1979996");
    assert.notInStore("TraderAgent", DW.toHexString());
    let participantId = SAFE.toHexString() + "_" + CONDITION_ID.toHexString();
    assert.fieldEquals("MarketParticipant", participantId, "totalBets", "1");
  });

  test("Bet maker that is neither a TraderAgent nor a known DW is dropped", () => {
    setupTraderAgent(SAFE);
    setupTokenRegistry(REAL_TOKEN_ID, 1);
    // No top-up recorded for COUNTERPARTY -> not a known DepositWallet.

    handleOrderFilledV2(
      createOrderFilledV2Event(
        COUNTERPARTY,
        V2EX,
        0,
        REAL_TOKEN_ID,
        MAKER_AMT,
        TAKER_AMT,
        1,
      ),
    );

    let betId = newMockEvent().transaction.hash
      .concat(Bytes.fromI32(1))
      .toHexString();
    assert.notInStore("Bet", betId);
  });
});
