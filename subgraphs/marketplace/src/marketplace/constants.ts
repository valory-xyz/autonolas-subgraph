import { Address, BigDecimal, Bytes, dataSource } from '@graphprotocol/graph-ts';

// Payment type hash constants (keccak256 of type name)
// Used to derive paymentType from factory address without RPC calls
export const PAYMENT_TYPE_FIXED_PRICE_NATIVE = Bytes.fromHexString(
  '0xba699a34be8fe0e7725e93dcbce1701b0211a8ca61330aaeb8a05bf2ec7abed1'
);
export const PAYMENT_TYPE_FIXED_PRICE_TOKEN = Bytes.fromHexString(
  '0x3679d66ef546e66ce9057c4a052f317b135bc8e8c509638f7966edfd4fcf45e9'
);
export const PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC = Bytes.fromHexString(
  '0x6406bb5f31a732f898e1ce9fdd988a80a808d36ab5d9a4a4805a8be8d197d5e3'
);
export const PAYMENT_TYPE_NVM_SUBSCRIPTION_NATIVE = Bytes.fromHexString(
  '0x803dd08fe79d91027fc9024e254a0942372b92f3ccabc1bd19f4a5c2b251c316'
);
export const PAYMENT_TYPE_NVM_SUBSCRIPTION_TOKEN_USDC = Bytes.fromHexString(
  '0x0d6fd99afa9c4c580fab5e341922c2a5c4b61d880da60506193d7bf88944dd14'
);

/**
 * Constructs a map key from network and factory address.
 * Format: "network:factoryAddress" (e.g., "gnosis:0x8b299c20f87e3fcbff0e1b86dc0acc06ab6993ef")
 */
export function getFactoryKey(network: string, factory: Address): string {
  return network + ':' + factory.toHexString().toLowerCase();
}

/**
 * Get payment type hash from factory address.
 * Uses static factory→paymentType mapping to avoid RPC calls.
 * Throws error if factory address is unknown.
 */
export function getPaymentTypeFromFactory(mechFactory: Address): Bytes {
  const network = dataSource.network();
  const factoryKey = getFactoryKey(network, mechFactory);

  // Factory→paymentType mapping for all networks
  // Using Map<string, Bytes> keyed by "network:factoryAddress"
  const factoryMap = new Map<string, Bytes>();

  // Gnosis factories (3)
  factoryMap.set(
    'gnosis:' + GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE.toLowerCase(),
    PAYMENT_TYPE_FIXED_PRICE_NATIVE
  );
  factoryMap.set(
    'gnosis:' + GNOSIS_MECH_FACTORY_FIXED_PRICE_TOKEN.toLowerCase(),
    PAYMENT_TYPE_FIXED_PRICE_TOKEN
  );
  factoryMap.set(
    'gnosis:' + GNOSIS_MECH_FACTORY_NVM_SUBSCRIPTION_NATIVE.toLowerCase(),
    PAYMENT_TYPE_NVM_SUBSCRIPTION_NATIVE
  );

  // Base factories (5)
  factoryMap.set(
    'base:' + BASE_MECH_FACTORY_FIXED_PRICE_NATIVE.toLowerCase(),
    PAYMENT_TYPE_FIXED_PRICE_NATIVE
  );
  factoryMap.set(
    'base:' + BASE_MECH_FACTORY_FIXED_PRICE_TOKEN.toLowerCase(),
    PAYMENT_TYPE_FIXED_PRICE_TOKEN
  );
  factoryMap.set(
    'base:' + BASE_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC.toLowerCase(),
    PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC
  );
  factoryMap.set(
    'base:' + BASE_MECH_FACTORY_NVM_SUBSCRIPTION_NATIVE.toLowerCase(),
    PAYMENT_TYPE_NVM_SUBSCRIPTION_NATIVE
  );
  factoryMap.set(
    'base:' + BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC.toLowerCase(),
    PAYMENT_TYPE_NVM_SUBSCRIPTION_TOKEN_USDC
  );

  // Polygon factories (4)
  // Note: dataSource.network() returns 'matic' for Polygon
  factoryMap.set(
    'matic:' + POLYGON_MECH_FACTORY_FIXED_PRICE_NATIVE.toLowerCase(),
    PAYMENT_TYPE_FIXED_PRICE_NATIVE
  );
  factoryMap.set(
    'matic:' + POLYGON_MECH_FACTORY_FIXED_PRICE_TOKEN.toLowerCase(),
    PAYMENT_TYPE_FIXED_PRICE_TOKEN
  );
  factoryMap.set(
    'matic:' + POLYGON_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC.toLowerCase(),
    PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC
  );
  factoryMap.set(
    'matic:' + POLYGON_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC.toLowerCase(),
    PAYMENT_TYPE_NVM_SUBSCRIPTION_TOKEN_USDC
  );

  // Optimism factories (4)
  factoryMap.set(
    'optimism:' + OPTIMISM_MECH_FACTORY_FIXED_PRICE_NATIVE.toLowerCase(),
    PAYMENT_TYPE_FIXED_PRICE_NATIVE
  );
  factoryMap.set(
    'optimism:' + OPTIMISM_MECH_FACTORY_FIXED_PRICE_TOKEN.toLowerCase(),
    PAYMENT_TYPE_FIXED_PRICE_TOKEN
  );
  factoryMap.set(
    'optimism:' + OPTIMISM_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC.toLowerCase(),
    PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC
  );
  factoryMap.set(
    'optimism:' + OPTIMISM_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC.toLowerCase(),
    PAYMENT_TYPE_NVM_SUBSCRIPTION_TOKEN_USDC
  );

  // Ethereum factories (3)
  factoryMap.set(
    'mainnet:' + ETHEREUM_MECH_FACTORY_FIXED_PRICE_NATIVE.toLowerCase(),
    PAYMENT_TYPE_FIXED_PRICE_NATIVE
  );
  factoryMap.set(
    'mainnet:' + ETHEREUM_MECH_FACTORY_FIXED_PRICE_TOKEN.toLowerCase(),
    PAYMENT_TYPE_FIXED_PRICE_TOKEN
  );
  factoryMap.set(
    'mainnet:' + ETHEREUM_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC.toLowerCase(),
    PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC
  );

  // Arbitrum factories (3)
  factoryMap.set(
    'arbitrum-one:' + ARBITRUM_MECH_FACTORY_FIXED_PRICE_NATIVE.toLowerCase(),
    PAYMENT_TYPE_FIXED_PRICE_NATIVE
  );
  factoryMap.set(
    'arbitrum-one:' + ARBITRUM_MECH_FACTORY_FIXED_PRICE_TOKEN.toLowerCase(),
    PAYMENT_TYPE_FIXED_PRICE_TOKEN
  );
  factoryMap.set(
    'arbitrum-one:' + ARBITRUM_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC.toLowerCase(),
    PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC
  );

  // Celo factories (3)
  factoryMap.set(
    'celo:' + CELO_MECH_FACTORY_FIXED_PRICE_NATIVE.toLowerCase(),
    PAYMENT_TYPE_FIXED_PRICE_NATIVE
  );
  factoryMap.set(
    'celo:' + CELO_MECH_FACTORY_FIXED_PRICE_TOKEN.toLowerCase(),
    PAYMENT_TYPE_FIXED_PRICE_TOKEN
  );
  factoryMap.set(
    'celo:' + CELO_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC.toLowerCase(),
    PAYMENT_TYPE_FIXED_PRICE_TOKEN_USDC
  );

  if (!factoryMap.has(factoryKey)) {
    throw new Error(
      'Unknown factory address: ' + mechFactory.toHexString() + ' on network ' + network
    );
  }

  return factoryMap.get(factoryKey);
}

// Mech Factory addresses
export const GNOSIS_MECH_FACTORY_FIXED_PRICE_NATIVE =
  '0x8b299c20F87e3fcBfF0e1B86dC0acC06AB6993EF';
export const GNOSIS_MECH_FACTORY_FIXED_PRICE_TOKEN =
  '0x31ffDC795FDF36696B8eDF7583A3D115995a45FA';
export const GNOSIS_MECH_FACTORY_NVM_SUBSCRIPTION_NATIVE =
  '0x65fd74C29463afe08c879a3020323DD7DF02DA57';

export const BASE_MECH_FACTORY_FIXED_PRICE_NATIVE =
  '0x2E008211f34b25A7d7c102403c6C2C3B665a1abe';
export const BASE_MECH_FACTORY_FIXED_PRICE_TOKEN =
  '0x97371B1C0cDA1D04dFc43DFb50a04645b7Bc9BEe';
export const BASE_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC =
  '0x5B70A66fe68c4c86FFd724B58cc56049c70e9D3D';
export const BASE_MECH_FACTORY_NVM_SUBSCRIPTION_NATIVE =
  '0x847bBE8b474e0820215f818858e23F5f5591855A';
export const BASE_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC =
  '0x7beD01f8482fF686F025628e7780ca6C1f0559fc';

export const POLYGON_MECH_FACTORY_FIXED_PRICE_NATIVE =
  '0x87f89F94033305791B6269AE2F9cF4e09983E56e';
export const POLYGON_MECH_FACTORY_FIXED_PRICE_TOKEN =
  '0xa0DA53447C0f6C4987964d8463da7e6628B30f82';
export const POLYGON_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC =
  '0x85899f9d8C058A5BBBaF344ea0f0b63c0CcBe851';
export const POLYGON_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC =
  '0x43fB32f25dce34EB76c78C7A42C8F40F84BCD237';

export const OPTIMISM_MECH_FACTORY_FIXED_PRICE_NATIVE =
  '0xf76953444C35F1FcE2F6CA1b167173357d3F5C17';
export const OPTIMISM_MECH_FACTORY_FIXED_PRICE_TOKEN =
  '0x26Ea2dC7ce1b41d0AD0E0521535655d7a94b684c';
export const OPTIMISM_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC =
  '0x93111f6C267068A5d7356114D61d0f09bFD53a54';
export const OPTIMISM_MECH_FACTORY_NVM_SUBSCRIPTION_TOKEN_USDC =
  '0x02C26437B292D86c5F4F21bbCcE0771948274f84';

export const ETHEREUM_MECH_FACTORY_FIXED_PRICE_NATIVE =
  '0x3515a36AF270070635Fa3E957e006aaF6078e658';
export const ETHEREUM_MECH_FACTORY_FIXED_PRICE_TOKEN =
  '0xddF6c8521195AC613626aE7a8E7d645128bc26fD';
export const ETHEREUM_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC =
  '0xF95BfBBA428dfb454Cd59C9c2d309bd6452d12A8';

export const ARBITRUM_MECH_FACTORY_FIXED_PRICE_NATIVE =
  '0x4Cd816ce806FF1003ee459158A093F02AbF042a8';
export const ARBITRUM_MECH_FACTORY_FIXED_PRICE_TOKEN =
  '0x70A0D93fb0dB6EAab871AB0A3BE279DcA37a2bcf';
export const ARBITRUM_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC =
  '0x694e62BDF7Ff510A4EE66662cf4866A961a31653';

export const CELO_MECH_FACTORY_FIXED_PRICE_NATIVE =
  '0xDd1252c5a75be568B5E6e50bA542680b38dbd68f';
export const CELO_MECH_FACTORY_FIXED_PRICE_TOKEN =
  '0xA123748Ce7609F507060F947b70298D0bde621E6';
export const CELO_MECH_FACTORY_FIXED_PRICE_TOKEN_USDC =
  '0xE3e5Df46060370af5Fd37B2aA11e7dac3cCB4bd0';

export const BASE_MECH_MARKETPLACE_ADDRESS =
  '0xf24eE42edA0fc9b33B7D41B06Ee8ccD2Ef7C5020';
export const GNOSIS_MECH_MARKETPLACE_ADDRESS =
  '0x735FAAb1c4Ec41128c367AFb5c3baC73509f70bB';
export const POLYGON_MECH_MARKETPLACE_ADDRESS =
  '0x343F2B005cF6D70bA610CD9F1F1927049414B582';
export const OPTIMISM_MECH_MARKETPLACE_ADDRESS =
  '0x46C0D07F55d4F9B5Eed2Fc9680B5953e5fd7b461';
export const ETHEREUM_MECH_MARKETPLACE_ADDRESS =
  '0x3d6494CE09a9f40c0B5a92BdBD7c7A9b0e3912b1';
export const ARBITRUM_MECH_MARKETPLACE_ADDRESS =
  '0xf76953444C35F1FcE2F6CA1b167173357d3F5C17';
export const CELO_MECH_MARKETPLACE_ADDRESS =
  '0x17d96ba4532fe91809326092fE4D5606A7B7a0d8';

// NVM Credit Ratios (immutable in contracts)
// LAZY INITIALIZATION: BigDecimal.fromString() at module load corrupts WASM memory.
// Using getter functions defers allocation until first handler execution.

// Gnosis: NVM credits convert to xDAI (18 decimals, 1:1 USD peg)
let _gnosisNvmXdaiRatio: BigDecimal | null = null;
export function getGnosisNvmXdaiRatio(): BigDecimal {
  if (_gnosisNvmXdaiRatio === null) {
    _gnosisNvmXdaiRatio = BigDecimal.fromString('990000000000000000000000000000');
  }
  return _gnosisNvmXdaiRatio!;
}
export const GNOSIS_NVM_TOKEN_DECIMALS: u8 = 18;

// Base: NVM credits convert to USDC (6 decimals)
let _baseNvmUsdcRatio: BigDecimal | null = null;
export function getBaseNvmUsdcRatio(): BigDecimal {
  if (_baseNvmUsdcRatio === null) {
    _baseNvmUsdcRatio = BigDecimal.fromString('990000000000000000');
  }
  return _baseNvmUsdcRatio!;
}
export const BASE_NVM_TOKEN_DECIMALS: u8 = 6;

// Chainlink price feed decimals
export const CHAINLINK_PRICE_FEED_DECIMALS: u8 = 8;
export const ETH_DECIMALS: u8 = 18;
export const USDC_DECIMALS: u8 = 6;

// Balancer V2 addresses (same on both networks)
export const BALANCER_VAULT_ADDRESS_GNOSIS = '0xBA12222222228d8Ba445958a75a0704d566BF2C8';
export const BALANCER_VAULT_ADDRESS_BASE = '0xBA12222222228d8Ba445958a75a0704d566BF2C8';

// OLAS token addresses
export const OLAS_ADDRESS_GNOSIS = '0xcE11e14225575945b8E6Dc0D4F2dD4C570f79d9f';
export const OLAS_ADDRESS_BASE = '0x54330d28ca3357F294334BDC454a032e7f353416';

// Stablecoin addresses (for Balancer pools)
export const WXDAI_ADDRESS_GNOSIS = '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d';
export const USDC_ADDRESS_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// OLAS pool addresses
export const OLAS_WXDAI_POOL_ADDRESS_GNOSIS = '0x79C872Ed3Acb3fc5770dd8a0cD9Cd5dB3B3Ac985';
export const OLAS_USDC_POOL_ADDRESS_BASE = '0x5332584890D6E415a6dc910254d6430b8aaB7E69';

// Chainlink price feed (Base only - for ETH/USD)
export const CHAINLINK_PRICE_FEED_ADDRESS_BASE_ETH_USD = '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70';

// Chainlink price feed (Polygon - for POL/USD)
export const CHAINLINK_PRICE_FEED_ADDRESS_POLYGON_POL_USD = '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0';

// Chainlink price feed (Optimism - for ETH/USD)
export const CHAINLINK_PRICE_FEED_ADDRESS_OPTIMISM_ETH_USD = '0x13e3Ee699D1909E989722E753853AE30b17e08c5';

// Chainlink price feed (Ethereum - for ETH/USD)
export const CHAINLINK_PRICE_FEED_ADDRESS_ETHEREUM_ETH_USD = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';

// Chainlink price feed (Arbitrum - for ETH/USD)
export const CHAINLINK_PRICE_FEED_ADDRESS_ARBITRUM_ETH_USD = '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612';

// Chainlink price feed (Celo - for CELO/USD)
export const CHAINLINK_PRICE_FEED_ADDRESS_CELO_CELO_USD = '0x0568fD19986748cEfF3301e55c0eb1E729E0Ab7e';
export const CELO_DECIMALS: u8 = 18;

// Ethereum OLAS pricing (Uniswap V2)
export const OLAS_ADDRESS_ETHEREUM = '0x0001A500A6B18995B03f44bb040A5fFc28E45CB0';
export const WETH_ADDRESS_ETHEREUM = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
export const OLAS_WETH_UNISWAP_V2_PAIR_ETHEREUM = '0x09D1d767eDF8Fa23A64C51fa559E0688E526812F';

// Arbitrum OLAS pricing (Balancer V2 OLAS/WETH pool + Chainlink ETH/USD)
export const OLAS_ADDRESS_ARBITRUM = '0x064f8b858c2a603e1b106a2039f5446d32dc81c1';
export const WETH_ADDRESS_ARBITRUM = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
export const BALANCER_VAULT_ADDRESS_ARBITRUM = '0xBA12222222228d8Ba445958a75a0704d566BF2C8';
export const OLAS_WETH_POOL_ADDRESS_ARBITRUM = '0xAF8912a3C4f55a8584B67DF30ee0dDf0e60e01f8';

// Celo OLAS address (no pricing pool available yet)
export const OLAS_ADDRESS_CELO = '0xD80533CA29fF6F033a0b55732Ed792af9Fbb381E';
