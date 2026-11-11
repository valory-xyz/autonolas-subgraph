// studio babydegen-base src/tokenUtils.ts: decimals, symbol and whole-token
// amounts from the tracked token table (tokenConfig.ts).

import { TOKENS } from "./constants";
import { GD, gd } from "./decimal";

type Warn = { warn(msg: string): void };

/** getTokenDecimals: the configured decimals, else 18 (with a warning). */
export function getTokenDecimals(token: string, log?: Warn): number {
  const config = TOKENS.get(token);
  if (config != null) return config.decimals;
  log?.warn(`TOKEN_UTILS: Unknown token decimals for ${token}, defaulting to 18`);
  return 18;
}

/** getTokenSymbol: the configured symbol, else the address. */
export function getTokenSymbol(token: string, log?: Warn): string {
  const config = TOKENS.get(token);
  if (config != null) return config.symbol;
  log?.warn(`TOKEN_UTILS: Unknown token symbol for ${token}, using address`);
  return token;
}

/** convertTokenAmount: `amount.toBigDecimal().div(BigDecimal.fromString("1e" + decimals))`. */
export function convertTokenAmount(amount: bigint, token: string, log?: Warn): GD {
  return GD.fromBigInt(amount).div(gd("1e" + getTokenDecimals(token, log)));
}
