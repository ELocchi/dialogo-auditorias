import { parentPort } from "node:worker_threads";

// Exercise the production worker entry without a browser DOM or React runtime.
globalThis.self = {
  onmessage: null,
  postMessage: (message, transfer) => parentPort.postMessage(message, transfer),
};
await import("../../src/lib/pdf/report.worker.ts");
parentPort.on("message", (data) => globalThis.self.onmessage({ data }));
