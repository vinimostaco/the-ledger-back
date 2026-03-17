import { Hono } from "hono";
import YahooFinance from "yahoo-finance2";
const yf = new YahooFinance();
import type { WatchlistItem } from "../types/finance";

const watchlist = new Hono();

// In-memory store (per-user key = userId from auth middleware).
// TODO: replace with a real DB once auth is wired up.
// The auth middleware should set c.set("userId", "<id>") before these routes.
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
    const quotes = await Promise.all(
      tickers.map((ticker) => yf.quote(ticker))
    );

    const items: WatchlistItem[] = quotes.map((q: any) => ({
      ticker: q.symbol ?? "",
      name: q.longName ?? q.shortName ?? q.symbol ?? "",
      price: q.regularMarketPrice ?? 0,
      change: q.regularMarketChangePercent ?? 0,
    }));

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
