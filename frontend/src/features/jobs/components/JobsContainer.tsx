import { Suspense } from "react";
import CatalogPage from "@/src/components/catalog/CatalogPage";
import type { JobsTabId } from "../jobs.type";
import JobsHubClient from "./JobsHubClient";

export default function JobsContainer({
  initialTab = "career-map",
}: {
  initialTab?: JobsTabId;
}) {
  return (
    <CatalogPage
      title="Jobs & Opportunities"
      description="Find your next step in research, engineering, and industry. Explore roles and global companies turning knowledge into impact."
    >
      <Suspense fallback={null}>
        <JobsHubClient initialTab={initialTab} />
      </Suspense>
    </CatalogPage>
  );
}
