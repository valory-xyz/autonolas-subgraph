# Marketplace Scripts

Utility scripts for verifying and debugging marketplace subgraph data.

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
