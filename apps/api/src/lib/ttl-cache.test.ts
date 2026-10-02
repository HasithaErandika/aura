import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "./ttl-cache.js";

describe("TtlCache", () => {
  it("returns a value until it expires", () => {
    const cache = new TtlCache<number>(100);
    cache.set("a", 1, 1000);
    expect(cache.get("a", 1099)).toBe(1);
    expect(cache.get("a", 1100)).toBeUndefined();
  });

  it("evicts the oldest entry when full", () => {
    const cache = new TtlCache<number>(1000, 2);
    cache.set("a", 1, 0);
    cache.set("b", 2, 0);
    cache.set("c", 3, 0);
    expect([cache.get("a", 1), cache.get("b", 1), cache.get("c", 1)]).toEqual([undefined, 2, 3]);
  });

  it("overwrites an existing key without evicting another", () => {
    const cache = new TtlCache<number>(1000, 2);
    cache.set("a", 1, 0);
    cache.set("b", 2, 0);
    cache.set("a", 10, 0);
    expect([cache.get("a", 1), cache.get("b", 1)]).toEqual([10, 2]);
  });

  it("deletes by key and by predicate", () => {
    const cache = new TtlCache<{ user: string }>(1000);
    cache.set("t1", { user: "u1" });
    cache.set("t2", { user: "u1" });
    cache.set("t3", { user: "u2" });
    cache.delete("t3");
    cache.deleteWhere((v) => v.user === "u1");
    expect([cache.get("t1"), cache.get("t2"), cache.get("t3")]).toEqual([undefined, undefined, undefined]);
  });

  it("loads once and serves the cached value", async () => {
    const cache = new TtlCache<string>(1000);
    const load = vi.fn(async () => "value");
    expect(await cache.getOrLoad("k", load)).toBe("value");
    expect(await cache.getOrLoad("k", load)).toBe("value");
    expect(load).toHaveBeenCalledTimes(1);
  });
});
