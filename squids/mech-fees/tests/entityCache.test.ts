// Value-imports `src/entityCache` so its module-load
// `assertFlushOrderExhaustive` actually executes: an entity missing from
// FLUSH_ORDER is cached and silently never persisted, and without this the
// only guard against that runs when the processor boots, not in CI.
//
// Then checks the half that assertion cannot see on its own — that every
// owning-side relation points at an entity written earlier. The pairs are
// read from this squid's own typeorm metadata, which is why this lives here
// rather than in the shared package (see assertFlushOrderIsFkSafe).
import { describe, expect, it } from "vitest";
import { getMetadataArgsStorage } from "typeorm";
import { assertFlushOrderIsFkSafe } from "@olas/squid-shared";
import { FLUSH_ORDER } from "../src/entityCache";
import * as models from "../src/model";

const owningRelations = () =>
  getMetadataArgsStorage()
    .relations.filter(
      (r) => r.relationType === "many-to-one" || r.relationType === "one-to-one"
    )
    .flatMap((r) => {
      const from = (r.target as { name?: string })?.name;
      let to: string | undefined;
      try {
        to = ((r.type as () => unknown)() as { name?: string })?.name;
      } catch {
        return [];
      }
      return from != null && to != null ? [{ from, to, property: r.propertyName }] : [];
    });

describe("FLUSH_ORDER", () => {
  it("lists every generated entity exactly once", () => {
    const generated = Object.values(models).filter(
      (v): v is { new (...a: any[]): any; name: string } => typeof v === "function"
    );
    expect(FLUSH_ORDER.map((c) => c.name).sort()).toEqual(
      generated.map((c) => c.name).sort()
    );
  });

  it("writes every referenced entity before the one referencing it", () => {
    expect(() => assertFlushOrderIsFkSafe(FLUSH_ORDER, owningRelations())).not.toThrow();
  });

  it("rejects an order that puts a referenced entity last", () => {
    const relations = owningRelations();
    expect(relations.length).toBeGreaterThan(0);
    const { from, to } = relations[0];
    const reordered = [
      ...FLUSH_ORDER.filter((c) => c.name !== to),
      FLUSH_ORDER.find((c) => c.name === to)!,
    ];
    expect(() => assertFlushOrderIsFkSafe(reordered, relations)).toThrow(
      new RegExp(`${from}\\..* -> ${to}`)
    );
  });
});
