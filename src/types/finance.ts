export interface HistoricalDataPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DividendEvent {
  date: string;
  amount: number;
}

export interface AnnualFinancials {
  date: string;
  totalRevenue: number | null;
  netIncome: number | null;
  basicEPS: number | null;
  freeCashFlow: number | null;
  dividendPerShare: number | null;
  operatingCashFlow: number | null;
}

export interface FundamentalsData {
  marketCap: number | null;
  trailingPE: number | null;
  trailingEPS: number | null;
  totalRevenue: number | null;
  netIncome: number | null;
  profitMargin: number | null;
  freeCashFlow: number | null;
  operatingCashFlow: number | null;
  returnOnEquity: number | null;
  totalDebt: number | null;
  netDebt: number | null;
  debtToEquity: number | null;
  bookValue: number | null;
  priceToBook: number | null;
  sharesOutstanding: number | null;
  dividendRate: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
  currency: string;
  annualFinancials: AnnualFinancials[];
  quarterlyFinancials: AnnualFinancials[];
}

export interface StockData {
  ticker: string;
  historical: HistoricalDataPoint[];
  dividends: DividendEvent[];
  fundamentals?: FundamentalsData;
}

export interface StockMetrics {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap: string;
  peRatio: number;
  eps: number;
  dividend: number;
  high52w: number;
  low52w: number;
  volume: string;
  avgVolume: string;
  beta: number;
}

export interface WatchlistItem {
  ticker: string;
  name: string;
  price: number;
  change: number;
}

export interface SimulationResult {
  totalInvested: number;
  finalBalance: number;
  totalReturn: number;
  data: {
    period: string;
    invested: number;
    balance: number;
  }[];
}
