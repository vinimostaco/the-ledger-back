import { Hono } from "hono";
import { getMacroHistory, getMacroOverview, INDICATORS } from "../services/bcb";
import type { Indicator } from "../services/bcb";

const macro = new Hono();

const VALID_PERIODS = new Set(["1Y", "3Y", "5Y"]);

// GET /api/macro — current snapshot of all indicators
macro.get("/", async (c) => {
  try {
    const data = await getMacroOverview();
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message ?? "Failed to fetch macro data" }, 500);
  }
});

// GET /api/macro/:indicator/history?period=1Y|3Y|5Y
macro.get("/:indicator/history", async (c) => {
  const indicator = c.req.param("indicator") as Indicator;

  if (!INDICATORS.includes(indicator)) {
    return c.json(
      { error: `Unknown indicator. Valid values: ${INDICATORS.join(", ")}` },
      400
    );
  }

  const period = c.req.query("period") ?? "1Y";
  if (!VALID_PERIODS.has(period)) {
    return c.json({ error: "period must be one of: 1Y, 3Y, 5Y" }, 400);
  }

  try {
    const data = await getMacroHistory(indicator, period);
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message ?? "Failed to fetch macro history" }, 500);
  }
});

export default macro;
