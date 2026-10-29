# Marketplace V1 event check — 26 October 2026

The first #140 investigation task has been run. **No V1-only request or delivery events were returned on any of the five candidate chains**, from each configured V2 start block through the pinned finalized block below. No manifests were changed by this investigation.

| Chain | Inclusive block range | Successful provider | Queries | V1 matches |
| --- | --- | --- | --- | --- |
| Polygon | 81,028,558–96,204,676 | `https://polygon.gateway.tenderly.co` | 2, one per topic | 0 |
| Optimism | 145,788,454–158,706,176 | `https://optimism.gateway.tenderly.co` | 1, OR topic filter | 0 |
| Ethereum | 24,427,441–26,276,339 | `https://mainnet.gateway.tenderly.co` | 1, OR topic filter | 0 |
| Arbitrum | 430,646,886–518,416,640 | `https://arb1.arbitrum.io/rpc` | 18: 9 contiguous ranges per topic | 0 |
| Celo | 58,841,368–81,110,247 | `https://celo.gateway.tenderly.co` | 1, OR topic filter | 0 |

Optimism's result was also obtained from `https://mainnet.optimism.io`. Chain IDs were checked, proxy code was present at each upper bound, and the pinned block hashes were re-read and matched. A local coverage check verified that both topics cover every block in each stated range without gaps or overlaps. Results remain evidence from public providers, not an independent local-node reconstruction.

## Filters and evidence

The [machine-readable results](results.json) record proxy addresses, topic hashes, finalized block hashes, exact successful query ranges, counts, empty result arrays and supplementary layout checks.

- `MarketplaceRequest(address,address,uint256,bytes32[])`: `0x5d60556939d4ab71b3129033c865bf7e828306916fd94fd35019d3d530eb36b3`
- `Deliver(address,address,bytes32,uint256,bytes)`: `0xb0d013658abb05dd269ff3ab257175d5ae3fa4107d4e142abd96e947cd5cb06f`

Each successful request used `eth_getLogs` with the proxy as `address`, hexadecimal inclusive `fromBlock`/`toBlock`, and `topics: [[topic1, topic2]]` (OR), or `topics: [topic]` for the separate-topic requests. Arbitrum pages are at most 10,000,000 blocks each.

Some initial public endpoints rejected archive access or block ranges. Those failed requests are not used as absence evidence. Only successful requests with complete coverage appear in the main `checks` list.

## Shared-signature delivery layout

`MarketplaceDelivery(address,address[],uint256,bytes32[],bool[])` has the same topic0 in V1 and V2. V1 has three topics because `requesters` is indexed; V2 has two. The V1-only filters above do not test this distinction.

- **Polygon:** sampled blocks 96,104,677–96,204,676 returned 155 events, all with two topics (V2 layout). Example transaction: `0x2c7903d4df626c729888357ccccac9cb70778d15c36f09f02cf18abcb59918f1`.
- **Ethereum, Arbitrum, Celo:** complete queries for this shared signature over the table's ranges returned no events. There is no delivery sample to decode there.
- **Optimism:** after broad-query result caps and rate limiting, the official RPC returned 688 events in blocks 154,000,000–154,009,999, all with two topics (V2 layout). Example transaction: `0xe12bedd2ebbf222b2340a7663729219b483257f1ec61c878a2dcbad5383909b6`. Earlier unsuccessful attempts are retained in the evidence; the final sample completes the representative layout check.

## Next step

The V1-only absence check supports the planned source removal, together with the deployment-source evidence in the plan. Proceed with the five manifest removals and their coverage regressions. Preserve Gnosis/Base historical boundaries. No new contract deployment is needed for this work.
