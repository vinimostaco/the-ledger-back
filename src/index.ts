import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import stocks from "./routes/stocks";
import watchlist from "./routes/watchlist";
import simulator from "./routes/simulator";

const app = new Hono();

// ─── Rate limiting ────────────────────────────────────────────────────────────

const rateLimitWindows = new Map<string, number[]>();

function isRateLimited(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (rateLimitWindows.get(ip) ?? []).filter(t => now - t < windowMs);
  if (timestamps.length >= limit) return true;
  timestamps.push(now);
  rateLimitWindows.set(ip, timestamps);
  return false;
}

// Prune stale entries every 5 minutes to prevent unbounded memory growth
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [ip, timestamps] of rateLimitWindows) {
    const fresh = timestamps.filter(t => t > cutoff);
    if (fresh.length === 0) rateLimitWindows.delete(ip);
    else rateLimitWindows.set(ip, fresh);
  }
}, 5 * 60 * 1000);

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000", "http://localhost:4000", "http://localhost:8080", "https://theledger-7lw.pages.dev"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

// Stock endpoints: 60 req/min per IP
app.use("/api/stocks/*", async (c, next) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (isRateLimited(ip, 60, 60_000))
    return c.json({ error: "Too many requests" }, 429);
  return next();
});

// Simulator: 10 req/min per IP (heavier operation)
app.use("/api/simulate/*", async (c, next) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (isRateLimited(ip, 10, 60_000))
    return c.json({ error: "Too many requests" }, 429);
  return next();
});

app.get("/", (c) => c.json({ status: "ok", service: "the-ledger-back" }));

app.route("/api/stocks", stocks);
app.route("/api/watchlist", watchlist);
app.route("/api/simulate", simulator);

export default app;
