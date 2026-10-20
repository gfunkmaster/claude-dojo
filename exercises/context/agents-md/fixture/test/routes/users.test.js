import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatch } from "../../src/router.js";

test("GET /users lists users", async () => {
  const res = await dispatch({ method: "GET", url: "/users" });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
});
