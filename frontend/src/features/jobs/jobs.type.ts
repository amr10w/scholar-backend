import type { Paginated } from "@/src/lib/api-client";

export type JobType = "fullTime" | "partTime" | "internship";
export type Seniority = "junior" | "mid" | "senior" | "lead";
export type JobSource = "linkedin" | "wuzzuf" | (string & {});

export interface Job {
  id: number;
  title: string;
  industry: string | null;
  domains: string[];
  type: JobType | null;
  seniority: Seniority | null;
  source: JobSource | null;
  isRemote: boolean;
  location: string | null;
  description: string | null;
  requirements: string | null;
  salary: string | null;
  applyLink: string | null;
  postedAt: string | null;
  numberVisited: number;
  company: {
    id: number;
    name: string;
    shortName: string | null;
    website: string | null;
    headquartersCountry: string | null;
  };
  branch: { id: number; city: string | null; country: string | null };
}

export interface JobFilters {
  search: string;
  countries: string[];
  disciplines: string[];
  companyIds: number[];
  source: string;
  type: JobType | "";
  seniority: Seniority | "";
  sort: "newest" | "oldest" | "title";
  page: number;
}

export interface JobCompanyFacet {
  id: number;
  name: string;
  featured?: boolean;
}

export interface JobFacets {
  countries: string[];
  countryCounts: Record<string, number>;
  disciplines: string[];
  companies: JobCompanyFacet[];
  sources: string[];
}

export type JobsResponse = Paginated<Job>;

export interface CompanyMonthlyStat {
  companyId: number;
  yearMonth: string;
  jobCount: number;
}

export interface CompanySummary {
  id: number;
  slug: string | null;
  name: string;
  shortName: string | null;
  industry: string | null;
  size: string | null;
  description: string | null;
  headquartersCountry: string | null;
  globalPresence: string[];
  website: string | null;
  linkedin: string | null;
  note: string | null;
  featured: boolean;
  openJobsCount: number;
}

export interface CompanyDetail extends CompanySummary {
  jobs: Job[];
  latestPositions: Job[];
  monthlyStats: CompanyMonthlyStat[];
}

export interface CompanyFilters {
  search: string;
  countries: string[];
  category: string;
  size: string;
  page: number;
}

export interface CompanyFacets {
  countries: string[];
  countryCounts: Record<string, number>;
  categories: string[];
  sizes: string[];
}

export type CompaniesResponse = Paginated<CompanySummary>;

export type JobsApiErrorKind =
  | "not_found"
  | "validation"
  | "rate_limited"
  | "network"
  | "server"
  | "unknown";

export type JobsTabId = "career-map" | "companies";
