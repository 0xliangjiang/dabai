import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";

const config = loadConfig();
const app = await createApp();

await app.listen({
  port: config.port,
  host: "0.0.0.0"
});
