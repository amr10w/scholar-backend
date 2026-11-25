import { safeExternalUrl } from "@/src/components/catalog/CatalogDetails";
import { avatarTone } from "@/src/features/research/researchers/researcher.utils";
import type { CompanySummary, Job } from "./jobs.type";

export function jobLocation(job: Job): string {
  if (job.isRemote) return "Remote";
  if (job.location?.trim()) return job.location.trim();
  const branchText = [job.branch?.city, job.branch?.country]
    .filter(Boolean)
    .join(", ");
  if (branchText) return branchText;
  if (job.company?.headquartersCountry?.trim()) {
    return job.company.headquartersCountry.trim();
  }
  return "";
}

export function jobLocationBadge(job: Job): string | null {
  if (job.isRemote) return "Remote";
  const raw = (job.branch?.country || job.location || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes("egypt") || lower.includes("cairo") || lower.includes("alexandria")) {
    return "EG";
  }
  if (lower.includes("saudi") || lower.includes("riyadh") || lower.includes("jeddah")) {
    return "SA";
  }
  if (lower.includes("emirates") || lower.includes("uae") || lower.includes("dubai")) {
    return "UAE";
  }
  if (
    lower.includes("united states") ||
    lower === "us" ||
    lower === "usa" ||
    lower.includes(", us")
  ) {
    return "US";
  }
  if (lower.includes("germany") || lower.includes("munich") || lower.includes("berlin")) {
    return "DE";
  }
  if (lower.includes("united kingdom") || lower.includes("london") || lower === "uk") {
    return "UK";
  }
  if (lower.includes("france") || lower.includes("paris")) return "FR";
  if (lower.includes("spain")) return "ES";
  if (lower.includes("italy")) return "IT";
  return raw;
}

export function jobDomains(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [
      ...new Set(
        value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return jobDomains(parsed);
    } catch {
      return [value.trim()];
    }
  }
  return [];
}

/** Hydration-safe UTC date formatting ("Nov 25, 2026"). Returns null if invalid/missing. */
export function postedDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Hydration-safe ISO date ("2026-11-25") for latest positions list. */
export function shortIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function applyCtaLabel(applyLink: string | null | undefined): string {
  const safe = safeExternalUrl(applyLink);
  if (!safe) return "Apply Now";
  const lower = safe.toLowerCase();
  if (lower.includes("linkedin.com")) return "Apply on LinkedIn";
  if (lower.includes("wuzzuf.net")) return "Apply on Wuzzuf";
  if (lower.includes("whatsapp.com") || lower.includes("wa.me")) {
    return "Apply on WhatsApp";
  }
  return "Apply Now";
}

/** Deterministic company avatar tile color using the current repo's avatarTone scale. */
export function companyAvatarTone(id: number | string): string {
  if (typeof id === "number" && Number.isFinite(id)) {
    return avatarTone(id);
  }
  const str = String(id || "");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarTone(Math.abs(hash));
}

export function companyInitials(
  name: string | null | undefined,
  shortName?: string | null,
): string {
  if (shortName?.trim()) return shortName.trim().slice(0, 2).toUpperCase();
  const clean = (name ?? "").trim();
  if (!clean) return "?";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

export function formatSourceLabel(source: string | null | undefined): string {
  if (!source) return "";
  const lower = source.trim().toLowerCase();
  if (lower === "linkedin") return "LinkedIn";
  if (lower === "wuzzuf") return "Wuzzuf";
  return source.trim();
}

export function formatCompanyCountLabel(company: CompanySummary): string {
  return company.openJobsCount === 1
    ? "1 open position"
    : `${company.openJobsCount} open positions`;
}
