// The production EntityCache against a fake store that behaves like TypeORM
// in the one respect that matters: `get()` returns rows WITHOUT relations
// (they come back `undefined`, not null) and only `findOne({relations})`
// loads them. Covers the relation reload, the "unflushed entity wins over a
// DB read" rule, FK-ordered flushes and the FLUSH_ORDER guard.
import { beforeEach, describe, expect, it } from "vitest";
import type { Store } from "@subsquid/typeorm-store";
import { EntityCache } from "../src/entityCache";
import { Request, Sender, Service } from "../src/model";

const RELATIONS: Record<string, string[]> = {
  Request: ["sender", "service"],
};

/** Flat rows; relation props are stored as `<name>Id` and dropped on `get()`. */
class FakeStore {
  tables = new Map<string, Map<string, any>>();
  upserts: string[] = [];

  private table(name: string) {
    let t = this.tables.get(name);
    if (t == null) this.tables.set(name, (t = new Map()));
    return t;
  }
  private hydrate(cls: any, row: any, relations: string[]) {
    if (row == null) return undefined;
    const out = new cls();
    for (const [k, v] of Object.entries(row)) {
      if (k.endsWith("Id") && (RELATIONS[cls.name] ?? []).includes(k.slice(0, -2))) continue;
      out[k] = v;
    }
    for (const r of relations) out[r] = row[`${r}Id`] == null ? null : { id: row[`${r}Id`] };
    return out;
  }
  async get(cls: any, id: string) {
    return this.hydrate(cls, this.table(cls.name).get(id), []);
  }
  async findOne(cls: any, opts: { where: { id: string }; relations?: Record<string, boolean> }) {
    const rels = Object.keys(opts.relations ?? {});
    return this.hydrate(cls, this.table(cls.name).get(opts.where.id), rels);
  }
  async upsert(entities: any[]) {
    for (const e of entities) {
      const name = e.constructor.name;
      this.upserts.push(name);
      const row: any = {};
      for (const [k, v] of Object.entries(e)) {
        if ((RELATIONS[name] ?? []).includes(k)) row[`${k}Id`] = (v as any)?.id ?? null;
        else row[k] = v;
      }
      this.table(name).set(e.id, { ...(this.table(name).get(e.id) ?? {}), ...row });
    }
  }
}

const SENDER = "0x0000000000000000000000000000000000000011";
const REQ = `0x${"1".padStart(64, "0")}`;

let store: FakeStore;
const batch = () => {
  const c = new EntityCache(store as unknown as Store);
  c.log = { warn() {}, info() {}, error() {} };
  return c;
};
const newRequest = (sender: Sender) =>
  new Request({
    id: REQ,
    sender,
    mech: "0xaa",
    blockNumber: 1n,
    blockTimestamp: 1n,
    transactionHash: "0xtx",
    isDelivered: false,
  });

beforeEach(() => {
  store = new FakeStore();
});

describe("EntityCache", () => {
  it("FLUSH_ORDER guard ran at module load", () => {
    expect(EntityCache).toBeDefined();
  });

  it("flushes referenced entities before referencing ones regardless of set() order", async () => {
    const c = batch();
    const sender = new Sender({ id: SENDER, totalLegacyRequests: 0n });
    c.set(Request, newRequest(sender)); // set BEFORE its sender
    c.set(Sender, sender);
    await c.flush();
    expect(store.upserts).toEqual(["Sender", "Request"]);
  });

  it("reloads a relation the cached copy does not carry", async () => {
    let c = batch();
    const sender = new Sender({ id: SENDER, totalLegacyRequests: 0n });
    c.set(Sender, sender);
    c.set(Request, newRequest(sender));
    await c.flush();

    // Next batch: a plain get() seeds the cache with a relation-less row...
    c = batch();
    const plain = (await c.get(Request, REQ))!;
    expect(plain.sender).toBeUndefined();
    // ...and asking for the relation must not trust that hit.
    const withSender = (await c.get(Request, REQ, ["sender"]))!;
    expect(withSender.sender?.id).toBe(SENDER);
    // A relation that is loaded-but-null is trusted (null !== undefined).
    const withService = (await c.get(Request, REQ, ["sender", "service"]))!;
    expect(withService.service).toBeNull();
  });

  it("never replaces an unflushed entity with a DB read", async () => {
    let c = batch();
    const sender = new Sender({ id: SENDER, totalLegacyRequests: 0n });
    c.set(Sender, sender);
    c.set(Request, newRequest(sender));
    await c.flush();

    c = batch();
    // Modify a relation-less copy in memory (dirty), then ask for relations:
    // the dirty object must come back, not a fresh DB row that would drop
    // the in-memory change.
    const dirty = (await c.get(Request, REQ))!;
    dirty.isDelivered = true;
    c.set(Request, dirty);
    const again = (await c.get(Request, REQ, ["sender"]))!;
    expect(again).toBe(dirty);
    expect(again.isDelivered).toBe(true);
    await c.flush();
    expect(store.tables.get("Request")!.get(REQ).isDelivered).toBe(true);
    expect(store.tables.get("Request")!.get(REQ).senderId).toBe(SENDER); // FK not blanked
  });

  it("rejects a class token that does not match the instance", async () => {
    const c = batch();
    // The Service constructor accepts any props, so this compiles; the cache
    // must still refuse to file a Sender under Service's flush bucket.
    expect(() => c.set(Service, new Sender({ id: SENDER }) as unknown as Service)).toThrow(
      /Sender/
    );
  });
});
