import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

const orders = JSON.parse(readFileSync(new URL("../data/orders.json", import.meta.url), "utf8"));

const TOOLS = [
  {
    name: "get_order_status",
    description: "Get the current status of one order by its order number. Use for any question about where an order is.",
    inputSchema: {
      type: "object",
      properties: { order_id: { type: "string", description: "Order number, e.g. \"1042\"." } },
      required: ["order_id"],
    },
  },
];

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function fail(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

function callTool(name, args) {
  if (name !== "get_order_status") return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  const order = orders[String(args?.order_id ?? "")];
  if (!order) return { content: [{ type: "text", text: `No order with id ${args?.order_id}.` }], isError: true };
  return { content: [{ type: "text", text: `Order ${args.order_id}: ${order.status} (updated ${order.updated}).` }] };
}

createInterface({ input: process.stdin }).on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.id === undefined) return; // notifications get no reply
  switch (msg.method) {
    case "initialize":
      return reply(msg.id, {
        protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "orders", version: "1.0.0" },
      });
    case "tools/list":
      return reply(msg.id, { tools: TOOLS });
    case "tools/call":
      return reply(msg.id, callTool(msg.params?.name, msg.params?.arguments));
    case "ping":
      return reply(msg.id, {});
    default:
      return fail(msg.id, -32601, `Method not found: ${msg.method}`);
  }
});
