import { Transfer } from "../generated/pUSD/ERC20";
import { DepositWallet, TraderAgent } from "../generated/schema";

// Polymarket CLOB v2 "Path A": new trades route through a per-user DepositWallet
// (DW), not the Olas service safe, so OrderFilled.maker is the DW. The only thing
// that ties a DW to us is the just-in-time pUSD top-up (service safe -> DW) that
// precedes every buy. We index the GLOBAL pUSD Transfer stream and keep only the
// outflows from one of our tracked service safes, recording the DW -> safe link
// before the bet that needs it. Store-reads only; no eth_calls, no templates.
export function handleCollateralTransfer(event: Transfer): void {
  // Only care about outflows FROM one of our tracked service safes.
  let agent = TraderAgent.load(event.params.from);
  if (agent === null) return; // not one of our safes -> ignore (the common case)

  let to = event.params.to;
  if (TraderAgent.load(to) !== null) return; // safe -> safe transfer, not a DW
  if (DepositWallet.load(to) !== null) return; // already mapped (write-once)

  let dw = new DepositWallet(to);
  dw.traderAgent = agent.id;
  dw.blockNumber = event.block.number;
  dw.blockTimestamp = event.block.timestamp;
  dw.transactionHash = event.transaction.hash;
  dw.save();
}
