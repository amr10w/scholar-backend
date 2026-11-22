import type {
  LicenseType,
  PublicationAccessType,
  PublicationFilterState,
  PublicationSortField,
  Publisher,
  Quartile,
  SubBucket,
  Workflow,
} from "./publication.type";

export const ACCESS_TYPE_LABELS: Record<PublicationAccessType, string> = {
  Hybrid: "Hybrid",
  Full_Open_Access: "Full Open Access",
  Golden_Open_Access: "Golden Open Access",
  Diamond_Open_Access: "Diamond Open Access",
  Green_Open_Access: "Green Open Access",
  Bronze_Open_Access: "Bronze Open Access",
  Subscriber_Based_Access: "Subscriber Based Access",
};

export const LICENSE_LABELS: Record<LicenseType, string> = {
  CC: "CC",
  CC_BY: "CC BY",
  CC_BY_SA: "CC BY-SA",
  CC_BY_NC: "CC BY-NC",
  CC_BY_ND: "CC BY-ND",
  CC_BY_NC_ND: "CC BY-NC-ND",
};

export const PUBLISHER_LABELS: Record<Publisher, string> = {
  IEEE: "IEEE",
  APS: "APS",
  RoyalSociety: "Royal Society",
  ACS: "ACS",
  ACM: "ACM",
  TaylorAFrancis: "Taylor & Francis",
  Oxford: "Oxford",
  ElSevier: "Elsevier",
  Springer: "Springer",
  Sage: "Sage",
  MDPI: "MDPI",
};

export const WORKFLOW_LABELS: Record<Workflow, string> = {
  standard: "Standard",
  non_standard: "Non-standard",
};

export const SUB_BUCKET_LABELS: Record<SubBucket, string> = {
  CoreHybridProprietaryEnglish: "Core Hybrid Proprietary English",
  CoreHybridSocietyEnglish: "Core Hybrid Society English",
  CoreGold: "Core Gold",
  CellPressGold: "Cell Press Gold",
  CellPressHybridProprietary: "Cell Press Hybrid Proprietary",
  CellPressHybridSociety: "Cell Press Hybrid Society",
  CoreHybridLocalLanguage: "Core Hybrid Local Language",
  TLSubscription: "TL Subscription",
  TheLancetGold: "The Lancet Gold",
};

export const PUBLICATION_SORT_OPTIONS: { value: PublicationSortField; label: string }[] = [
  { value: "id", label: "Default (ID)" },
  { value: "title", label: "Title" },
  { value: "acronym", label: "Acronym" },
  { value: "yearLunched", label: "Launch year" },
  { value: "createdAt", label: "Date added" },
  { value: "updatedAt", label: "Last updated" },
];

export const ACCESS_TYPE_OPTIONS = Object.keys(
  ACCESS_TYPE_LABELS,
) as PublicationAccessType[];

export const LICENSE_OPTIONS = Object.keys(LICENSE_LABELS) as LicenseType[];

export const QUARTILE_OPTIONS: Quartile[] = ["Q1", "Q2", "Q3", "Q4"];

export const CURRENCY_OPTIONS = ["USD", "EUR", "GBP"];

export const EMPTY_FILTERS: PublicationFilterState = {
  search: "",
  categoryIds: [],
  publishingModel: [],
  licensing: [],
  quartiles: [],
  impactFactor: {},
  sjr: {},
  citeScore: {},
  currency: "USD",
  maxCost: undefined,
  firstDecisionWeeks: {},
  submissionToAcceptanceWeeks: {},
};
