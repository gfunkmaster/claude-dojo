import { ordersController } from "./orders/orders.controller.js";
import { OrdersService } from "./orders/orders.service.js";

function match(pattern, url) {
  const want = pattern.split("/");
  const got = url.split("?")[0].split("/");
  if (want.length !== got.length) return null;
  const params = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(":")) params[want[i].slice(1)] = decodeURIComponent(got[i]);
    else if (want[i] !== got[i]) return null;
  }
  return params;
}

/** The app without a socket: `handle({ method, url, body })` returns `{ status, body }`. */
export function createApp({ clock } = {}) {
  const routes = [...ordersController(new OrdersService(clock))];
  return {
    async handle({ method, url, body }) {
      for (const route of routes) {
        const params = route.method === method ? match(route.path, url) : null;
        if (!params) continue;
        try {
          return await route.handler({ params, body });
        } catch (err) {
          return { status: err.status ?? 500, body: { error: err.message } };
        }
      }
      return { status: 404, body: { error: "no route" } };
    },
  };
}
