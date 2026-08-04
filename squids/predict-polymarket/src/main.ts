// Entry point: decode-and-dispatch only. Event semantics live in
// src/handlers.ts (unit-tested); shared aggregation logic in src/logic.ts.
import "dotenv/config";
import { TypeormDatabase } from "@subsquid/typeorm-store";
import { processor } from "./processor";
import { EntityCache } from "./entityCache";
import * as serviceRegistryEvents from "./abi/ServiceRegistryL2/events";
import * as conditionalTokensEvents from "./abi/ConditionalTokens/events";
import * as ooEvents from "./abi/OptimisticOracleV3/events";
import * as negRiskEvents from "./abi/NegRiskAdapter/events";
import * as ctfExchangeEvents from "./abi/CTFExchange/events";
import * as ctfExchangeV2Events from "./abi/CTFExchangeV2/events";
import * as adapterEvents from "./abi/CtfCollateralAdapter/events";
import * as factoryEvents from "./abi/DepositWalletFactory/events";
import { processRedemption } from "./logic";
import { eventMeta, inferV1Direction, inferV2Direction } from "./decode";
import * as handlers from "./handlers";
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
} from "./constants";

const lc = (s: string) => s.toLowerCase();

processor.run(
  new TypeormDatabase({ supportHotBlocks: true }),
  async (ctx) => {
    const cache = new EntityCache(ctx.store);
    cache.log = ctx.log;

    for (const block of ctx.blocks) {
      for (const log of block.logs) {
        const address = log.address; // SQD normalizes to lowercase
        const topic0 = log.topics[0];
        const meta = () => eventMeta(block.header, log);

        if (address === SERVICE_REGISTRY_L2) {
          if (topic0 === serviceRegistryEvents.RegisterInstance.topic) {
            const e = serviceRegistryEvents.RegisterInstance.decode(log);
            await handlers.handleRegisterInstance(cache, meta(), {
              agentInstance: lc(e.agentInstance),
              serviceId: e.serviceId,
              agentId: e.agentId,
            });
          } else if (
            topic0 === serviceRegistryEvents.CreateMultisigWithAgents.topic
          ) {
            const e = serviceRegistryEvents.CreateMultisigWithAgents.decode(log);
            await handlers.handleCreateMultisigWithAgents(cache, meta(), {
              serviceId: e.serviceId,
              multisig: lc(e.multisig),
            });
          }
        } else if (address === CONDITIONAL_TOKENS) {
          if (topic0 === conditionalTokensEvents.ConditionPreparation.topic) {
            const e = conditionalTokensEvents.ConditionPreparation.decode(log);
            await handlers.handleConditionPreparation(cache, meta(), {
              conditionId: e.conditionId,
              oracle: lc(e.oracle),
              questionId: e.questionId,
              outcomeSlotCount: e.outcomeSlotCount,
            });
          } else if (
            topic0 === conditionalTokensEvents.PayoutRedemption.topic
          ) {
            const e = conditionalTokensEvents.PayoutRedemption.decode(log);
            await processRedemption(
              cache,
              lc(e.redeemer),
              e.conditionId,
              e.payout,
              meta(),
            );
          }
        } else if (
          address === OPTIMISTIC_ORACLE_V3 ||
          address === UMA_CTF_ADAPTER
        ) {
          // both contracts emit identical events; one decoder serves both
          if (topic0 === ooEvents.QuestionInitialized.topic) {
            const e = ooEvents.QuestionInitialized.decode(log);
            await handlers.handleQuestionInitialization(cache, meta(), {
              questionID: e.questionID,
              ancillaryData: e.ancillaryData,
            });
          } else if (topic0 === ooEvents.QuestionResolved.topic) {
            const e = ooEvents.QuestionResolved.decode(log);
            await handlers.handleQuestionResolution(cache, meta(), {
              questionID: e.questionID,
              settledPrice: e.settledPrice,
              payouts: [...e.payouts],
            });
          }
        } else if (address === NEG_RISK_ADAPTER) {
          if (topic0 === negRiskEvents.QuestionPrepared.topic) {
            const e = negRiskEvents.QuestionPrepared.decode(log);
            await handlers.handleQuestionPrepared(cache, meta(), {
              questionId: e.questionId,
              marketId: e.marketId,
              data: e.data,
            });
          } else if (topic0 === negRiskEvents.OutcomeReported.topic) {
            const e = negRiskEvents.OutcomeReported.decode(log);
            await handlers.handleOutcomeReported(cache, meta(), {
              questionId: e.questionId,
              outcome: e.outcome,
            });
          } else if (topic0 === negRiskEvents.PayoutRedemption.topic) {
            const e = negRiskEvents.PayoutRedemption.decode(log);
            await processRedemption(
              cache,
              lc(e.redeemer),
              e.conditionId,
              e.payout,
              meta(),
            );
          }
        } else if (
          address === CTF_EXCHANGE_V1 ||
          address === NEG_RISK_CTF_EXCHANGE_V1
        ) {
          if (topic0 === ctfExchangeEvents.OrderFilled.topic) {
            const e = ctfExchangeEvents.OrderFilled.decode(log);
            const { isBuying, outcomeTokenId } = inferV1Direction(
              e.makerAssetId,
              e.takerAssetId,
            );
            await handlers.handleOrderFill(cache, meta(), {
              maker: lc(e.maker),
              isBuying,
              outcomeTokenId,
              makerAmountFilled: e.makerAmountFilled,
              takerAmountFilled: e.takerAmountFilled,
              builder: null,
              metadata: null,
            });
          } else if (topic0 === ctfExchangeEvents.TokenRegistered.topic) {
            const e = ctfExchangeEvents.TokenRegistered.decode(log);
            await handlers.handleTokenRegistered(cache, meta(), {
              token0: e.token0,
              token1: e.token1,
              conditionId: e.conditionId,
            });
          }
        } else if (
          address === CTF_EXCHANGE_V2 ||
          address === NEG_RISK_CTF_EXCHANGE_V2
        ) {
          if (topic0 === ctfExchangeV2Events.OrderFilled.topic) {
            const e = ctfExchangeV2Events.OrderFilled.decode(log);
            await handlers.handleOrderFill(cache, meta(), {
              maker: lc(e.maker),
              isBuying: inferV2Direction(e.side),
              outcomeTokenId: e.tokenId,
              makerAmountFilled: e.makerAmountFilled,
              takerAmountFilled: e.takerAmountFilled,
              builder: e.builder,
              metadata: e.metadata,
            });
          }
        } else if (CTF_COLLATERAL_ADAPTERS.includes(address)) {
          if (topic0 === adapterEvents.PositionsRedeemed.topic) {
            const e = adapterEvents.PositionsRedeemed.decode(log);
            await processRedemption(
              cache,
              lc(e.initiator),
              e.conditionId,
              e.payout,
              meta(),
            );
          }
        } else if (address === DEPOSIT_WALLET_FACTORY) {
          if (topic0 === factoryEvents.WalletDeployed.topic) {
            const e = factoryEvents.WalletDeployed.decode(log);
            await handlers.handleWalletDeployed(cache, meta(), {
              wallet: lc(e.wallet),
              owner: lc(e.owner),
            });
          }
        }
      }
    }

    await cache.flush();
  },
);
