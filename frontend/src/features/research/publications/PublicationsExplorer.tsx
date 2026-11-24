"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import notFoundAnimation from "@/src/components/assets/NotFound.json";
import CatalogPagination from "@/src/components/catalog/CatalogPagination";
import Button from "@/src/components/ui/Button/Button";
import { Input } from "@/src/components/ui/InputField/Input";
import type { Paginated } from "@/src/lib/api-client";
import { useDebouncedValue } from "@/src/hooks/useDebouncedValue";
import CatalogLayout from "@/src/components/catalog/CatalogLayout";
import {
  CATALOG_GRID,
  CatalogCardsSkeleton,
} from "@/src/components/catalog/CatalogCard";
import { ResearchCatalogSwap } from "../ResearchDetailShell";
import PublicationCard from "./PublicationCard";
import PublicationDetails from "./PublicationDetails";
import PublicationFilterBar from "./PublicationFilterBar";
import { EMPTY_FILTERS } from "./publication.constants";
import { countPublicationFilters, fetchPublications } from "./publication.api";
import type { Publication, PublicationFilters } from "./publication.type";

export const PUBLICATION_PARAM = "publication";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

interface PublicationsExplorerProps {
  initialPage: Paginated<Publication>;
}

const PublicationsExplorer = ({ initialPage }: PublicationsExplorerProps) => {
  const searchParams = useSearchParams();
  const selectedId = searchParams?.get(PUBLICATION_PARAM)?.trim() || null;

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);

  const navigate = (id: number | string | null) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("tab", "publications");
    if (id === null) params.delete(PUBLICATION_PARAM);
    else params.set(PUBLICATION_PARAM, String(id));
    window.history.pushState(null, "", `?${params.toString()}`);
  };
  const [loaded, setLoaded] = useState<{
    key: string;
    data?: Paginated<Publication>;
    error?: string;
  }>();
  const term = search.trim();
  const debounced = useDebouncedValue(term, 300);
  const pending = term !== debounced;
  const activeFilterCount = countPublicationFilters(filters);
  const firstPage = page === 1 && !debounced && activeFilterCount === 0;
  const key = JSON.stringify([debounced, filters, page, attempt]);

  function updateFilters(next: PublicationFilters) {
    setFilters(next);
    setPage(1);
  }

  useEffect(() => {
    if (pending || firstPage) return;
    const controller = new AbortController();
    fetchPublications(
      { ...filters, search: debounced, page },
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setLoaded({ key, data });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setLoaded({
            key,
            error:
              cause instanceof Error
                ? cause.message
                : "Could not load publications.",
          });
      });
    return () => controller.abort();
  }, [key, firstPage, pending, debounced, page, filters]);

  const current = firstPage
    ? { data: initialPage, error: undefined }
    : loaded?.key === key
      ? loaded
      : undefined;
  const loading = pending || !current;
  const publications = current?.data?.data ?? [];
  const { total, totalPages } = current?.data?.pagination ?? {
    total: 0,
    totalPages: 0,
  };

  return (
    <ResearchCatalogSwap
      activeId={selectedId}
      renderDetail={(shownId) => (
        <PublicationDetails
          id={shownId}
          initialPublication={current?.data?.data.find(
            (publication) => String(publication.id) === shownId,
          )}
          onBack={() => navigate(null)}
        />
      )}
    >
      <CatalogLayout
        resultsLabel="Publication results"
        activeFilterCount={activeFilterCount}
        filters={
          <PublicationFilterBar filters={filters} onChange={updateFilters} />
        }
        search={
          <Input
            type="search"
            endAdornment={<Search aria-hidden="true" className="size-5" />}
            aria-label="Search publications"
            placeholder="Search by title, acronym or ISSN"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        }
      >
        <p role="status" className="text-sm text-accent-200">
          {loading
            ? "Loading publications…"
            : current.error
              ? "Publications unavailable"
              : `${total} publication${total === 1 ? "" : "s"}`}
        </p>

        {loading ? (
          <CatalogCardsSkeleton />
        ) : current.error ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <h3 className="text-xl font-semibold text-danger-300">
              Couldn&apos;t load publications
            </h3>
            <p className="text-neutral-100 max-w-md">{current.error}</p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="mt-1 rounded-full border border-accent-400 px-5 py-2 text-sm text-accent-200 hover:bg-accent-400/10 cursor-pointer transition-colors"
            >
              Try again
            </button>
          </div>
        ) : publications.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2.5 pt-10.5 pb-16">
            <Lottie
              animationData={notFoundAnimation}
              loop
              className="w-64 mx-auto"
            />
            <h3 className="text-2xl font-semibold text-accent-300">
              No Publications Found
            </h3>
            <p className="text-center text-neutral-100">
              {activeFilterCount > 0
                ? "Try a different search or clear the filters."
                : "Try a different title, acronym or ISSN."}
            </p>
            {activeFilterCount > 0 && (
              <Button
                type="button"
                variant="outlined"
                intent="accent"
                onClick={() => updateFilters(EMPTY_FILTERS)}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className={CATALOG_GRID}>
              {publications.map((publication) => (
                <PublicationCard
                  key={publication.id}
                  publication={publication}
                  onViewDetails={navigate}
                />
              ))}
            </div>

            <CatalogPagination
              label="Publications pages"
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </div>
        )}
      </CatalogLayout>
    </ResearchCatalogSwap>
  );
};

export default PublicationsExplorer;
