import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

const port = Number(process.env.PORT || 8787);
const upstreamUrl = process.env.NANRUN_API_URL || "https://api.nan.run/api/xiaomisport";
const upstreamKey = String(process.env.NANRUN_API_KEY || "").trim();
const relayToken = String(process.env.RELAY_TOKEN || "").trim();
const timeoutMs = Number(process.env.UPSTREAM_TIMEOUT_MS || 120000);

if (!upstreamKey || !relayToken || relayToken.length < 32) {
  throw new Error("NANRUN_API_KEY and a RELAY_TOKEN of at least 32 characters are required");
}

const server = createServer(async (request, response) => {
  response.setHeader("cache-control", "no-store");
  response.setHeader("content-type", "application/json; charset=utf-8");

  if (request.method === "GET" && request.url === "/health") {
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  const requestUrl = new URL(request.url || "/", "http://relay.local");
  if (request.method !== "GET" || requestUrl.pathname !== "/api/xiaomisport") {
    sendJson(response, 404, { code: 404, msg: "not found" });
    return;
  }

  if (!safeEqual(requestUrl.searchParams.get("apikey") || "", relayToken)) {
    sendJson(response, 401, { code: 401, msg: "unauthorized" });
    return;
  }

  const user = String(requestUrl.searchParams.get("user") || "").trim();
  const password = String(requestUrl.searchParams.get("pass") || "");
  const steps = Number(requestUrl.searchParams.get("step"));
  if (!user || user.length > 255 || !password || password.length > 255) {
    sendJson(response, 400, { code: 400, msg: "invalid account" });
    return;
  }
  if (!Number.isInteger(steps) || steps < 1 || steps > 98800) {
    sendJson(response, 400, { code: 400, msg: "invalid steps" });
    return;
  }

  try {
    const upstream = new URL(upstreamUrl);
    upstream.searchParams.set("apikey", upstreamKey);
    upstream.searchParams.set("user", user);
    upstream.searchParams.set("pass", password);
    upstream.searchParams.set("step", String(steps));
    const upstreamResponse = await fetch(upstream, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "dabai-step-relay/1.0" }
    });
    const body = await upstreamResponse.text();
    response.statusCode = upstreamResponse.status;
    response.end(isJson(body) ? body : JSON.stringify({ code: upstreamResponse.status, msg: "invalid upstream response" }));
  } catch {
    sendJson(response, 502, { code: 502, msg: "upstream connection failed" });
  }
});

server.requestTimeout = timeoutMs + 5000;
server.headersTimeout = 10000;
server.listen(port, "0.0.0.0");

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function isJson(value) {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.end(JSON.stringify(payload));
}
