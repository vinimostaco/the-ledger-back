import YahooFinance from "yahoo-finance2";
import type {
  AnnualFinancials,
  DividendEvent,
  FundamentalsData,
  HistoricalDataPoint,
  SimulationResult,
  StockData,
  StockMetrics,
} from "../types/finance";

const yf = new YahooFinance();

// ─── helpers ────────────────────────────────────────────────────────────────

function getPeriodStart(period = "1Y"): Date {
  const d = new Date();
  switch (period) {
    case "1M": d.setMonth(d.getMonth() - 1); break;
    case "3M": d.setMonth(d.getMonth() - 3); break;
    case "6M": d.setMonth(d.getMonth() - 6); break;
    case "5Y": d.setFullYear(d.getFullYear() - 5); break;
    default:   d.setFullYear(d.getFullYear() - 1); // 1Y
  }
  return d;
}

function formatLargeNumber(n: number): string {
  if (!n || isNaN(n)) return "0";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3)  return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(2);
}

function toDateStr(d: Date | string): string {
  return new Date(d).toISOString().split("T")[0];
}

// ─── chart (prices + optional dividends) ────────────────────────────────────

async function fetchChart(
  ticker: string,
  period1: Date,
  period2?: Date,
  includeDividends = false
): Promise<{ quotes: HistoricalDataPoint[]; dividends: DividendEvent[] }> {
  const opts: any = {
    period1,
    period2: period2 ?? new Date(),
    interval: "1d",
    return: "array",
  };
  if (includeDividends) opts.events = "div";

  const result = await yf.chart(ticker, opts) as any;

  const quotes: HistoricalDataPoint[] = (result.quotes ?? []).map((q: any) => ({
    date:   toDateStr(q.date),
    open:   q.open   ?? 0,
    high:   q.high   ?? 0,
    low:    q.low    ?? 0,
    close:  q.close  ?? 0,
    volume: q.volume ?? 0,
  }));

  const dividends: DividendEvent[] = includeDividends
    ? (result.events?.dividends ?? []).map((d: any) => ({
        date:   toDateStr(d.date),
        amount: d.amount ?? 0,
      }))
    : [];

  return { quotes, dividends };
}

// ─── history ────────────────────────────────────────────────────────────────

export async function getHistory(
  ticker: string,
  period = "1Y"
): Promise<HistoricalDataPoint[]> {
  const { quotes } = await fetchChart(ticker, getPeriodStart(period));
  return quotes;
}

// ─── dividends ──────────────────────────────────────────────────────────────

export async function getDividends(
  ticker: string,
  period = "1Y"
): Promise<DividendEvent[]> {
  const { dividends } = await fetchChart(ticker, getPeriodStart(period), undefined, true);
  return dividends;
}

// ─── fundamentals ───────────────────────────────────────────────────────────

export async function getFundamentals(
  ticker: string
): Promise<FundamentalsData> {
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

  const [
    annualFinancials,
    annualCashflow,
    quarterlyFinancials,
    quarterlyCashflow,
    summary,
  ] = await Promise.all([
    yf.fundamentalsTimeSeries(ticker, { module: "financials", type: "annual",    period1: fiveYearsAgo }) as any,
    yf.fundamentalsTimeSeries(ticker, { module: "cash-flow",  type: "annual",    period1: fiveYearsAgo }) as any,
    yf.fundamentalsTimeSeries(ticker, { module: "financials", type: "quarterly", period1: fiveYearsAgo }) as any,
    yf.fundamentalsTimeSeries(ticker, { module: "cash-flow",  type: "quarterly", period1: fiveYearsAgo }) as any,
    yf.quoteSummary(ticker, {
      modules: ["financialData", "defaultKeyStatistics", "summaryDetail"],
    }),
  ]);

  const fd = summary.financialData as any;
  const ks = summary.defaultKeyStatistics as any;
  const sd = summary.summaryDetail as any;

  // Map date → cashflow row for quick lookup
  function cfMap(rows: any[]): Map<string, any> {
    const m = new Map<string, any>();
    for (const r of rows) m.set(toDateStr(r.date), r);
    return m;
  }

  function buildFinancials(incRows: any[], cfRows: any[]): AnnualFinancials[] {
    const cf = cfMap(cfRows);
    return incRows
      .map((inc: any) => {
        const dateStr = toDateStr(inc.date);
        const c = cf.get(dateStr) ?? {};
        return {
          date:             dateStr,
          totalRevenue:     inc.totalRevenue     ?? null,
          netIncome:        inc.netIncome        ?? null,
          basicEPS:         inc.basicEPS         ?? null,
          freeCashFlow:     c.freeCashFlow       ?? null,
          dividendPerShare: null,
          operatingCashFlow: c.cashFlowFromContinuingOperatingActivities ?? c.operatingCashFlow ?? null,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date)); // oldest → newest
  }

  return {
    marketCap:        sd?.marketCap        ?? null,
    trailingPE:       sd?.trailingPE       ?? null,
    trailingEPS:      ks?.trailingEps      ?? null,
    totalRevenue:     fd?.totalRevenue     ?? null,
    netIncome:        fd?.netIncome        ?? null,
    profitMargin:     fd?.profitMargins    ?? null,
    freeCashFlow:     fd?.freeCashflow     ?? null,
    operatingCashFlow: fd?.operatingCashflow ?? null,
    returnOnEquity:   fd?.returnOnEquity   ?? null,
    totalDebt:        fd?.totalDebt        ?? null,
    netDebt:          fd?.netDebt          ?? null,
    debtToEquity:     fd?.debtToEquity     ?? null,
    bookValue:        ks?.bookValue        ?? null,
    priceToBook:      ks?.priceToBook      ?? null,
    sharesOutstanding: ks?.sharesOutstanding ?? null,
    dividendRate:     sd?.dividendRate     ?? null,
    dividendYield:    sd?.dividendYield    ?? null,
    payoutRatio:      sd?.payoutRatio      ?? null,
    currency:         fd?.financialCurrency ?? "USD",
    annualFinancials:    buildFinancials(annualFinancials,    annualCashflow),
    quarterlyFinancials: buildFinancials(quarterlyFinancials.slice(-8), quarterlyCashflow),
  };
}

// ─── metrics ────────────────────────────────────────────────────────────────

export async function getMetrics(ticker: string): Promise<StockMetrics> {
  const [quote, summary] = await Promise.all([
    yf.quote(ticker),
    yf.quoteSummary(ticker, { modules: ["defaultKeyStatistics", "summaryDetail"] }),
  ]);

  const q  = quote as any;
  const ks = summary.defaultKeyStatistics as any;
  const sd = summary.summaryDetail as any;

  return {
    ticker,
    name:          q.longName ?? q.shortName ?? ticker,
    price:         q.regularMarketPrice          ?? 0,
    change:        q.regularMarketChange         ?? 0,
    changePercent: q.regularMarketChangePercent  ?? 0,
    marketCap:     formatLargeNumber(q.marketCap ?? 0),
    peRatio:       q.trailingPE ?? sd?.trailingPE ?? 0,
    eps:           ks?.trailingEps               ?? 0,
    dividend:      sd?.dividendRate              ?? 0,
    high52w:       q.fiftyTwoWeekHigh            ?? 0,
    low52w:        q.fiftyTwoWeekLow             ?? 0,
    volume:        formatLargeNumber(q.regularMarketVolume        ?? 0),
    avgVolume:     formatLargeNumber(q.averageDailyVolume3Month ?? q.averageDailyVolume10Day ?? 0),
    beta:          ks?.beta                      ?? 0,
  };
}

// ─── aggregate ──────────────────────────────────────────────────────────────

export async function getStockData(
  ticker: string,
  period = "1Y"
): Promise<StockData> {
  const [{ quotes: historical, dividends }, fundamentals] = await Promise.all([
    fetchChart(ticker, getPeriodStart(period), undefined, true),
    getFundamentals(ticker),
  ]);
  return { ticker, historical, dividends, fundamentals };
}

// ─── compare ────────────────────────────────────────────────────────────────

export async function compareStocks(
  tickers: string[],
  startDate?: string,
  endDate?: string
): Promise<StockData[]> {
  const period1 = startDate ? new Date(startDate) : getPeriodStart("1Y");
  const period2 = endDate ? new Date(endDate) : new Date();

  return Promise.all(
    tickers.map(async (ticker) => {
      const [{ quotes: historical, dividends }, fundamentals] = await Promise.all([
        fetchChart(ticker, period1, period2, true),
        getFundamentals(ticker),
      ]);
      return { ticker, historical, dividends, fundamentals };
    })
  );
}

// ─── simulator ──────────────────────────────────────────────────────────────

export async function simulate(
  ticker: string,
  monthlyAmount: number,
  startDate: string,
  endDate: string
): Promise<SimulationResult> {
  const { quotes } = await fetchChart(ticker, new Date(startDate), new Date(endDate));

  if (!quotes.length) throw new Error(`No historical data found for ${ticker}`);

  // First trading day of each month → that month's entry price
  const monthMap = new Map<string, number>();
  for (const row of quotes) {
    const ym = row.date.slice(0, 7);
    if (!monthMap.has(ym)) monthMap.set(ym, row.close);
  }

  const startYear = parseInt(startDate.slice(0, 4));
  let shares = 0;
  let totalInvested = 0;

  // year index → last state in that year (end-of-year snapshot)
  const yearlyMap = new Map<number, { invested: number; balance: number }>();

  for (const [ym, price] of monthMap) {
    if (!price) continue;
    totalInvested += monthlyAmount;
    shares += monthlyAmount / price;
    const balance = shares * price;
    const yearIndex = parseInt(ym.slice(0, 4)) - startYear;
    yearlyMap.set(yearIndex, { invested: totalInvested, balance });
  }

  const data = Array.from(yearlyMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([idx, { invested, balance }]) => ({
      period: `Year ${idx}`,
      invested,
      balance,
    }));

  const last = data[data.length - 1];
  const totalReturn =
    totalInvested > 0 ? ((last.balance - totalInvested) / totalInvested) * 100 : 0;

  return { totalInvested, finalBalance: last.balance, totalReturn, data };
}
