import {
  EvmBatchProcessor,
  EvmBatchProcessorFields,
  BlockHeader,
  Log as _Log,
} from "@subsquid/evm-processor";
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

export const processor = new EvmBatchProcessor()
  .setRpcEndpoint({
    url: process.env.RPC_POLYGON_HTTP ?? "https://polygon-bor-rpc.publicnode.com",
    rateLimit: 10,
  })
  // Polygon finality via Heimdall checkpoints is typically quoted as
  // ~128-256 blocks; 200 sits inside that band.
  .setFinalityConfirmation(200)
  .setFields({
    log: { transactionHash: true },
  })
  .setBlockRange({ from: START_BLOCK })
  .addLog({
    address: [SERVICE_REGISTRY_L2],
    topic0: [
      serviceRegistry.RegisterInstance.topic,
      serviceRegistry.CreateMultisigWithAgents.topic,
    ],
    range: { from: SERVICE_REGISTRY_START },
  })
  .addLog({
    address: [CONDITIONAL_TOKENS],
    topic0: [
      conditionalTokens.ConditionPreparation.topic,
      conditionalTokens.PayoutRedemption.topic,
    ],
  })
  .addLog({
    address: [OPTIMISTIC_ORACLE_V3],
    topic0: [oo.QuestionInitialized.topic, oo.QuestionResolved.topic],
  })
  .addLog({
    address: [UMA_CTF_ADAPTER],
    topic0: [uma.QuestionInitialized.topic, uma.QuestionResolved.topic],
  })
  .addLog({
    address: [NEG_RISK_ADAPTER],
    topic0: [
      negRisk.QuestionPrepared.topic,
      negRisk.OutcomeReported.topic,
      negRisk.PayoutRedemption.topic,
    ],
  })
  // v1 exchanges — left open-ended (they go quiet after the v2 cutover),
  // mirroring the Envio port.
  .addLog({
    address: [CTF_EXCHANGE_V1, NEG_RISK_CTF_EXCHANGE_V1],
    topic0: [ctfExchange.OrderFilled.topic, ctfExchange.TokenRegistered.topic],
  })
  .addLog({
    address: [CTF_EXCHANGE_V2, NEG_RISK_CTF_EXCHANGE_V2],
    topic0: [ctfExchangeV2.OrderFilled.topic],
    range: { from: V2_CUTOVER_START },
  })
  .addLog({
    address: CTF_COLLATERAL_ADAPTERS,
    topic0: [collateralAdapter.PositionsRedeemed.topic],
    range: { from: ADAPTERS_START },
  })
  .addLog({
    address: [DEPOSIT_WALLET_FACTORY],
    topic0: [factory.WalletDeployed.topic],
    range: { from: V2_CUTOVER_START },
  });

// SQD Network gateway needs an API key since 2026-05-19 (free at
// https://portal.sqd.dev). Without one, the processor falls back to
// RPC-only ingestion — works, but orders of magnitude slower; fine for
// smoke tests only. setGateway returns `this`, so calling it after the
// fluent chain keeps the narrowed Fields type intact.
if (process.env.SQD_API_KEY) {
  processor.setGateway("https://v2.archive.subsquid.io/network/polygon-mainnet");
}

export type Fields = EvmBatchProcessorFields<typeof processor>;
export type Block = BlockHeader<Fields>;
export type Log = _Log<Fields>;
