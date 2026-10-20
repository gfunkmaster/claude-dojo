import { routes } from "./routes/index.js";

export async function dispatch(req) {
  const route = routes.find((r) => r.method === req.method && r.path === req.url);
  if (!route) return { status: 404, body: { error: "not_found" } };
  return route.handler(req);
}
