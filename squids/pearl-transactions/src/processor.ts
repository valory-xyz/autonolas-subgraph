import { DataSourceBuilder, FieldSelection } from "@subsquid/evm-stream";
import type { PortalClientOptions } from "@subsquid/portal-client";
import * as serviceRegistry from "./abi/ServiceRegistryL2/events";
import * as srtu from "./abi/ServiceRegistryTokenUtility/events";
import * as stakingFactory from "./abi/StakingFactory/events";
import * as stakingProxy from "./abi/StakingProxy/events";
import * as safe from "./abi/GnosisSafe/events";
import * as erc20 from "./abi/ERC20Detailed/events";
import {
  CHAIN,
  SERVICE_REGISTRY_L2,
  SRTU,
  STAKING_FACTORY,
  ERC20_TOKENS,
  START_BLOCK,
} from "./constants";

// SQD Portal endpoint. The public portal needs no key but is aggressively
// rate-limited — a backfill run against it spends most of its time in 10s
// HTTP 529 ("Service is overloaded") backoffs. Production must set both
// vars to the private portal; the key goes in the x-api-key header. Keep
// the private URL out of the repo — infra sets it via env.
const portalUrl = process.env.SQD_PORTAL_URL ?? CHAIN.portalDataset;
const portal: string | PortalClientOptions = process.env.SQD_PORTAL_API_KEY
  ? {
      url: portalUrl,
      http: { headers: { "x-api-key": process.env.SQD_PORTAL_API_KEY } },
    }
  : portalUrl;

// The modern SDK has no implicit field defaults: every field the handlers
// read must be listed here, or the property does not exist at runtime.
// `logIndex` and `block.number` are always-present required fields and are
// deliberately NOT listed (listing them is a type error).
const fields = {
  block: { timestamp: true },
  log: { address: true, topics: true, data: true, transactionHash: true },
} satisfies FieldSelection;

export type Fields = typeof fields;

export const dataSource = new DataSourceBuilder()
  .setPortal(portal)
  .setBlockRange({ from: START_BLOCK })
  .setFields(fields)

  // --- Registry: service lifecycle + NFT custody ----------------------
  .addLog({
    where: {
      address: [SERVICE_REGISTRY_L2],
      topic0: [
        serviceRegistry.RegisterInstance.topic,
        serviceRegistry.ActivateRegistration.topic,
        serviceRegistry.CreateMultisigWithAgents.topic,
        serviceRegistry.Transfer.topic, // service NFT custody changes
        serviceRegistry.TerminateService.topic,
        serviceRegistry.OperatorUnbond.topic,
      ],
    },
  })

  // --- Service bond deposits / refunds --------------------------------
  .addLog({
    where: {
      address: [SRTU],
      topic0: [srtu.TokenDeposit.topic, srtu.TokenRefund.topic],
    },
  })

  // --- Staking proxy creation -----------------------------------------
  .addLog({
    where: {
      address: [STAKING_FACTORY],
      topic0: [stakingFactory.InstanceCreated.topic],
    },
  })

  // --- Staking proxy events (replaces the StakingProxy template) ------
  //
  // graph-node spawned a template per proxy at InstanceCreated. SQD has no
  // templates, so subscribe by topic with NO address filter and discard
  // non-tracked proxies in the handler against the StakingContract set.
  // Measured: 0 logs over the 50k blocks from START_BLOCK (Polygon staking
  // activity begins later in the range), so the unfiltered cost here is
  // nil and no address filter is worth maintaining.
  .addLog({
    where: {
      topic0: [
        stakingProxy.ServiceStaked.topic,
        stakingProxy.RewardClaimed.topic,
        stakingProxy.ServiceUnstaked.topic,
        stakingProxy.ServiceForceUnstaked.topic,
        stakingProxy.ServicesEvicted.topic,
      ],
    },
  })

  // --- Safe events (replaces the Safe template) -----------------------
  //
  // Same trick, and measured before committing to it: over 50k Polygon
  // blocks from START_BLOCK an unfiltered 6-topic Safe subscription is
  // 4.23 logs/block, versus 133 logs/block for the address-filtered ERC-20
  // sources below — the templates were never the expensive half.
  //
  // ExecutionSuccess and ExecutionFromModuleSuccess are deliberately NOT
  // subscribed. Their subgraph handlers are documented no-ops (the events
  // carry no amount or recipient, so native-out needs trace handlers), yet
  // they are 97% of Safe log volume: dropping them takes the subscription
  // from 4.23 to 0.12 logs/block, and distinct addresses seen from 39,817
  // to 168, for zero behaviour change. A graph-node template subscribes
  // per contract and cannot make that choice; SQD subscribes per topic.
  .addLog({
    where: {
      topic0: [
        safe.SafeReceived.topic, // native inbound
        safe.AddedOwner.topic,
        safe.RemovedOwner.topic,
        safe.ChangedThreshold.topic,
      ],
    },
  })

  // --- ERC-20 transfers -----------------------------------------------
  //
  // The genuinely expensive source (~133 logs/block on Polygon: OLAS, WPOL,
  // USDC, USDC.e, pUSD). Unavoidable — it is the ledger. This is the same
  // volume that held graph-node to ~5 blk/s through the USDC.e-dense range.
  .addLog({
    where: {
      address: ERC20_TOKENS,
      topic0: [erc20.Transfer.topic],
    },
  })

  .build();
