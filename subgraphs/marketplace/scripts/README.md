# Marketplace Scripts

Utility scripts for verifying and debugging marketplace subgraph data.

## compare-subgraph-versions.js

Compares two subgraph versions to validate data integrity after upgrades.

### Usage

```bash
# Compare Base subgraph versions
node compare-subgraph-versions.js --network base --v1 v5_2_0 --v2 v6_0_0

# Compare Polygon subgraph versions
node compare-subgraph-versions.js --network polygon --v1 v5_2_0 --v2 v6_0_0

# Compare with on-chain verification (treats on-chain as source of truth)
node compare-subgraph-versions.js --network base --v1 v5_2_0 --v2 v6_0_0 --verify-onchain
```

### Output

- Sync status for both versions (block height, indexing errors)
- Global stats comparison (totalMechs, totalRequests, totalDeliveries)
- Mech entity differences (address, maxDeliveryRate, karma, etc.)
- PendingMechData entity count (should be 0 after full sync)
- **With --verify-onchain**: On-chain accuracy report for maxDeliveryRate

### On-Chain Verification

The `--verify-onchain` flag queries the actual mech contracts on-chain to verify `maxDeliveryRate` values. This helps identify:

- Which subgraph version has more accurate data
- Mechs where RPC calls may have failed in older versions
- Data discrepancies between subgraph and on-chain state

The on-chain value is treated as the **source of truth**.

**Rate limit handling:**
- Automatic retry with exponential backoff (3 retries)
- Request throttling (200ms between calls)
- Multiple RPC fallbacks per network (3 RPCs each)
- Custom RPC support via `--rpc` flag

```bash
# Use custom RPC (e.g., your own node or paid RPC)
node compare-subgraph-versions.js --network base --v1 v5_2_0 --v2 v6_0_0 --verify-onchain --rpc https://your-rpc.com
```

### Interpreting Results

- **V2 behind in blocks**: Differences may be due to sync lag, not bugs
- **maxDeliveryRate differences**: May indicate RPC call failures in old version
- **PendingMechData present**: Normal during sync, consumed when MechMarketplace CreateMech fires
- **RPC errors**: Some mechs may not have the expected interface (older mech versions)

---

## check-sync-progress.js

Quick sync status check for marketplace subgraphs across networks.

### Usage

```bash
# Check all networks with default versions
node check-sync-progress.js

# Check specific version across all networks
node check-sync-progress.js --version v6_0_0

# Check specific network
node check-sync-progress.js --network base

# Continuous monitoring (30s interval)
node check-sync-progress.js --watch
```

### Output

Shows for each network:
- Block height
- Mech count
- PendingMechData count (should be 0)
- Indexing error status

---

## compare-global-metrics.js

Compares Global entity metrics between two subgraph versions to validate data integrity.

### Usage

```bash
# Compare Base subgraph versions
node compare-global-metrics.js --network base --v1 v5_2_0 --v2 v6_0_0

# Compare Polygon subgraph versions
node compare-global-metrics.js --network polygon --v1 v5_2_0 --v2 v6_0_0
```

### Output

- Sync status for both versions (block height, indexing errors)
- Side-by-side comparison of 13 Global entity fields (`totalPredictRequests` is not compared)
- Match/diff status for each field
- Summary with total matches and differences

### Fields Compared

| Field | Description |
|-------|-------------|
| totalMechs | Total marketplace mechs created |
| totalMarketplaceRequests | On-chain marketplace requests |
| totalMarketplaceDeliveries | On-chain marketplace deliveries |
| totalMarketplaceDeliveriesWithSignatures | Off-chain signed deliveries |
| totalLegacyRequests | Legacy AgentMech requests |
| totalLegacyDeliveries | Legacy AgentMech deliveries |
| totalLegacyTransactions | Legacy transaction count |
| totalLegacyAtaTransactions | Legacy ATA transactions |
| totalRequests | Combined request count |
| totalDeliveries | Combined delivery count |
| totalTransactions | Combined transaction count |
| totalAtaTransactions | Combined ATA transactions |
| totalFeesPaidUSD | Total fees in USD |

### Notes

- `totalFeesPaidUSD` may have small differences due to price feed timing
- Exit code 0 if all metrics match, 1 if differences found

---

## verify-subgraph-data.js

Cross-verifies subgraph entity data against on-chain contract values.

### Data Flow

```
CLI args (--network, --subgraph-url)
       |
       v
  Network Config (RPC, subgraph URL, karma address)
       |
       v
  Fetch all mechs from subgraph (GraphQL)
       |
       v
  For each mech:
    +-- On-chain: Karma.mapMechKarma(mech.address)
    +-- On-chain: Mech.maxDeliveryRate()
    +-- On-chain: Mech.numTotalRequests()
    +-- On-chain: Mech.numTotalDeliveries()
       |
       v
  Compare subgraph vs on-chain (string comparison)
       |
       v
  Console output (colored MATCH/DIFF/ERR)
```

### Verification Fields

| Subgraph Field | On-Chain Call | Contract | Notes |
|----------------|---------------|----------|-------|
| `Mech.karma` | `mapMechKarma(address)` | Karma | int256, can be negative |
| `Mech.maxDeliveryRate` | `maxDeliveryRate()` | Mech | uint256 |
| `Mech.receivedRequests` | `numTotalRequests()` | Mech | uint256 |
| `Mech.totalDeliveriesTransactions` | `numTotalDeliveries()` | Mech | uint256 |

### Contract Addresses

| Network | Karma Contract | RPC |
|---------|---------------|-----|
| gnosis | 0x2C602C7B590ABFc148d8c7c5e4d58c56Be1d304a | https://rpc.gnosischain.com |
| polygon | 0x7fc0ddf4DFB61CfA5519db2A5eE7B2Eb02De0140 | https://polygon-rpc.com |
| base | 0x1f84F8F70dE0651C2d51Bf8850FE9D0289Ba3B3A | https://mainnet.base.org |
| optimism | 0xd2ff4Cf0927c3cFbF3BB27391044dBaf6f4ca7b9 | https://mainnet.optimism.io |

### Why String Comparison

Karma is stored as int256 (signed integer) which can be negative. JavaScript BigInt comparison works correctly, but converting to strings before comparison ensures consistent handling across all field types and simplifies the comparison logic.

### Usage

```bash
# Verify Gnosis staging subgraph
node verify-subgraph-data.js --network gnosis

# Verify with custom subgraph URL
node verify-subgraph-data.js --network polygon --subgraph-url https://custom-url.com/subgraph
```
