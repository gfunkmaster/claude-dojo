import { TtlCache } from "../common/cache.js";

export function reportsController(reports, cache = new TtlCache(60_000)) {
  return [
    {
      method: "GET",
      path: "/reports/orders-per-day",
      handler: async ({ query }) => ({
        status: 200,
        body: await cache.getOrSet(`opd:${query.from}:${query.to}`, () => reports.ordersPerDay(query.from, query.to)),
      }),
    },
  ];
}
