import type {
  CompanyFilters,
  JobFilters,
  JobType,
  Seniority,
} from "./jobs.type";

export const JOB_TYPES: Record<JobType, string> = {
  fullTime: "Full-time",
  partTime: "Part-time",
  internship: "Internship",
};

export const SENIORITY_LEVELS: Record<Seniority, string> = {
  junior: "Junior",
  mid: "Mid-Level",
  senior: "Senior",
  lead: "Lead",
};

export const SOURCE_LABELS: Record<string, string> = {
  linkedin: "LinkedIn",
  wuzzuf: "Wuzzuf",
};

export const PRIORITY_DISCIPLINES = [
  "ai",
  "digital",
  "testing",
  "computer engineering",
  "electronics engineering",
];

export const EMPTY_FILTERS: JobFilters = {
  search: "",
  countries: [],
  disciplines: [],
  companyIds: [],
  source: "",
  type: "",
  seniority: "",
  sort: "newest",
  page: 1,
};

export const EMPTY_COMPANY_FILTERS: CompanyFilters = {
  search: "",
  countries: [],
  category: "",
  size: "",
  page: 1,
};

export const PAGE_SIZE = 12;
export const COMPANIES_PAGE_SIZE = 24;
