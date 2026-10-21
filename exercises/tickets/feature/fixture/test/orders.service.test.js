import assert from "node:assert/strict";
import { test } from "node:test";
import { NotFoundError, OrderStateError, ValidationError } from "../src/common/errors.js";
import { OrdersService } from "../src/orders/orders.service.js";

const at = new Date("2026-10-01T09:00:00Z");
const items = [{ sku: "mug", qty: 2 }];

test("create starts an order as pending", () => {
  const orders = new OrdersService(() => at);
  const order = orders.create({ customerId: "c1", items });
  assert.equal(order.status, "pending");
  assert.equal(order.createdAt, at);
});

test("create validates its input", () => {
  const orders = new OrdersService(() => at);
  assert.throws(() => orders.create({ items }), ValidationError);
  assert.throws(() => orders.create({ customerId: "c1", items: [] }), ValidationError);
});

test("an order moves from pending to paid to shipped", () => {
  const orders = new OrdersService(() => at);
  const { id } = orders.create({ customerId: "c1", items });
  assert.throws(() => orders.markShipped(id), OrderStateError);
  orders.markPaid(id);
  assert.equal(orders.markShipped(id).status, "shipped");
});

test("get throws for an unknown id", () => {
  assert.throws(() => new OrdersService().get("404"), NotFoundError);
});
