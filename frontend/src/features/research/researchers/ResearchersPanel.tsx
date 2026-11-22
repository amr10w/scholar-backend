import { connection } from "next/server";
import type { Paginated } from "@/src/lib/api-client";
import ResearchersExplorer from "./ResearchersExplorer";
import { fetchResearcherFacets, fetchResearchers } from "./researcher.api";
import type { AcademicResearcher, ResearcherFacets } from "./researcher.type";

const NO_FACETS: ResearcherFacets = { topics: [], departments: [], universities: [] };

const ResearchersPanel = async () => {
  // Fetch on every request, not once at build time
  await connection();

  const [first, facets] = await Promise.allSettled([
    fetchResearchers({ page: 1 }),
    fetchResearcherFacets(),
  ]);

  let initialPage: Paginated<AcademicResearcher> | null = null;
  let initialError: string | undefined;
  if (first.status === "fulfilled") initialPage = first.value;
  else
    initialError =
      first.reason instanceof Error
        ? first.reason.message
        : "The researchers service is unavailable.";

  return (
    <ResearchersExplorer
      initialPage={initialPage}
      facets={facets.status === "fulfilled" ? facets.value : NO_FACETS}
      initialError={initialError}
    />
  );
};

export default ResearchersPanel;
