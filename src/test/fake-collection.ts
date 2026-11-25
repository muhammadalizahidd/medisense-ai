import { ObjectId } from "mongodb";

/*
 * A small in-memory stand-in for a MongoDB collection, so server logic can be tested without a
 * database. It supports only the query and update shapes the tests use: equality, $ne, $exists, $in,
 * "array contains", and $set / $addToSet / $pull / $setOnInsert with upsert.
 */

export type Doc = Record<string, unknown>;

const same = (a: unknown, b: unknown) =>
  a instanceof ObjectId && b instanceof ObjectId ? a.equals(b) : a === b;

function matches(doc: Doc, filter: Doc) {
  return Object.entries(filter).every(([key, want]) => {
    const have = doc[key];
    if (want && typeof want === "object" && !(want instanceof ObjectId)) {
      if ("$ne" in want) return !same(have, (want as { $ne: unknown }).$ne);
      if ("$exists" in want) return (have !== undefined) === (want as { $exists: boolean }).$exists;
      if ("$in" in want) {
        const list = (want as { $in: unknown[] }).$in;
        return Array.isArray(have) ? have.some((v) => list.includes(v)) : list.includes(have);
      }
    }
    if (Array.isArray(have)) return have.some((v) => same(v, want));
    return same(have, want);
  });
}

type Update = { $set?: Doc; $addToSet?: Doc; $pull?: Doc; $setOnInsert?: Doc };

export class FakeCollection {
  docs: Doc[] = [];
  writes = 0;

  find(filter: Doc = {}) {
    return { toArray: async () => this.docs.filter((d) => matches(d, filter)) };
  }

  async findOne(filter: Doc) {
    return this.docs.find((d) => matches(d, filter)) ?? null;
  }

  async insertOne(doc: Doc) {
    this.writes += 1;
    this.docs.push(doc);
  }

  async updateOne(filter: Doc, update: Update, options: { upsert?: boolean } = {}) {
    let doc = this.docs.find((d) => matches(d, filter));
    if (!doc) {
      if (!options.upsert) return { matchedCount: 0, modifiedCount: 0 };
      const base: Doc = {};
      for (const [k, v] of Object.entries(filter)) {
        if (!(v && typeof v === "object" && !(v instanceof ObjectId))) base[k] = v;
      }
      doc = { ...base, ...update.$setOnInsert };
      this.docs.push(doc);
    }
    this.writes += 1;
    Object.assign(doc, update.$set);
    for (const [k, v] of Object.entries(update.$addToSet ?? {})) {
      const list = (doc[k] as unknown[] | undefined) ?? [];
      doc[k] = list.includes(v) ? list : [...list, v];
    }
    for (const [k, v] of Object.entries(update.$pull ?? {})) {
      doc[k] = ((doc[k] as unknown[] | undefined) ?? []).filter((x) => x !== v);
    }
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async countDocuments(filter: Doc) {
    return this.docs.filter((d) => matches(d, filter)).length;
  }

  async deleteOne(filter: Doc) {
    this.writes += 1;
    const i = this.docs.findIndex((d) => matches(d, filter));
    if (i >= 0) this.docs.splice(i, 1);
  }

  async deleteMany(filter: Doc) {
    this.docs = this.docs.filter((d) => !matches(d, filter));
  }
}

export class FakeDb {
  private collections = new Map<string, FakeCollection>();
  collection(name: string) {
    let c = this.collections.get(name);
    if (!c) {
      c = new FakeCollection();
      this.collections.set(name, c);
    }
    return c;
  }
}
