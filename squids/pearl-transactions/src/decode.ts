// Decode helpers used by the dispatch loop.
//
// These live outside main.ts because main.ts calls run(...) at module scope:
// importing it from a test would start the real processor. They are the two
// bugs the first live smoke run surfaced, so they are the last things that
// should be untestable.

/**
 * Decode a log from an ADDRESS-LESS subscription, returning null when the
 * log is not actually the event we mean.
 *
 * topic0 is keccak of the event signature, and indexed-ness is NOT part of
 * that signature. So an unrelated contract declaring
 * `event AddedOwner(address indexed owner)` produces the exact same topic0
 * as Gnosis Safe's `event AddedOwner(address owner)` but carries two topics
 * instead of one, and the decoder rightly rejects it. Address-filtered
 * sources cannot hit this; our two template replacements (Safe,
 * StakingProxy) can, and do — this fires within the first 1k blocks of the
 * Polygon range.
 *
 * Only shape mismatches are swallowed. Any other failure propagates so a
 * genuine decoding bug still crashes the batch rather than silently
 * dropping data.
 */
export function decodeForeignSafe<T>(
  event: { decode(log: any): T },
  log: any
): T | null {
  try {
    // Called as a method: the decoder reads `this.topicCount`, so a bare
    // function reference would lose its receiver.
    return event.decode(log);
  } catch (err) {
    if ((err as { name?: string })?.name === "DecodingError") return null;
    throw err;
  }
}
