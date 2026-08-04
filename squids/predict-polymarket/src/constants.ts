export const PREDICT_AGENT_ID = 86n;

export const ONE_DAY = 86400n;

// All addresses lowercase — SQD log addresses and decoded address params are
// normalized to lowercase at the dispatch boundary in main.ts.
export const SERVICE_REGISTRY_L2 = "0xe3607b00e75f6405248323a9417ff6b39b244b50";
export const CONDITIONAL_TOKENS = "0x4d97dcd97ec945f40cf65f87097ace5ea0476045";
export const OPTIMISTIC_ORACLE_V3 = "0x65070be91477460d8a7aeeb94ef92fe056c2f2a7";
export const UMA_CTF_ADAPTER = "0x157ce2d672854c848c9b79c49a8cc6cc89176a49";
export const NEG_RISK_ADAPTER = "0xd91e80cf2e7be2e162c6513ced06f1dd0da35296";
export const CTF_EXCHANGE_V1 = "0x4bfb41d5b3570defd03c39a9a4d8de6bd8b8982e";
export const NEG_RISK_CTF_EXCHANGE_V1 =
  "0xc5d563a36ae78145c45a50134d48a1215220f80a";
export const CTF_EXCHANGE_V2 = "0xe111180000d2663c0091e4f400237545b87b996b";
export const NEG_RISK_CTF_EXCHANGE_V2 =
  "0xe2222d279d744050d28e00520010520000310f59";
export const CTF_COLLATERAL_ADAPTERS = [
  "0xada100db00ca00073811820692005400218fce1f", // ctf adapter (current)
  "0xada2005600dec949baf300f4c6120000bdb6eaab", // negRisk adapter (current)
  "0xada100874d00e3331d00f2007a9c336a65009718", // ctf adapter (old, ~1 day)
  "0xada200001000ef00d07553cee7006808f895c6f1", // negRisk adapter (old, ~1 day)
];
export const DEPOSIT_WALLET_FACTORY =
  "0x00000000000fb5c9adea0298d729a0cb3823cc07";

export const USDC_E_ADDRESS = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";

export const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

// Contract start blocks (mirror the subgraph manifest / Envio config)
export const START_BLOCK = 78_425_180;
export const SERVICE_REGISTRY_START = 80_360_433;
export const V2_CUTOVER_START = 85_952_819;
export const ADAPTERS_START = 86_219_367;
