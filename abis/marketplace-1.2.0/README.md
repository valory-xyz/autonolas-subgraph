# Marketplace 1.2.0 source ABIs

ABI-only compilation of `valory-xyz/autonolas-marketplace` at
`64d8dba33e60860644bdda6f57ffc98057fa27e7` (the 5 November 2026 contract review).
These are source artifacts, not proof of a deployment or final release approval.

Compiler: `solc 0.8.30+commit.73712a01`, optimizer enabled with 1,000,000 runs,
EVM target `prague`. Imports use the pinned `gnosis-mech` submodule
`f6fa16551dba14fa8310fce0fd24c40be58fc7d1` and the contract repository's lockfile
versions: `@openzeppelin/contracts@4.9.6`, `@gnosis.pm/safe-contracts@1.3.0`,
`@account-abstraction/contracts@0.5.0`. Compilation requests ABIs only;
it does not produce or validate deployable bytecode.

## Reproduce

In a clean contract checkout, check out the revision above and run
`git submodule update --init lib/gnosis-mech`. Install the compiler/imports
in a separate temporary directory:

```sh
npm install --prefix /tmp/marketplace-abi-tools --ignore-scripts --no-audit --no-fund solc@0.8.30 @openzeppelin/contracts@4.9.6 @gnosis.pm/safe-contracts@1.3.0 @account-abstraction/contracts@0.5.0
node scripts/generate-marketplace-release-abis.cjs /path/to/autonolas-marketplace /tmp/marketplace-abi-tools
npm run test:marketplace-abis
```

Run the last two commands from the indexer repository root. The generator
checks the source revision, dependency versions and submodule before writing
these six ABI arrays. `MechMarketplaceV2.json` keeps the indexer's existing
binding name; the contract's release version is 1.2.0.

## Indexer compatibility and activation

Graph manifests and the Marketplace squid typegen use the release Marketplace
and native mech ABIs. All previously consumed events and callable interfaces
are preserved exactly, so these ABIs also decode older V2 deployments. V1
sources, block boundaries and historical factory ABIs remain separate.
Indexers use emitted request IDs and per-delivery charges: explicit nonces and
deadlines do not require calldata-derived IDs or fees. No signed-cap field is
added; the advertised maximum and actual charge retain their existing meanings.

The selected replacement factories have these verified creation events:

| Contract | Creation event | Payment / raw fee units |
| --- | --- | --- |
| MechFactoryFixedPriceNative | `CreateMechFixedPriceNative(address,uint256,uint256)` | Native token / wei |
| MechFactoryFixedPriceTokenUSDC | `CreateMechFixedPriceToken(address,uint256,uint256)` | USDC / 6 decimals |

Both events index `mech` and `serviceId`; `maxDeliveryRate` is unindexed.
The replacement USDC factory does **not** emit `CreateMechFixedPriceTokenUSDC`.
Existing Graph Token factory handlers and the squid's `CreateMechFixedPriceToken`
decoder accept its layout; its payment type must still be configured as USDC,
not OLAS, based on its verified deployment.

Before activation, obtain each factory address and creation block, confirm
release-code parity, and add a distinct source to each affected Graph manifest
and squid chain configuration. Use these release factory ABIs for new sources;
retain all historical sources. Add the corresponding address-to-payment-type,
fee-unit and mech-template mappings. Do not replace old addresses or infer a
currency from the emitted event name. No speculative addresses or start blocks
are included here. Validate source discovery and subscriptions with the real
configuration before deployment, replay/backfill or consumer cutover.
