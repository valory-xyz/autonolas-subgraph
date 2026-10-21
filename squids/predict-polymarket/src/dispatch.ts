// Decode-and-dispatch for one log: routes each event to its handler. Shared
// by the processor (src/main.ts) and the log-replay tests, so it must not
// start anything on import.
import { IEntityCache } from "./entityCache";
import * as serviceRegistryEvents from "./abi/ServiceRegistryL2/events";
import * as conditionalTokensEvents from "./abi/ConditionalTokens/events";
import * as ooEvents from "./abi/OptimisticOracleV3/events";
import * as negRiskEvents from "./abi/NegRiskAdapter/events";
import * as ctfExchangeEvents from "./abi/CTFExchange/events";
import * as ctfExchangeV2Events from "./abi/CTFExchangeV2/events";
import * as adapterEvents from "./abi/CtfCollateralAdapter/events";
import * as factoryEvents from "./abi/DepositWalletFactory/events";
import * as exchangeV3Events from "./abi/ExchangeV3/events";
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
  EXCHANGE_V3,
  POSITION_MANAGER,
} from "./constants";

const lc = (s: string) => s.toLowerCase();

/** Block header as SQD hands it over: timestamp in MILLISECONDS. */
export type DispatchBlock = { number: number; timestamp: number };
export type DispatchLog = {
  address: string;
  topics: string[];
  data: string;
  transactionHash: string;
  logIndex: number;
};

export async function dispatchLog(
  cache: IEntityCache,
  block: DispatchBlock,
  log: DispatchLog,
): Promise<void> {
  const address = log.address; // SQD normalizes to lowercase
  const topic0 = log.topics[0];
  const meta = () => eventMeta(block, log);

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
  } else if (address === EXCHANGE_V3) {
    if (topic0 === exchangeV3Events.OrderFilled.topic) {
      const e = exchangeV3Events.OrderFilled.decode(log);
      await handlers.handlePositionFill(cache, meta(), {
        maker: lc(e.maker),
        isBuying: inferV2Direction(e.side),
        outcomeTokenId: e.tokenId,
        makerAmountFilled: e.makerAmountFilled,
        takerAmountFilled: e.takerAmountFilled,
        builder: e.builder,
        metadata: e.metadata,
      });
    }
  } else if (address === POSITION_MANAGER) {
    // TransferSingle / TransferBatch change no bet or position. A fill's
    // share legs (mint -> exchange -> maker, seller -> buyer) are counted
    // once, by its ExchangeV3 OrderFilled, and positions are kept per agent
    // (keyed by its Safe), so a move between the agent's DepositWallet and
    // its Safe leaves the position on the same agent. Split, merge and
    // redemption mints and burns are not bets (CTF splits and merges are not
    // tracked either); payouts come from the redemption events.
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
