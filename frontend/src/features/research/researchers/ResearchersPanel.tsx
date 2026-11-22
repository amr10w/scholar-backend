import { connection } from "next/server";
import type { Paginated } from "@/src/lib/api-client";
import ResearchersExplorer from "./ResearchersExplorer";
import { fetchResearchers } from "./researcher.api";
import type { AcademicResearcher } from "./researcher.type";

const ResearchersPanel = async () => {
  // Fetch on every request, not once at build time
  await connection();

  let initialPage: Paginated<AcademicResearcher> | undefined;
  let initialError: string | undefined;
  try {
    initialPage = await fetchResearchers({ page: 1 });
  } catch (cause) {
    initialError =
      cause instanceof Error
        ? cause.message
        : "The researchers service is unavailable.";
  }

  return (
    <ResearchersExplorer
      initialPage={initialPage}
      initialError={initialError}
    />
  );
};

export default ResearchersPanel;
