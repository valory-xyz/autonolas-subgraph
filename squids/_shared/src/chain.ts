/**
 * One squid deployment indexes ONE chain, picked by an environment variable
 * (`MARKETPLACE_CHAIN`, `SERVICE_REGISTRY_CHAIN`, ...). Unknown names fail
 * at startup with the list of configured chains, so a typo can never index
 * the default chain by accident.
 */
export function selectChain<T extends { name: string }>(
  envVar: string,
  table: Record<string, T>,
  defaultName: string
): T {
  const name = (process.env[envVar] ?? defaultName).trim();
  const chain = table[name];
  if (chain == null) {
    throw new Error(
      `${envVar}="${name}" is not configured. Known chains: ${Object.keys(table).join(", ")}`
    );
  }
  return chain;
}

/** Lowercase an address: SQD lowercases log addresses and handlers compare with `===`. */
export const lc = (s: string): string => s.toLowerCase();
