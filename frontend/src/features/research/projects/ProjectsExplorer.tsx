"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import notFoundAnimation from "@/src/components/assets/NotFound.json";
import CatalogPagination from "@/src/components/catalog/CatalogPagination";
import Button from "@/src/components/ui/Button/Button";
import type { Paginated } from "@/src/lib/api-client";
import { useDebouncedValue } from "@/src/hooks/useDebouncedValue";
import { ResearchCatalogSwap } from "../ResearchDetailShell";
import ProjectCard from "./ProjectCard";
import ProjectDetails from "./ProjectDetails";
import ProjectFiltersPanel from "./ProjectFiltersPanel";
import CatalogLayout from "@/src/components/catalog/CatalogLayout";
import { CATALOG_GRID } from "@/src/components/catalog/CatalogCard";
import { Input } from "@/src/components/ui/InputField/Input";
import { PROJECTS_PAGE_SIZE, fetchProjects } from "./project.api";
import {
  EMPTY_FILTERS,
  filtersKey,
  hasActiveFilters,
  toProjectSummary,
} from "./project.utils";
import type { GraduationProject, ProjectFilters } from "./project.type";

export const PROJECT_PARAM = "project";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

interface ProjectsExplorerProps {
  initialPage: Paginated<GraduationProject> | null;
  /** Set when the first request failed on the server */
  initialError?: string;
}

interface Loaded {
  /** `${filtersKey}#${page}#${attempt}` the items below belong to */
  key: string;
  items: GraduationProject[];
  page: number;
  limit: number;
  total: number | null;
  totalPages: number;
  error: string | null;
}

const requestKey = (key: string, page: number, attempt: number) =>
  `${key}#${page}#${attempt}`;

const ProjectsExplorer = ({
  initialPage,
  initialError,
}: ProjectsExplorerProps) => {
  const searchParams = useSearchParams();
  const selectedId = searchParams?.get(PROJECT_PARAM)?.trim() || null;

  const [filters, setFilters] = useState<ProjectFilters>(EMPTY_FILTERS);

  const navigate = (id: number | string | null) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", "projects");
    if (id === null) params.delete(PROJECT_PARAM);
    else params.set(PROJECT_PARAM, String(id));
    window.history.pushState(null, "", `?${params.toString()}`);
  };
  const debouncedSearch = useDebouncedValue(filters.search, 300);
  const debouncedYear = useDebouncedValue(filters.yearRange, 300);
  const applied = {
    ...filters,
    search: debouncedSearch,
    yearRange: debouncedYear,
  };
  const appliedKey = filtersKey(applied);

  const pending = filtersKey(filters) !== appliedKey;
  const [page, setPage] = useState(1);

  function updateFilters(next: ProjectFilters) {
    setFilters(next);
    setPage(1);
  }

  const [attempt, setAttempt] = useState(0);
  const wanted = requestKey(appliedKey, page, attempt);

  const [loaded, setLoaded] = useState<Loaded>(() => ({
    key: requestKey(filtersKey(EMPTY_FILTERS), 1, 0),
    items: initialPage?.data ?? [],
    page: initialPage?.pagination.page ?? 1,
    limit: initialPage?.pagination.limit ?? PROJECTS_PAGE_SIZE,
    total: initialPage?.pagination.total ?? null,
    totalPages: initialPage?.pagination.totalPages ?? 0,
    error: initialPage
      ? null
      : (initialError ?? "Projects are unavailable right now."),
  }));
  const loading = pending || loaded.key !== wanted;

  useEffect(() => {
    if (pending || loaded.key === wanted) return;
    const controller = new AbortController();

    (async () => {
      try {
        const result = await fetchProjects(
          { ...applied, page, limit: PROJECTS_PAGE_SIZE },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setLoaded({
          key: wanted,
          items: result.data ?? [],
          page: result.pagination.page,
          limit: result.pagination.limit,
          total: result.pagination.total,
          totalPages: result.pagination.totalPages,
          error: null,
        });
      } catch (cause) {
        if (controller.signal.aborted) return;
        setLoaded((previous) => ({
          ...previous,
          key: wanted,
          error:
            cause instanceof Error ? cause.message : "Couldn't load projects.",
        }));
      }
    })();

    return () => controller.abort();
    // The request key includes the applied filters, page and retry attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, pending]);

  const projects = loaded.items.map(toProjectSummary);
  const showError = loaded.error && !loading;
  const total = loaded.total ?? 0;
  const first = total > 0 ? (loaded.page - 1) * loaded.limit + 1 : 0;
  const last =
    total > 0 ? Math.min(loaded.page * loaded.limit, total) : 0;

  return (
    <ResearchCatalogSwap
      activeId={selectedId}
      renderDetail={(shownId) => (
        <ProjectDetails
          id={shownId}
          initialProject={loaded.items.find(
            (project) => String(project.id) === shownId,
          )}
          onBack={() => navigate(null)}
        />
      )}
    >
      <CatalogLayout
        search={
          <Input
            type="search"
            aria-label="Search projects"
            placeholder="Search by title, student or supervisor"
            value={filters.search}
            onChange={(event) =>
              updateFilters({ ...filters, search: event.target.value })
            }
            endAdornment={<Search aria-hidden="true" className="size-5" />}
          />
        }
        filters={
          <ProjectFiltersPanel filters={filters} onChange={updateFilters} />
        }
        activeFilterCount={
          [
            filters.universities.length > 0,
            filters.projectFields.length > 0,
            filters.yearRange,
            filters.sponsorship,
          ].filter(Boolean).length
        }
        resultsLabel="Project results"
      >
        {!loaded.error && loaded.total !== null && (
          <p role="status" className="text-sm text-accent-200">
            {total > 0 && first <= last
              ? `Showing ${first}–${last} of ${total} project${total === 1 ? "" : "s"}`
              : `${total} project${total === 1 ? "" : "s"}`}
          </p>
        )}

        {showError ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <h3 className="text-xl font-semibold text-danger-300">
              Couldn&apos;t load projects
            </h3>
            <p className="max-w-md text-neutral-100">{loaded.error}</p>
            <Button
              type="button"
              variant="outlined"
              intent="accent"
              size="md"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try again
            </Button>
          </div>
        ) : projects.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center gap-2.5 pt-6 pb-16 text-center">
            <Lottie
              animationData={notFoundAnimation}
              loop
              className="mx-auto w-64"
            />
            <h3 className="text-2xl font-semibold text-accent-300">
              No Projects Found
            </h3>
            <p className="text-neutral-100">
              {hasActiveFilters(applied)
                ? "No projects match these filters."
                : "No graduation projects have been posted yet."}
            </p>
            {hasActiveFilters(filters) && (
              <Button
                type="button"
                variant="link"
                intent="accent"
                size="md"
                onClick={() => updateFilters(EMPTY_FILTERS)}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div
            className={`flex flex-col gap-6 transition-opacity duration-150 ${loading ? "opacity-60" : "opacity-100"}`}
            aria-busy={loading}
          >
            <div className={CATALOG_GRID}>
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onViewDetails={navigate}
                />
              ))}
            </div>

            <CatalogPagination
              label="Projects pagination"
              page={page}
              totalPages={loaded.totalPages}
              onPageChange={setPage}
              disabled={loading}
            />
          </div>
        )}
      </CatalogLayout>
    </ResearchCatalogSwap>
  );
};

export default ProjectsExplorer;
