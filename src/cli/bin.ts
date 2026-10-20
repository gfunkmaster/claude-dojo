import { main } from "./index.ts";

main(process.argv.slice(2)).then(
  (code) => (process.exitCode = code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  },
);
