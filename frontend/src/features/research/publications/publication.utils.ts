import type {
  DecimalString,
  Publication,
  PublicationEditorialStat,
  PublicationPricing,
  PublicationYearlyMetric,
} from "./publication.type";

const PLACEHOLDER_VALUES = new Set(["", "unknown", "n/a", "na", "none", "null", "-", "—"]);

export function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && !PLACEHOLDER_VALUES.has(value.trim().toLowerCase());
}

/**
 * Formats an ISSN / eISSN / CD-ROM ISSN string into the standard 4+4 format (e.g. "1076-9757" or "2041-172X").
 * Returns null if the input is null, empty, or a placeholder.
 */
export function formatIssn(value: string | null | undefined): string | null {
  if (!hasText(value)) return null;
  const compact = value.trim().replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{7}[\dX]$/.test(compact)) {
    return `${compact.slice(0, 4)}-${compact.slice(4)}`;
  }
  return value.trim();
}

/**
 * Returns a trimmed external URL only if it is a valid http(s) URL.
 * Rejects ftp://, javascript:, data:, relative paths, or malformed strings.
 */
export function safePublicationUrl(value: string | null | undefined): string | null {
  if (!hasText(value)) return null;
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}

export function toNumber(
  value: DecimalString | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function latestMetric(
  publication: Publication,
): PublicationYearlyMetric | null {
  const metrics = publication.yearlyMetrics;
  if (!metrics?.length) return null;
  return metrics.reduce((newest, metric) =>
    metric.metricYear > newest.metricYear ? metric : newest,
  );
}

export function editorialStat(
  publication: Publication,
): PublicationEditorialStat | null {
  return publication.editorialStats?.[0] ?? null;
}

export function primaryPricing(
  publication: Publication,
  preferredCurrency?: string,
): PublicationPricing | null {
  const pricings = publication.pricings;
  if (!pricings?.length) return null;

  const matching = preferredCurrency
    ? pricings.filter((pricing) => pricing.currency === preferredCurrency)
    : [];
  const pool = matching.length ? matching : pricings;

  return pool.reduce((newest, pricing) =>
    pricing.pricingYear > newest.pricingYear ? pricing : newest,
  );
}

export function daysToWeeks(days: DecimalString | null): number | null {
  const parsed = toNumber(days);
  return parsed === null ? null : Math.round((parsed / 7) * 10) / 10;
}

export function formatCost(pricing: PricingLike | null): string {
  if (!pricing) return "—";
  const cost = toNumber(pricing.cost);
  if (cost === null) return "—";

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: pricing.currency,
      maximumFractionDigits: 0,
    }).format(cost);
  } catch {
    return `${cost.toLocaleString("en-US")} ${pricing.currency}`;
  }
}

interface PricingLike {
  cost: DecimalString;
  currency: string;
}

export function formatNumber(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${value}${suffix}`;
}

/**
 * @deprecated Backend now handles text search via the `/api/publications`
 * endpoint (`search` param). Keep this only as a fallback; do not use it for new filtering logic.
 */
export function matchesSearch(
  publication: Publication,
  query: string,
): boolean {
  const term = query.trim().toLowerCase();
  if (!term) return true;

  return [
    publication.title,
    publication.acronym,
    publication.publisher,
    publication.subCategory?.name,
    publication.subCategory?.domain?.name,
  ].some((field) => field?.toLowerCase().includes(term));
}
