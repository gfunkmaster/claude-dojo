import { readFileSync } from "node:fs";

console.log("orders server starting...");
const orders = JSON.parse(readFileSync("data/orders.json", "utf8"));

process.stdin.on("data", (chunk) => {
  const msg = JSON.parse(chunk.toString());
  if (msg.method === "tools/call") {
    console.log(JSON.stringify({ id: msg.id, result: orders[msg.params.arguments.id] }));
  }
});
