// UMA ancillary-data string parsing, ported 1:1 from the subgraph's
// uma-mapping.ts (pure string functions; unit-tested in tests/ancillary.test.ts).

/**
 * Extracts the title from UMA ancillaryData string.
 * Example input: "q: title: Will BTC hit 100k?, res_data: ..."
 */
export function extractTitle(rawData: string): string {
  // We look for all possible start keys
  const keys = ["question: ", "q: ", "title: "];
  let currentString = rawData;

  // 1. Strip all prefix keys (handles "q: title: ..." or "q: ...")
  let found = true;

  while (found) {
    found = false;
    for (const key of keys) {
      if (currentString.startsWith(key)) {
        currentString = currentString.substring(key.length).trim();
        found = true;
        break;
      }
    }
  }

  // If we didn't strip anything, but "title: " or "question: " exists elsewhere
  if (currentString === rawData) {
    for (const key of keys) {
      const idx = rawData.indexOf(key);
      if (idx !== -1) {
        // Move past the key and recurse or loop to catch nested keys
        return extractTitle(rawData.substring(idx + key.length));
      }
    }
  }

  // Now determine the end of the title based on the stripped string
  const delimiters = [
    ", description:",
    ", outcomes:",
    ", res_data:",
    ", start:",
    ", id:",
    ", initializer:",
  ];
  let end = -1;

  for (const delimiter of delimiters) {
    const dIdx = currentString.indexOf(delimiter);
    if (dIdx !== -1 && (end === -1 || dIdx < end)) {
      end = dIdx;
    }
  }

  // Generic field pattern fallback ", <word>:"
  if (end === -1) {
    for (let i = 0; i < currentString.length - 2; i++) {
      if (currentString.charAt(i) === "," && currentString.charAt(i + 1) === " ") {
        const colonIdx = currentString.indexOf(":", i + 2);
        if (colonIdx !== -1 && colonIdx < i + 20) {
          end = i;
          break;
        }
      }
    }
  }

  const finalTitle = end === -1 ? currentString : currentString.substring(0, end);
  return finalTitle.trim();
}

/**
 * Extracts the outcomes array.
 * Example input: "... outcomes: [Yes, No]" or
 * res_data: p1: 0, p2: 1, p3: 0.5. Outcome Mapping: Where p1 corresponds to Team WE, p2 to EDward Gaming, p3 to unknown/50-50
 *
 * Any 2-outcome market is accepted — labels don't have to be Yes/No.
 * Head-to-head markets (e.g. "Dota 2: Team A vs Team B") use competitor names
 * as outcome labels; the labels are purely descriptive and nothing downstream
 * branches on them (winner comes from payouts, outcomeIndex from TokenRegistry).
 * Markets with more than 2 outcomes are rejected.
 */
export function extractBinaryOutcomes(rawData: string): string[] {
  // 1. Try to find explicit mappings (p1 corresponds to X, p2 to Y)
  const p1Key = "p1 corresponds to ";
  const p2Key = "p2 to ";
  const p1Idx = rawData.indexOf(p1Key);
  const p2Idx = rawData.indexOf(p2Key);

  if (p1Idx !== -1 && p2Idx !== -1) {
    const p1Start = p1Idx + p1Key.length;
    const p1End = rawData.indexOf(",", p1Start);
    const p2Start = p2Idx + p2Key.length;
    // Truncate at the ", p3" clause first — labels like "Gen.G" or "St. Louis"
    // contain periods, so the "." fallback must come last.
    let p2End = rawData.indexOf(", p3", p2Start);
    if (p2End === -1) p2End = rawData.indexOf(",", p2Start);
    if (p2End === -1) p2End = rawData.indexOf(".", p2Start);
    if (p2End === -1) p2End = rawData.length;

    const out1 = rawData
      .substring(p1Start, p1End !== -1 ? p1End : rawData.length)
      .trim();
    const out2 = rawData.substring(p2Start, p2End).trim();

    if (out1.length === 0 || out2.length === 0) {
      return [];
    }
    return [out1, out2];
  }

  // 2. Try the "outcomes: [A, B]" pattern — accept exactly 2 outcomes
  const outcomesKey = "outcomes: [";
  const oStart = rawData.indexOf(outcomesKey);
  if (oStart !== -1) {
    const oEnd = rawData.indexOf("]", oStart);
    if (oEnd !== -1) {
      const list = rawData.substring(oStart + outcomesKey.length, oEnd).split(",");
      if (list.length === 2) {
        const out1 = (list[0] ?? "").trim();
        const out2 = (list[1] ?? "").trim();
        if (out1.length > 0 && out2.length > 0) {
          return [out1, out2];
        }
      }
    }
    // outcomes tag exists but isn't a 2-outcome list — reject.
    return [];
  }

  // 3. Fallback for binary markets that don't have outcomes defined
  return ["Yes", "No"];
}

/** Decode an ABI `bytes` hex string to UTF-8 (graph-ts Bytes.toString()). */
export function bytesToUtf8(hex: string): string {
  // Postgres text columns reject NUL (0x00), which occasionally appears in
  // on-chain ancillary data — strip it.
  return Buffer.from(hex.slice(2), "hex").toString("utf8").replaceAll("\u0000", "");
}
