import type { Metadata } from "next";
import { JobsContainer } from "@/src/features/jobs";
import type { JobsTabId } from "@/src/features/jobs/jobs.type";

export const metadata: Metadata = {
  title: "Jobs & Opportunities | NEXUS",
  description:
    "Discover semiconductor, research, and engineering roles and global companies.",
};

export default async function JobsPage(
  props: Readonly<{
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
  }>,
) {
  const searchParams = await props.searchParams;
  const tab = searchParams?.tab;
  const initialTab: JobsTabId =
    tab === "companies" ? "companies" : "career-map";

  return <JobsContainer initialTab={initialTab} />;
}
