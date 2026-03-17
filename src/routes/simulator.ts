import { Hono } from "hono";
import { simulate } from "../services/yahoo";

const simulator = new Hono();

const TICKER_RE = /^[A-Z0-9]{1,10}(\.[A-Z]{1,4})?$/;

// POST /api/simulate
// Body: { ticker, monthlyAmount, startDate, endDate }
simulator.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);

  if (!body) return c.json({ error: "Request body is required" }, 400);

  const { ticker, monthlyAmount, startDate, endDate } = body;

  if (!ticker || typeof ticker !== "string")
    return c.json({ error: "ticker is required" }, 400);
  if (!monthlyAmount || typeof monthlyAmount !== "number" || monthlyAmount <= 0)
    return c.json({ error: "monthlyAmount must be a positive number" }, 400);
  if (!startDate || !endDate)
    return c.json({ error: "startDate and endDate are required" }, 400);

  const normalizedTicker = ticker.trim().toUpperCase();
  if (!TICKER_RE.test(normalizedTicker))
    return c.json({ error: "Invalid ticker format" }, 400);

  try {
    const result = await simulate(normalizedTicker, monthlyAmount, startDate, endDate);
    return c.json(result);
  } catch (err: any) {
    const status = err.status ?? 500;
    return c.json({ error: err.message ?? "Simulation failed" }, status);
  }
});

export default simulator;
