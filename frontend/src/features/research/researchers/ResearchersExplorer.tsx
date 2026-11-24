"use client";

import { useSearchParams } from "next/navigation";
import type { Paginated } from "@/src/lib/api-client";
import { ResearchCatalogSwap } from "../ResearchDetailShell";
import ResearcherListing, { useResearcherListing } from "./ResearcherListing";
import ResearcherProfile from "./profile/ResearcherProfile";
import type { AcademicResearcher } from "./researcher.type";

export const RESEARCHER_PARAM = "researcher";

export function parseResearcherId(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return id > 0 ? id : null;
}

interface ResearchersExplorerProps {
  initialPage?: Paginated<AcademicResearcher> | null;
  initialError?: string;
}

const ResearchersExplorer = ({
  initialPage,
  initialError,
}: ResearchersExplorerProps) => {
  const listing = useResearcherListing(initialPage, initialError);
  const searchParams = useSearchParams();
  const selectedId = parseResearcherId(searchParams.get(RESEARCHER_PARAM));

  const navigate = (id: number | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id === null) params.delete(RESEARCHER_PARAM);
    else params.set(RESEARCHER_PARAM, String(id));
    // Shallow history entry: no server round trip, useSearchParams still updates,
    // and the browser Back button returns to the grid
    window.history.pushState(null, "", `?${params.toString()}`);
  };

  return (
    <ResearchCatalogSwap
      activeId={selectedId}
      renderDetail={(shownId) => (
        <ResearcherProfile
          id={shownId}
          initialResearcher={listing.result?.items.find(
            (researcher) => researcher.id === shownId,
          )}
          onBack={() => navigate(null)}
        />
      )}
    >
      <ResearcherListing listing={listing} onViewProfile={navigate} />
    </ResearchCatalogSwap>
  );
};

export default ResearchersExplorer;
