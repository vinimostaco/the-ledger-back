import { Hono } from "hono";
import {
  compareStocks,
  getCompanyNews,
  getCompanyProfile,
  getFundamentals,
  getHistory,
  getMetrics,
  getStockData,
} from "../services/yahoo";

const stocks = new Hono();

const TICKER_RE = /^[A-Z0-9]{1,10}(\.[A-Z]{1,4})?$/;

function validateTicker(ticker: string): boolean {
  return TICKER_RE.test(ticker);
}

// GET /api/stocks/compare?tickers=AAPL,MSFT&startDate=...&endDate=...
// NOTE: must be registered BEFORE /:ticker to avoid route conflict
stocks.get("/compare", async (c) => {
  const raw = c.req.query("tickers");
  if (!raw) return c.json({ error: "tickers query param is required" }, 400);

  const tickers = raw.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
  if (tickers.length < 2) return c.json({ error: "At least 2 tickers required" }, 400);
  if (tickers.length > 10) return c.json({ error: "Maximum 10 tickers allowed" }, 400);

  const invalid = tickers.find(t => !validateTicker(t));
  if (invalid) return c.json({ error: `Invalid ticker format: ${invalid}` }, 400);

  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");

  try {
    const data = await compareStocks(tickers, startDate, endDate);
    return c.json(data);
  } catch (err: any) {
    const status = err.status ?? 500;
    return c.json({ error: err.message ?? "Failed to fetch comparison data" }, status);
  }
});

// GET /api/stocks/:ticker — aggregate (history + dividends + fundamentals)
stocks.get("/:ticker", async (c) => {
  const ticker = c.req.param("ticker").toUpperCase();
  if (!validateTicker(ticker)) return c.json({ error: "Invalid ticker format" }, 400);
  const period = c.req.query("period") ?? "1Y";

  try {
    const data = await getStockData(ticker, period);
    return c.json(data);
  } catch (err: any) {
    const status = err.status ?? 500;
    return c.json({ error: err.message ?? "Failed to fetch stock data" }, status);
  }
});

// GET /api/stocks/:ticker/history
stocks.get("/:ticker/history", async (c) => {
  const ticker = c.req.param("ticker").toUpperCase();
  if (!validateTicker(ticker)) return c.json({ error: "Invalid ticker format" }, 400);
  const period = c.req.query("period") ?? "1Y";

  try {
    const data = await getHistory(ticker, period);
    return c.json(data);
  } catch (err: any) {
    const status = err.status ?? 500;
    return c.json({ error: err.message ?? "Failed to fetch history" }, status);
  }
});

// GET /api/stocks/:ticker/fundamentals
stocks.get("/:ticker/fundamentals", async (c) => {
  const ticker = c.req.param("ticker").toUpperCase();
  if (!validateTicker(ticker)) return c.json({ error: "Invalid ticker format" }, 400);

  try {
    const data = await getFundamentals(ticker);
    return c.json(data);
  } catch (err: any) {
    const status = err.status ?? 500;
    return c.json({ error: err.message ?? "Failed to fetch fundamentals" }, status);
  }
});

// GET /api/stocks/:ticker/profile
stocks.get("/:ticker/profile", async (c) => {
  const ticker = c.req.param("ticker").toUpperCase();
  if (!validateTicker(ticker)) return c.json({ error: "Invalid ticker format" }, 400);

  try {
    const data = await getCompanyProfile(ticker);
    return c.json(data);
  } catch (err: any) {
    const status = err.status ?? 500;
    return c.json({ error: err.message ?? "Failed to fetch profile" }, status);
  }
});

// GET /api/stocks/:ticker/news
stocks.get("/:ticker/news", async (c) => {
  const ticker = c.req.param("ticker").toUpperCase();
  if (!validateTicker(ticker)) return c.json({ error: "Invalid ticker format" }, 400);

  try {
    const data = await getCompanyNews(ticker);
    return c.json(data);
  } catch (err: any) {
    const status = err.status ?? 500;
    return c.json({ error: err.message ?? "Failed to fetch news" }, status);
  }
});

// GET /api/stocks/:ticker/metrics
stocks.get("/:ticker/metrics", async (c) => {
  const ticker = c.req.param("ticker").toUpperCase();
  if (!validateTicker(ticker)) return c.json({ error: "Invalid ticker format" }, 400);

  try {
    const data = await getMetrics(ticker);
    return c.json(data);
  } catch (err: any) {
    const status = err.status ?? 500;
    return c.json({ error: err.message ?? "Failed to fetch metrics" }, status);
  }
});

export default stocks;
