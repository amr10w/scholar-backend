export type DecimalString = string;

export type PublicationAccessType =
  | "Hybrid"
  | "Full_Open_Access"
  | "Golden_Open_Access"
  | "Diamond_Open_Access"
  | "Green_Open_Access"
  | "Bronze_Open_Access"
  | "Subscriber_Based_Access";

export type LicenseType =
  | "CC"
  | "CC_BY"
  | "CC_BY_SA"
  | "CC_BY_NC"
  | "CC_BY_ND"
  | "CC_BY_NC_ND";

export type PublicationType = "Transaction" | "Magazine" | "Journal" | "Letter";

export type Publisher =
  | "IEEE"
  | "APS"
  | "RoyalSociety"
  | "ACS"
  | "ACM"
  | "TaylorAFrancis"
  | "Oxford"
  | "ElSevier"
  | "Springer"
  | "Sage"
  | "MDPI";

export type Quartile = "Q1" | "Q2" | "Q3" | "Q4";

export type PublicationIndex = "SCIE" | "ESCI" | "SSCI";

export type Workflow = "standard" | "non_standard";

export type SubBucket =
  | "CoreHybridProprietaryEnglish"
  | "CoreHybridSocietyEnglish"
  | "CoreGold"
  | "CellPressGold"
  | "CellPressHybridProprietary"
  | "CellPressHybridSociety"
  | "CoreHybridLocalLanguage"
  | "TLSubscription"
  | "TheLancetGold";

export type PublicationSortField =
  | "id"
  | "title"
  | "acronym"
  | "yearLunched"
  | "createdAt"
  | "updatedAt";

export type PublicationSortOrder = "asc" | "desc";

export type PublicationErrorKind =
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "conflict"
  | "network"
  | "server"
  | "unknown";

export interface PublicationSubCategory {
  id: number;
  domainId: number;
  name: string;
  domain?: { id: number; name: string };
}

export interface PublicationYearlyMetric {
  id: number;
  publicationId: number;
  metricYear: number;
  indexingService: PublicationIndex | null;
  impactFactor: DecimalString | null;
  impactFactor5yr: DecimalString | null;
  quartile: Quartile | null;
  jci: DecimalString | null;
  sjr: DecimalString | null;
  h5Index: DecimalString | null;
  eigenfactor: DecimalString | null;
  articleInfluenceScore: DecimalString | null;
  citescore: DecimalString | null;
  totalCitations: number;
  articleDownloads: number;
}

export interface PublicationPricing {
  id: number;
  publicationId: number;
  pricingYear: number;
  currency: string;
  cost: DecimalString;
  isSubscription: boolean | null;
}

export interface PublicationEditorialStat {
  id: number;
  publicationId: number;
  submissionToFirstDecision: DecimalString | null;
  submissionToReviewDecision: DecimalString | null;
  submissionToAcceptance: DecimalString | null;
  acceptanceToPublication: DecimalString | null;
  acceptanceRate: DecimalString | null;
}

export interface Publication {
  id: number;
  subCategoryId: number;
  acronym: string | null;
  publisher: Publisher;
  publicationType: PublicationType;
  title: string;
  issn: string | null;
  eissn: string | null;
  issnCdrom: string | null;
  URL: string | null;
  yearLunched: number | null;
  launchYear?: number | null;
  openAccessType: PublicationAccessType;
  specificFocusScope: string | null;
  workflow: Workflow;
  licenseType: LicenseType | null;
  journalScope: string | null;
  imprint: string | null;
  subBucket: SubBucket | string | null;
  createdAt?: string;
  updatedAt?: string;
  subCategory: PublicationSubCategory | null;
  yearlyMetrics?: PublicationYearlyMetric[];
  pricings?: PublicationPricing[];
  editorialStats?: PublicationEditorialStat[];
}

export interface PublicationFilters {
  categoryIds: number[];
  publicationTypes: PublicationType[];
  accessModels: PublicationAccessType[];
  publishers: Publisher[];
  quartiles: Quartile[];
}

export interface PublicationFacets extends Omit<PublicationFilters, "categoryIds"> {
  subjects: PublicationSubCategory[];
}

/** Query params supported by GET /api/publications */
export interface PublicationQuery extends Partial<PublicationFilters> {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: PublicationSortField;
  sortOrder?: PublicationSortOrder;
}

/** Input payload for POST /api/publications (auth required) */
export interface CreatePublicationInput {
  subCategoryId: number;
  title: string;
  publisher: Publisher;
  publicationType: PublicationType;
  openAccessType: PublicationAccessType;
  workflow: Workflow;
  acronym?: string | null;
  issn?: string | null;
  eissn?: string | null;
  issnCdrom?: string | null;
  URL?: string | null;
  launchYear?: number | null;
  yearLunched?: number | null;
  specificFocusScope?: string | null;
  licenseType?: LicenseType | null;
  journalScope?: string | null;
  imprint?: string | null;
  subBucket?: SubBucket | null;
}

/** Partial payload for PATCH /api/publications/:id (auth required) */
export type UpdatePublicationInput = Partial<CreatePublicationInput>;
