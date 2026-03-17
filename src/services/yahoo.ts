import type {
  AnnualFinancials,
  DividendEvent,
  FundamentalsData,
  HistoricalDataPoint,
  SimulationResult,
  StockData,
  StockMetrics,
  WatchlistItem,
} from "../types/finance";

// ─── Yahoo Finance auth (cookie + crumb) ─────────────────────────────────────

let cachedCookie = "";
let cachedCrumb = "";
let crumbExpiry = 0;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function refreshCrumb(): Promise<void> {
  // Step 1: hit fc.yahoo.com to get a cookie
  const cookieRes = await fetch("https://fc.yahoo.com/", {
    redirect: "manual",
    headers: { "User-Agent": USER_AGENT },
  });
  // Drain the body
  await cookieRes.text();

  const setCookie = cookieRes.headers.get("set-cookie") ?? "";
  cachedCookie = setCookie.split(";")[0] ?? "";

  // Step 2: use the cookie to get a crumb
  const crumbRes = await fetch(
    "https://query2.finance.yahoo.com/v1/test/getcrumb",
    {
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: cachedCookie,
      },
    }
  );
  cachedCrumb = await crumbRes.text();
  crumbExpiry = Date.now() + 5 * 60 * 1000; // 5 min cache
}

async function getCrumb(): Promise<{ cookie: string; crumb: string }> {
  if (!cachedCrumb || Date.now() > crumbExpiry) {
    await refreshCrumb();
  }
  return { cookie: cachedCookie, crumb: cachedCrumb };
}

async function yahooFetch(url: string): Promise<any> {
  const { cookie, crumb } = await getCrumb();
  const separator = url.includes("?") ? "&" : "?";
  const fullUrl = `${url}${separator}crumb=${encodeURIComponent(crumb)}`;

  const res = await fetch(fullUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      Cookie: cookie,
    },
  });

  if (!res.ok) {
    // Crumb may have expired, retry once
    await refreshCrumb();
    const { cookie: c2, crumb: cr2 } = await getCrumb();
    const retryUrl = `${url}${separator}crumb=${encodeURIComponent(cr2)}`;
    const retry = await fetch(retryUrl, {
      headers: { "User-Agent": USER_AGENT, Cookie: c2 },
    });
    if (!retry.ok) throw new Error(`Yahoo Finance API error: ${retry.status}`);
    return retry.json();
  }

  return res.json();
}

// ─── helpers ────────────────────────────────────────────────────────────────

function getPeriodStart(period = "1Y"): Date {
  const d = new Date();
  switch (period) {
    case "1M": d.setMonth(d.getMonth() - 1); break;
    case "3M": d.setMonth(d.getMonth() - 3); break;
    case "6M": d.setMonth(d.getMonth() - 6); break;
    case "5Y": d.setFullYear(d.getFullYear() - 5); break;
    default:   d.setFullYear(d.getFullYear() - 1);
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

function toDateStr(d: Date | string | number): string {
  return new Date(d).toISOString().split("T")[0];
}

function toUnix(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

// ─── chart (prices + optional dividends) ────────────────────────────────────

async function fetchChart(
  ticker: string,
  period1: Date,
  period2?: Date,
  includeDividends = false
): Promise<{ quotes: HistoricalDataPoint[]; dividends: DividendEvent[] }> {
  const p2 = period2 ?? new Date();
  let url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?period1=${toUnix(period1)}&period2=${toUnix(p2)}&interval=1d`;
  if (includeDividends) url += "&events=div";

  const data = await yahooFetch(url);
  const result = data.chart?.result?.[0];
  if (!result) return { quotes: [], dividends: [] };

  const timestamps: number[] = result.timestamp ?? [];
  const ohlcv = result.indicators?.quote?.[0] ?? {};

  const quotes: HistoricalDataPoint[] = timestamps
    .map((ts, i) => ({
      date:   toDateStr(ts * 1000),
      open:   ohlcv.open?.[i]   ?? 0,
      high:   ohlcv.high?.[i]   ?? 0,
      low:    ohlcv.low?.[i]    ?? 0,
      close:  ohlcv.close?.[i]  ?? 0,
      volume: ohlcv.volume?.[i] ?? 0,
    }))
    .filter((q) => q.close > 0);

  const dividends: DividendEvent[] = [];
  if (includeDividends && result.events?.dividends) {
    const divObj = result.events.dividends;
    for (const key of Object.keys(divObj)) {
      dividends.push({
        date:   toDateStr(divObj[key].date * 1000),
        amount: divObj[key].amount ?? 0,
      });
    }
    dividends.sort((a, b) => a.date.localeCompare(b.date));
  }

  return { quotes, dividends };
}

// ─── quote ──────────────────────────────────────────────────────────────────

async function fetchQuote(ticker: string): Promise<any> {
  const data = await yahooFetch(
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(ticker)}`
  );
  return data.quoteResponse?.result?.[0] ?? {};
}

export async function fetchQuotes(tickers: string[]): Promise<any[]> {
  const data = await yahooFetch(
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(tickers.join(","))}`
  );
  return data.quoteResponse?.result ?? [];
}

// ─── quoteSummary ───────────────────────────────────────────────────────────

async function fetchQuoteSummary(
  ticker: string,
  modules: string[]
): Promise<any> {
  const data = await yahooFetch(
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules.join(",")}`
  );
  return data.quoteSummary?.result?.[0] ?? {};
}

// ─── fundamentals timeseries ────────────────────────────────────────────────

async function fetchTimeSeries(
  ticker: string,
  types: string[],
  period1: Date
): Promise<any[]> {
  const url = `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(ticker)}?type=${types.join(",")}&period1=${toUnix(period1)}&period2=${toUnix(new Date())}`;
  const data = await yahooFetch(url);
  return data.timeseries?.result ?? [];
}

function extractTimeSeries(
  results: any[],
  typeKey: string
): { date: string; value: number | null }[] {
  const series = results.find((r: any) => r.meta?.type?.[0] === typeKey);
  if (!series?.[typeKey]) return [];
  return series[typeKey].map((entry: any) => ({
    date: entry.asOfDate ?? "",
    value: entry.reportedValue?.raw ?? null,
  }));
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

  const annualTypes = [
    "annualTotalRevenue", "annualNetIncome", "annualBasicEPS",
    "annualFreeCashFlow", "annualOperatingCashFlow",
  ];
  const quarterlyTypes = [
    "quarterlyTotalRevenue", "quarterlyNetIncome", "quarterlyBasicEPS",
    "quarterlyFreeCashFlow", "quarterlyOperatingCashFlow",
  ];

  const [annualResults, quarterlyResults, summary] = await Promise.all([
    fetchTimeSeries(ticker, annualTypes, fiveYearsAgo),
    fetchTimeSeries(ticker, quarterlyTypes, fiveYearsAgo),
    fetchQuoteSummary(ticker, [
      "financialData",
      "defaultKeyStatistics",
      "summaryDetail",
    ]),
  ]);

  const fd = summary.financialData ?? {};
  const ks = summary.defaultKeyStatistics ?? {};
  const sd = summary.summaryDetail ?? {};

  function val(obj: any): number | null {
    if (obj == null) return null;
    if (typeof obj === "number") return obj;
    return obj.raw ?? obj.fmt ? parseFloat(obj.fmt) : null;
  }

  function buildFinancials(
    results: any[],
    prefix: "annual" | "quarterly"
  ): AnnualFinancials[] {
    const revenue = extractTimeSeries(results, `${prefix}TotalRevenue`);
    const income = extractTimeSeries(results, `${prefix}NetIncome`);
    const eps = extractTimeSeries(results, `${prefix}BasicEPS`);
    const fcf = extractTimeSeries(results, `${prefix}FreeCashFlow`);
    const ocf = extractTimeSeries(results, `${prefix}OperatingCashFlow`);

    // Collect all unique dates
    const dates = new Set<string>();
    for (const arr of [revenue, income, eps, fcf, ocf]) {
      for (const item of arr) if (item.date) dates.add(item.date);
    }

    const lookup = (arr: { date: string; value: number | null }[], date: string) =>
      arr.find((x) => x.date === date)?.value ?? null;

    return Array.from(dates)
      .sort()
      .map((date) => ({
        date,
        totalRevenue: lookup(revenue, date),
        netIncome: lookup(income, date),
        basicEPS: lookup(eps, date),
        freeCashFlow: lookup(fcf, date),
        dividendPerShare: null,
        operatingCashFlow: lookup(ocf, date),
      }));
  }

  return {
    marketCap:         val(sd.marketCap),
    trailingPE:        val(sd.trailingPE),
    trailingEPS:       val(ks.trailingEps),
    totalRevenue:      val(fd.totalRevenue),
    netIncome:         val(fd.netIncome),
    profitMargin:      val(fd.profitMargins),
    freeCashFlow:      val(fd.freeCashflow),
    operatingCashFlow: val(fd.operatingCashflow),
    returnOnEquity:    val(fd.returnOnEquity),
    totalDebt:         val(fd.totalDebt),
    netDebt:           val(fd.netDebt),
    debtToEquity:      val(fd.debtToEquity),
    bookValue:         val(ks.bookValue),
    priceToBook:       val(ks.priceToBook),
    sharesOutstanding: val(ks.sharesOutstanding),
    dividendRate:      val(sd.dividendRate),
    dividendYield:     val(sd.dividendYield),
    payoutRatio:       val(sd.payoutRatio),
    currency:          fd.financialCurrency ?? "USD",
    annualFinancials:    buildFinancials(annualResults, "annual"),
    quarterlyFinancials: buildFinancials(quarterlyResults, "quarterly").slice(-8),
  };
}

// ─── metrics ────────────────────────────────────────────────────────────────

export async function getMetrics(ticker: string): Promise<StockMetrics> {
  const [q, summary] = await Promise.all([
    fetchQuote(ticker),
    fetchQuoteSummary(ticker, ["defaultKeyStatistics", "summaryDetail"]),
  ]);

  const ks = summary.defaultKeyStatistics ?? {};
  const sd = summary.summaryDetail ?? {};

  function val(obj: any): number {
    if (obj == null) return 0;
    if (typeof obj === "number") return obj;
    return obj.raw ?? 0;
  }

  return {
    ticker,
    name:          q.longName ?? q.shortName ?? ticker,
    price:         q.regularMarketPrice          ?? 0,
    change:        q.regularMarketChange         ?? 0,
    changePercent: q.regularMarketChangePercent  ?? 0,
    marketCap:     formatLargeNumber(q.marketCap ?? 0),
    peRatio:       q.trailingPE ?? val(sd.trailingPE),
    eps:           val(ks.trailingEps),
    dividend:      val(sd.dividendRate),
    high52w:       q.fiftyTwoWeekHigh            ?? 0,
    low52w:        q.fiftyTwoWeekLow             ?? 0,
    volume:        formatLargeNumber(q.regularMarketVolume        ?? 0),
    avgVolume:     formatLargeNumber(q.averageDailyVolume3Month ?? q.averageDailyVolume10Day ?? 0),
    beta:          val(ks.beta),
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

  const monthMap = new Map<string, number>();
  for (const row of quotes) {
    const ym = row.date.slice(0, 7);
    if (!monthMap.has(ym)) monthMap.set(ym, row.close);
  }

  const startYear = parseInt(startDate.slice(0, 4));
  let shares = 0;
  let totalInvested = 0;

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

// ─── watchlist helper ───────────────────────────────────────────────────────

export async function getWatchlistQuotes(
  tickers: string[]
): Promise<WatchlistItem[]> {
  const quotes = await fetchQuotes(tickers);
  return quotes.map((q: any) => ({
    ticker: q.symbol ?? "",
    name:   q.longName ?? q.shortName ?? q.symbol ?? "",
    price:  q.regularMarketPrice ?? 0,
    change: q.regularMarketChangePercent ?? 0,
  }));
}
