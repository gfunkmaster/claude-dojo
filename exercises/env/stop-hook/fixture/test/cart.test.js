import { test } from "node:test";
import assert from "node:assert/strict";
import * as cart from "../src/cart.js";

test("total", () => {
  assert.equal(cart.total([{ price: 10, qty: 2 }]), 20);
});

test("applyDiscount rounds to whole öre and never goes below zero", () => {
  assert.equal(typeof cart.applyDiscount, "function", "applyDiscount is not exported yet");
  assert.equal(cart.applyDiscount(99.99, 15), 84.99);
  assert.equal(cart.applyDiscount(50, 150), 0);
});
