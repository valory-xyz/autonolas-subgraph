import { graphEventId, type EventMeta, type IEntityCache } from "@olas/squid-shared";
import type { EventParams } from "./abi/abi.support";
import type * as olas from "./abi/OLAS/events";
import { Token, TokenHolder, Transfer } from "./model";
import { ZERO_ADDRESS } from "./constants";

export const eventId = graphEventId;

async function getOrCreateToken(
  cache: IEntityCache,
  address: string,
): Promise<Token> {
  return (
    (await cache.get(Token, address)) ??
    new Token({ id: address, balance: 0n, holderCount: 0 })
  );
}

async function getOrCreateTokenHolder(
  cache: IEntityCache,
  tokenAddress: string,
  address: string,
): Promise<TokenHolder> {
  return (
    (await cache.get(TokenHolder, address)) ??
    new TokenHolder({ id: address, token: tokenAddress, balance: 0n })
  );
}

/** Mirror tokenomics-l2: amounts remain raw token units; zero address is never a holder. */
export async function handleTransfer(
  cache: IEntityCache,
  meta: EventMeta,
  params: EventParams<typeof olas.Transfer>,
): Promise<void> {
  const from = params.from.toLowerCase();
  const to = params.to.toLowerCase();
  const tokenAddress = meta.address.toLowerCase();
  const amount = params.amount;
  cache.set(
    Transfer,
    new Transfer({
      id: eventId(meta),
      from,
      to,
      value: amount,
      blockNumber: meta.blockNumber,
      blockTimestamp: meta.blockTimestamp,
      transactionHash: meta.txHash,
    }),
  );
  const token = await getOrCreateToken(cache, tokenAddress);
  if (from === ZERO_ADDRESS) token.balance += amount;
  else if (to === ZERO_ADDRESS) token.balance -= amount;

  if (from !== ZERO_ADDRESS) {
    const holder = await getOrCreateTokenHolder(cache, tokenAddress, from);
    const oldBalance = holder.balance;
    holder.balance -= amount;
    if (holder.balance < 0n)
      throw new Error(`Token holder ${from} balance would become negative at ${meta.blockNumber}`);
    cache.set(TokenHolder, holder);
    if (oldBalance > 0n && holder.balance === 0n) token.holderCount--;
  }
  // Load after saving the sender so a self-transfer restores the same cached row.
  if (to !== ZERO_ADDRESS) {
    const holder = await getOrCreateTokenHolder(cache, tokenAddress, to);
    const oldBalance = holder.balance;
    holder.balance += amount;
    cache.set(TokenHolder, holder);
    if (oldBalance === 0n && holder.balance > 0n) token.holderCount++;
  }
  cache.set(Token, token);
}
