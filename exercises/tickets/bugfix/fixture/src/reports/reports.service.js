import { ValidationError } from "../common/errors.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDay(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) throw new ValidationError(`${name} must be YYYY-MM-DD`);
  return new Date(`${value}T00:00:00Z`);
}

function dayOf(date) {
  return date.toISOString().slice(0, 10);
}

export class ReportsService {
  /** @param orders anything with `list()` returning orders with a `createdAt` Date */
  constructor(orders) {
    this.orders = orders;
  }

  /** Number of orders per day from `from` to `to`, both inclusive. */
  ordersPerDay(from, to) {
    const start = parseDay(from, "from");
    const end = parseDay(to, "to");
    if (end < start) throw new ValidationError("to must not be before from");

    const counts = new Map();
    for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) counts.set(dayOf(new Date(t)), 0);

    for (const order of this.orders.list()) {
      if (order.createdAt >= start && order.createdAt < end) {
        const day = dayOf(order.createdAt);
        counts.set(day, counts.get(day) + 1);
      }
    }
    return [...counts].map(([date, count]) => ({ date, count }));
  }

  /** Total revenue in öre for the same range. */
  revenue(from, to) {
    const days = new Set(this.ordersPerDay(from, to).map((d) => d.date));
    return this.orders
      .list()
      .filter((o) => days.has(dayOf(o.createdAt)))
      .reduce((sum, o) => sum + o.totalOre, 0);
  }
}
