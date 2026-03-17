import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import stocks from "./routes/stocks";
import watchlist from "./routes/watchlist";
import simulator from "./routes/simulator";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000", "https://theledger-7lw.pages.dev"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })
);

app.get("/", (c) => c.json({ status: "ok", service: "the-ledger-back" }));

app.route("/api/stocks", stocks);
app.route("/api/watchlist", watchlist);
app.route("/api/simulate", simulator);

export default app;
