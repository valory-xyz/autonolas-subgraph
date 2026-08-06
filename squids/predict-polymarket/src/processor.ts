import { DataSourceBuilder, FieldSelection } from "@subsquid/evm-stream";
import type { PortalClientOptions } from "@subsquid/portal-client";
import * as serviceRegistry from "./abi/ServiceRegistryL2/events";
import * as conditionalTokens from "./abi/ConditionalTokens/events";
import * as oo from "./abi/OptimisticOracleV3/events";
import * as uma from "./abi/UmaCtfAdapter/events";
import * as negRisk from "./abi/NegRiskAdapter/events";
import * as ctfExchange from "./abi/CTFExchange/events";
import * as ctfExchangeV2 from "./abi/CTFExchangeV2/events";
import * as collateralAdapter from "./abi/CtfCollateralAdapter/events";
import * as factory from "./abi/DepositWalletFactory/events";
import {
  SERVICE_REGISTRY_L2,
  CONDITIONAL_TOKENS,
  OPTIMISTIC_ORACLE_V3,
  UMA_CTF_ADAPTER,
  NEG_RISK_ADAPTER,
  CTF_EXCHANGE_V1,
  NEG_RISK_CTF_EXCHANGE_V1,
  CTF_EXCHANGE_V2,
  NEG_RISK_CTF_EXCHANGE_V2,
  CTF_COLLATERAL_ADAPTERS,
  DEPOSIT_WALLET_FACTORY,
  START_BLOCK,
  SERVICE_REGISTRY_START,
  V2_CUTOVER_START,
  ADAPTERS_START,
} from "./constants";

// SQD Portal endpoint. The public portal needs no key; the paid private
// portal is selected by overriding both vars (key goes in the x-api-key
// header). Keep the private URL out of the repo — infra sets it via env.
const portalUrl =
  process.env.SQD_PORTAL_URL ??
  "https://portal.sqd.dev/datasets/polygon-mainnet";
const portal: string | PortalClientOptions = process.env.SQD_PORTAL_API_KEY
  ? {
      url: portalUrl,
      http: { headers: { "x-api-key": process.env.SQD_PORTAL_API_KEY } },
    }
  : portalUrl;

// The modern SDK has no implicit field defaults: every field the handlers
// read must be listed here, or the property does not exist at runtime.
const fields = {
  block: { timestamp: true },
  log: { address: true, topics: true, data: true, transactionHash: true },
} satisfies FieldSelection;

export type Fields = typeof fields;

export const dataSource = new DataSourceBuilder()
  .setPortal(portal)
  .setBlockRange({ from: START_BLOCK })
  .setFields(fields)
  .addLog({
    where: {
      address: [SERVICE_REGISTRY_L2],
      topic0: [
        serviceRegistry.RegisterInstance.topic,
        serviceRegistry.CreateMultisigWithAgents.topic,
      ],
    },
    range: { from: SERVICE_REGISTRY_START },
  })
  .addLog({
    where: {
      address: [CONDITIONAL_TOKENS],
      topic0: [
        conditionalTokens.ConditionPreparation.topic,
        conditionalTokens.PayoutRedemption.topic,
      ],
    },
  })
  .addLog({
    where: {
      address: [OPTIMISTIC_ORACLE_V3],
      topic0: [oo.QuestionInitialized.topic, oo.QuestionResolved.topic],
    },
  })
  .addLog({
    where: {
      address: [UMA_CTF_ADAPTER],
      topic0: [uma.QuestionInitialized.topic, uma.QuestionResolved.topic],
    },
  })
  .addLog({
    where: {
      address: [NEG_RISK_ADAPTER],
      topic0: [
        negRisk.QuestionPrepared.topic,
        negRisk.OutcomeReported.topic,
        negRisk.PayoutRedemption.topic,
      ],
    },
  })
  // v1 exchanges — left open-ended (they go quiet after the v2 cutover),
  // mirroring the Envio port.
  .addLog({
    where: {
      address: [CTF_EXCHANGE_V1, NEG_RISK_CTF_EXCHANGE_V1],
      topic0: [
        ctfExchange.OrderFilled.topic,
        ctfExchange.TokenRegistered.topic,
      ],
    },
  })
  .addLog({
    where: {
      address: [CTF_EXCHANGE_V2, NEG_RISK_CTF_EXCHANGE_V2],
      topic0: [ctfExchangeV2.OrderFilled.topic],
    },
    range: { from: V2_CUTOVER_START },
  })
  .addLog({
    where: {
      address: CTF_COLLATERAL_ADAPTERS,
      topic0: [collateralAdapter.PositionsRedeemed.topic],
    },
    range: { from: ADAPTERS_START },
  })
  // Factory floor = Polymarket's CLOB v2 migration cutover: a DepositWallet
  // is deployed on first deposit into the v2 system, so none can predate it.
  // Our agents migrated to v2 trading a month+ later (trader PRs #929/#935;
  // first agent DW trade at block 88,031,656), leaving ~2M blocks of margin.
  .addLog({
    where: {
      address: [DEPOSIT_WALLET_FACTORY],
      topic0: [factory.WalletDeployed.topic],
    },
    range: { from: V2_CUTOVER_START },
  })
  .build();
