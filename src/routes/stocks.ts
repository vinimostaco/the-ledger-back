import { Hono } from "hono";
import {
  compareStocks,
  getFundamentals,
  getHistory,
  getMetrics,
  getStockData,
} from "../services/yahoo";

const stocks = new Hono();

// GET /api/stocks/compare?tickers=AAPL,MSFT&startDate=...&endDate=...
// NOTE: must be registered BEFORE /:ticker to avoid route conflict
stocks.get("/compare", async (c) => {
  const raw = c.req.query("tickers");
  if (!raw) return c.json({ error: "tickers query param is required" }, 400);

  const tickers = raw.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
  if (tickers.length < 2) return c.json({ error: "At least 2 tickers required" }, 400);

  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");

  try {
    const data = await compareStocks(tickers, startDate, endDate);
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message ?? "Failed to fetch comparison data" }, 500);
  }
});

// GET /api/stocks/:ticker — aggregate (history + dividends + fundamentals)
stocks.get("/:ticker", async (c) => {
  const ticker = c.req.param("ticker").toUpperCase();
  const period = c.req.query("period") ?? "1Y";

  try {
    const data = await getStockData(ticker, period);
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message ?? "Failed to fetch stock data" }, 500);
  }
});

// GET /api/stocks/:ticker/history
stocks.get("/:ticker/history", async (c) => {
  const ticker = c.req.param("ticker").toUpperCase();
  const period = c.req.query("period") ?? "1Y";

  try {
    const data = await getHistory(ticker, period);
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message ?? "Failed to fetch history" }, 500);
  }
});

// GET /api/stocks/:ticker/fundamentals
stocks.get("/:ticker/fundamentals", async (c) => {
  const ticker = c.req.param("ticker").toUpperCase();

  try {
    const data = await getFundamentals(ticker);
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message ?? "Failed to fetch fundamentals" }, 500);
  }
});

// GET /api/stocks/:ticker/metrics
stocks.get("/:ticker/metrics", async (c) => {
  const ticker = c.req.param("ticker").toUpperCase();

  try {
    const data = await getMetrics(ticker);
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message ?? "Failed to fetch metrics" }, 500);
  }
});

export default stocks;
