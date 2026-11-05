// graph-node renders a Bytes id as lowercase 0x-hex. The subgraph builds
// several ids with `Bytes.fromUTF8(...)`, so those come out as the hex of
// the UTF-8 string, not the string itself.

/** `Bytes.fromUTF8(s).toHexString()`. */
export const utf8Hex = (s: string): string => "0x" + Buffer.from(s, "utf8").toString("hex");

/** ServiceRegistration / ServiceIndex id: `Bytes.fromUTF8(serviceId.toString())`. */
export const serviceKey = (serviceId: bigint): string => utf8Hex(serviceId.toString());

/** TokenBalance id: `Bytes.fromUTF8(safe.toHexString() + "-" + token.toHexString())`. */
export const tokenBalanceId = (safe: string, token: string): string => utf8Hex(`${safe}-${token}`);

/** PriceUpdate id: `token.id.concat(Bytes.fromUTF8(timestamp.toString()))`. */
export const priceUpdateId = (token: string, timestamp: bigint): string =>
  token + Buffer.from(timestamp.toString(), "utf8").toString("hex");

/** ServiceRegistry singleton id: `Bytes.fromUTF8("registry")`. */
export const SERVICE_REGISTRY_ID = utf8Hex("registry");

/** `Address.zero()`, the TokenBalance key for native ETH. */
export const ETH_ADDRESS = "0x0000000000000000000000000000000000000000";
