export function ordersController(orders) {
  return [
    { method: "GET", path: "/orders", handler: () => ({ status: 200, body: orders.list() }) },
    { method: "GET", path: "/orders/:id", handler: ({ params }) => ({ status: 200, body: orders.get(params.id) }) },
    { method: "POST", path: "/orders", handler: ({ body }) => ({ status: 201, body: orders.create(body) }) },
    { method: "POST", path: "/orders/:id/pay", handler: ({ params }) => ({ status: 200, body: orders.markPaid(params.id) }) },
    { method: "POST", path: "/orders/:id/ship", handler: ({ params }) => ({ status: 200, body: orders.markShipped(params.id) }) },
  ];
}
