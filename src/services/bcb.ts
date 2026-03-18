import type {
  MacroDataPoint,
  MacroHistoryResponse,
  MacroIndicatorSnapshot,
  MacroOverview,
} from "../types/finance";

// ─── Series registry ─────────────────────────────────────────────────────────

const SERIES = {
  selic:   { code: 432, label: "SELIC Meta",  unit: "% a.a." },
  ipca:    { code: 433, label: "IPCA",         unit: "% a.m." },
  igpm:    { code: 189, label: "IGP-M",        unit: "% a.m." },
  usd_brl: { code: 1,   label: "USD/BRL",      unit: "BRL"    },
} as const;

export type Indicator = keyof typeof SERIES;

export const INDICATORS = Object.keys(SERIES) as Indicator[];

// ─── TTL cache ────────────────────────────────────────────────────────────────

const cache = new Map<string, { data: unknown; expiry: number }>();

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiry) return Promise.resolve(entry.data as T);
  return fn().then((data) => {
    cache.set(key, { data, expiry: Date.now() + ttlMs });
    return data;
  });
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

// BCB API uses DD/MM/YYYY
function toBcbDate(d: Date): string {
  const day   = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${d.getFullYear()}`;
}

// BCB returns DD/MM/YYYY → convert to YYYY-MM-DD
function fromBcbDate(s: string): string {
  const [day, month, year] = s.split("/");
  return `${year}-${month}-${day}`;
}

function periodStart(period: string): Date {
  const d = new Date();
  switch (period) {
    case "3Y": d.setFullYear(d.getFullYear() - 3); break;
    case "5Y": d.setFullYear(d.getFullYear() - 5); break;
    default:   d.setFullYear(d.getFullYear() - 1); // 1Y default
  }
  return d;
}

// ─── Raw BCB SGS fetch ────────────────────────────────────────────────────────

const BCB_SGS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";

interface SgsPoint {
  data:  string; // DD/MM/YYYY
  valor: string;
}

async function fetchSgs(
  code: number,
  params: Record<string, string>
): Promise<SgsPoint[]> {
  const qs = new URLSearchParams({ ...params, formato: "json" });
  const url = `${BCB_SGS}.${code}/dados?${qs}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`BCB API error ${res.status} for series ${code}`);
  return res.json();
}

async function fetchLatest(code: number): Promise<SgsPoint> {
  const url = `${BCB_SGS}.${code}/dados/ultimos/1?formato=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`BCB API error ${res.status} for series ${code}`);
  const data: SgsPoint[] = await res.json();
  if (!data.length) throw new Error(`No data returned for series ${code}`);
  return data[0];
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getMacroOverview(): Promise<MacroOverview> {
  return cached("macro:overview", 30 * 60 * 1000, async () => {
    const entries = await Promise.all(
      INDICATORS.map(async (key) => {
        const { code, label, unit } = SERIES[key];
        const point = await fetchLatest(code);
        const snapshot: MacroIndicatorSnapshot = {
          label,
          unit,
          value: parseFloat(point.valor),
          date:  fromBcbDate(point.data),
        };
        return [key, snapshot] as const;
      })
    );
    return Object.fromEntries(entries) as MacroOverview;
  });
}

export async function getMacroHistory(
  indicator: Indicator,
  period = "1Y"
): Promise<MacroHistoryResponse> {
  const cacheKey = `macro:history:${indicator}:${period}`;
  return cached(cacheKey, 60 * 60 * 1000, async () => {
    const { code, label, unit } = SERIES[indicator];
    const start = periodStart(period);
    const today = new Date();

    const points = await fetchSgs(code, {
      dataInicial: toBcbDate(start),
      dataFinal:   toBcbDate(today),
    });

    const history: MacroDataPoint[] = points
      .filter((p) => p.valor !== null && p.valor !== "")
      .map((p) => ({
        date:  fromBcbDate(p.data),
        value: parseFloat(p.valor),
      }));

    return { indicator, label, unit, history };
  });
}
