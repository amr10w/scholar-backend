import { api, type ApiResponse } from "@/src/lib/api-client";

export type YearRange = { fromYear: number; toYear: number } | null;

export type YearCatalog = "papers" | "projects";

export interface YearCount {
  year: number;
  count: number;
}

export interface ResearchYears {
  years: number[];
  counts: YearCount[];
}

function isValidCatalogYear(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 9999
  );
}

export function normalizeResearchYears(
  rawYears: unknown,
  rawCounts?: unknown,
): ResearchYears {
  const countsByYear = new Map<number, number>();

  if (Array.isArray(rawCounts)) {
    for (const entry of rawCounts) {
      const year = (entry as Partial<YearCount> | null)?.year;
      const count = (entry as Partial<YearCount> | null)?.count;
      if (isValidCatalogYear(year)) {
        const safeCount =
          typeof count === "number" && Number.isFinite(count) && count >= 0
            ? Math.trunc(count)
            : 0;
        countsByYear.set(year, safeCount);
      }
    }
  }

  const yearSet = new Set<number>(countsByYear.keys());
  if (Array.isArray(rawYears)) {
    for (const year of rawYears) {
      if (isValidCatalogYear(year)) {
        yearSet.add(year);
      }
    }
  }

  const years = [...yearSet].sort((a, b) => a - b);
  const counts =
    countsByYear.size > 0
      ? years
          .filter((year) => countsByYear.has(year))
          .map((year) => ({ year, count: countsByYear.get(year) ?? 0 }))
      : [];

  return { years, counts };
}

export async function fetchResearchYears(
  catalog: YearCatalog,
  signal: AbortSignal,
): Promise<ResearchYears> {
  const { data } = await api.get<
    ApiResponse<number[]> & { counts?: YearCount[] }
  >(`/${catalog}/years`, {
    signal,
  });
  return normalizeResearchYears(data?.data, data?.counts);
}
