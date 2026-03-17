import { Hono } from "hono";
import { getWatchlistQuotes } from "../services/yahoo";
import type { WatchlistItem } from "../types/finance";

const watchlist = new Hono();

// In-memory store (per-user key = userId from auth middleware).
// TODO: replace with a real DB once auth is wired up.
const store = new Map<string, Set<string>>();

function getList(userId: string): Set<string> {
  if (!store.has(userId)) store.set(userId, new Set());
  return store.get(userId)!;
}

// Placeholder — swap this out when you add real auth middleware.
function getUserId(c: any): string {
  return c.get("userId") ?? "anonymous";
}

// GET /api/watchlist
watchlist.get("/", async (c) => {
  const userId = getUserId(c);
  const tickers = Array.from(getList(userId));

  if (!tickers.length) return c.json([]);

  try {
    const items = await getWatchlistQuotes(tickers);
    return c.json(items);
  } catch (err: any) {
    return c.json({ error: err.message ?? "Failed to fetch watchlist" }, 500);
  }
});

// POST /api/watchlist  { ticker: string }
watchlist.post("/", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => null);

  if (!body?.ticker || typeof body.ticker !== "string") {
    return c.json({ error: "ticker is required" }, 400);
  }

  const ticker = body.ticker.trim().toUpperCase();
  getList(userId).add(ticker);
  return c.json({ ok: true, ticker });
});

// DELETE /api/watchlist/:ticker
watchlist.delete("/:ticker", (c) => {
  const userId = getUserId(c);
  const ticker = c.req.param("ticker").toUpperCase();
  const removed = getList(userId).delete(ticker);
  return c.json({ ok: removed });
});

export default watchlist;
