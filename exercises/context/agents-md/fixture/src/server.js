import { createServer } from "node:http";
import { dispatch } from "./router.js";

const port = Number(process.env.PORT ?? 3000);
createServer(async (req, res) => {
  const { status, body } = await dispatch(req);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}).listen(port);
