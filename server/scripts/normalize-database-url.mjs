const env = process.env;

let databaseUrl = env.DATABASE_URL || "";
if (!databaseUrl && env.DB_HOST && env.DB_USER && env.DB_NAME) {
  const user = encodeURIComponent(env.DB_USER);
  const password = encodeURIComponent(env.DB_PASSWORD || "");
  databaseUrl = `mysql://${user}:${password}@${env.DB_HOST}:${env.DB_PORT || 3306}/${env.DB_NAME}`;
}

if (!databaseUrl) process.exit(0);

const url = new URL(databaseUrl);
if (url.protocol === "mysql:") {
  setDefault(url.searchParams, "connection_limit", env.DB_CONNECTION_LIMIT || "5");
  setDefault(url.searchParams, "pool_timeout", env.DB_POOL_TIMEOUT_SECONDS || "10");
  setDefault(url.searchParams, "connect_timeout", env.DB_CONNECT_TIMEOUT_SECONDS || "10");
}

process.stdout.write(url.toString());

function setDefault(params, key, value) {
  if (!params.has(key)) params.set(key, value);
}
