import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.js";

test("POST /orders then GET /orders/:id", async () => {
  const app = createApp();
  const created = await app.handle({ method: "POST", url: "/orders", body: { customerId: "c1", items: [{ sku: "mug", qty: 1 }] } });
  assert.equal(created.status, 201);
  const fetched = await app.handle({ method: "GET", url: `/orders/${created.body.id}` });
  assert.equal(fetched.body.customerId, "c1");
});

test("errors map to status codes", async () => {
  const app = createApp();
  assert.equal((await app.handle({ method: "GET", url: "/orders/nope" })).status, 404);
  assert.equal((await app.handle({ method: "POST", url: "/orders", body: {} })).status, 400);
});
