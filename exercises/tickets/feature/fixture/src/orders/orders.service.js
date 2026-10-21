import { NotFoundError, OrderStateError, ValidationError } from "../common/errors.js";

/** Order lifecycle: pending -> paid -> shipped. */
export class OrdersService {
  #orders = new Map();
  #nextId = 1;

  constructor(clock = () => new Date(Date.now())) {
    this.clock = clock;
  }

  create({ customerId, items } = {}) {
    if (!customerId) throw new ValidationError("customerId is required");
    if (!Array.isArray(items) || items.length === 0) throw new ValidationError("items must not be empty");
    const order = { id: String(this.#nextId++), customerId, items, status: "pending", createdAt: this.clock() };
    this.#orders.set(order.id, order);
    return order;
  }

  get(id) {
    const order = this.#orders.get(id);
    if (!order) throw new NotFoundError(`order ${id} not found`);
    return order;
  }

  list() {
    return [...this.#orders.values()];
  }

  markPaid(id) {
    const order = this.get(id);
    if (order.status !== "pending") throw new OrderStateError(`order ${id} is ${order.status}, not pending`);
    order.status = "paid";
    order.paidAt = this.clock();
    return order;
  }

  markShipped(id) {
    const order = this.get(id);
    if (order.status !== "paid") throw new OrderStateError(`order ${id} is ${order.status}, not paid`);
    order.status = "shipped";
    order.shippedAt = this.clock();
    return order;
  }
}
