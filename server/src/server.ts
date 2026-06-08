import { createApp } from "./app.js";
import { loadConfig, validateProductionConfig } from "./config/env.js";

const config = loadConfig();
validateProductionConfig(config);
const app = await createApp();

await app.listen({
  port: config.port,
  host: "0.0.0.0"
});
