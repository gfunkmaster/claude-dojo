import assert from "node:assert/strict";
import { test } from "node:test";
import { ValidationError } from "../src/common/errors.js";
import { ReportsService } from "../src/reports/reports.service.js";

const order = (iso, totalOre = 10_000) => ({ createdAt: new Date(iso), totalOre });
const fakeOrders = (list) => ({ list: () => list });

test("counts orders per day and lists empty days", () => {
  const reports = new ReportsService(fakeOrders([order("2026-10-01T08:00:00Z"), order("2026-10-01T17:30:00Z"), order("2026-10-02T12:00:00Z")]));
  assert.deepEqual(reports.ordersPerDay("2026-10-01", "2026-10-03"), [
    { date: "2026-10-01", count: 2 },
    { date: "2026-10-02", count: 1 },
    { date: "2026-10-03", count: 0 },
  ]);
});

test("ignores orders outside the range", () => {
  const reports = new ReportsService(fakeOrders([order("2026-09-30T23:59:00Z"), order("2026-10-02T09:00:00Z")]));
  assert.deepEqual(reports.ordersPerDay("2026-10-01", "2026-10-01"), [{ date: "2026-10-01", count: 0 }]);
});

test("rejects bad dates", () => {
  const reports = new ReportsService(fakeOrders([]));
  assert.throws(() => reports.ordersPerDay("2026-10-1", "2026-10-02"), ValidationError);
  assert.throws(() => reports.ordersPerDay("2026-10-05", "2026-10-02"), ValidationError);
});
