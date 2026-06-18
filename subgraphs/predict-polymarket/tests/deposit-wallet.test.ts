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
import { Transfer } from "../generated/pUSD/ERC20";
import { TraderAgent } from "../generated/schema";

const SAFE_1 = Address.fromString("0x1111111111111111111111111111111111111111");
const SAFE_2 = Address.fromString("0x2222222222222222222222222222222222222222");
const DW_1 = Address.fromString("0xaaaa0000000000000000000000000000000000aa");
const RANDOM = Address.fromString("0x9999999999999999999999999999999999999999");

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

function setupTraderAgent(address: Address): void {
  let agent = new TraderAgent(address);
  agent.serviceId = BigInt.fromI32(1);
  agent.totalBets = 0;
  agent.totalTraded = BigInt.zero();
  agent.totalTradedSettled = BigInt.zero();
  agent.totalPayout = BigInt.zero();
  agent.totalExpectedPayout = BigInt.zero();
  agent.blockNumber = BigInt.fromI32(1);
  agent.blockTimestamp = BigInt.fromI32(1);
  agent.transactionHash = Bytes.fromHexString(
    "0x1234567890123456789012345678901234567890123456789012345678901234",
  );
  agent.save();
}

describe("PUSD - handleCollateralTransfer (DepositWallet mapping)", () => {
  beforeEach(() => {
    clearStore();
  });

  test("Records a DepositWallet when a service safe tops up a DW", () => {
    setupTraderAgent(SAFE_1);

    handleCollateralTransfer(
      createTransferEvent(SAFE_1, DW_1, BigInt.fromI32(1992495)),
    );

    assert.fieldEquals(
      "DepositWallet",
      DW_1.toHexString(),
      "traderAgent",
      SAFE_1.toHexString(),
    );
  });

  test("Ignores transfers whose sender is not a TraderAgent", () => {
    // RANDOM is not a registered safe -> the common case for the global stream.
    handleCollateralTransfer(
      createTransferEvent(RANDOM, DW_1, BigInt.fromI32(1000000)),
    );

    assert.notInStore("DepositWallet", DW_1.toHexString());
  });

  test("Ignores safe -> safe transfers (recipient is a TraderAgent)", () => {
    setupTraderAgent(SAFE_1);
    setupTraderAgent(SAFE_2);

    handleCollateralTransfer(
      createTransferEvent(SAFE_1, SAFE_2, BigInt.fromI32(1000000)),
    );

    assert.notInStore("DepositWallet", SAFE_2.toHexString());
  });

  test("Is write-once: a later transfer does not re-point an existing DW", () => {
    setupTraderAgent(SAFE_1);
    setupTraderAgent(SAFE_2);

    handleCollateralTransfer(
      createTransferEvent(SAFE_1, DW_1, BigInt.fromI32(1000000)),
    );
    // A second (spurious) funding of the same DW by a different safe must not win.
    handleCollateralTransfer(
      createTransferEvent(SAFE_2, DW_1, BigInt.fromI32(2000000)),
    );

    assert.fieldEquals(
      "DepositWallet",
      DW_1.toHexString(),
      "traderAgent",
      SAFE_1.toHexString(),
    );
  });
});
