import { cached, peekCache } from "./cache.ts";

async function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  let fetches = 0;
  const fetchA = async () => {
    fetches += 1;
    await new Promise((r) => setTimeout(r, 30));
    return { n: fetches };
  };

  const first = await Promise.all([
    cached("t1", 1_000, fetchA),
    cached("t1", 1_000, fetchA),
    cached("t1", 1_000, fetchA),
  ]);
  await assert(fetches === 1, `coalesce: expected 1 fetch, got ${fetches}`);
  await assert(first.every((v) => v.n === 1), "coalesce: all callers should share the result");

  const fresh = await cached("t1", 1_000, fetchA);
  await assert(fresh.n === 1 && fetches === 1, "fresh hit should not refetch");

  let staleFetches = 0;
  const fetchB = async () => {
    staleFetches += 1;
    await new Promise((r) => setTimeout(r, 40));
    return { n: staleFetches };
  };
  await cached("t2", 10, fetchB);
  await new Promise((r) => setTimeout(r, 20));
  const stale = await cached("t2", 10, fetchB, { staleMs: 5_000 });
  await assert(stale.n === 1, `stale should be served immediately, got ${stale.n}`);
  await new Promise((r) => setTimeout(r, 60));
  await assert(staleFetches === 2, `background refresh should have run, got ${staleFetches}`);
  const after = peekCache<{ n: number }>("t2");
  await assert(after?.data.n === 2, "cache should now hold the refreshed value");

  console.log("cache tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
