"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import notFoundAnimation from "@/src/components/assets/NotFound.json";
import { Input } from "@/src/components/ui/InputField/Input";
import type { Paginated } from "@/src/lib/api-client";
import { useDebouncedValue } from "@/src/hooks/useDebouncedValue";
import PublicationDetailModal from "./PublicationDetailModal";
import PublicationsTable from "./PublicationsTable";
import { fetchPublications } from "./publication.api";
import { PUBLICATION_SORT_OPTIONS } from "./publication.constants";
import type {
  Publication,
  PublicationSortField,
  PublicationSortOrder,
} from "./publication.type";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });

interface PublicationsExplorerProps {
  initialPage: Paginated<Publication>;
}

type Status = "idle" | "loading" | "error";

const PAGE_BUTTON =
  "flex items-center gap-1 rounded-full border border-accent-400 px-4 py-1.5 text-sm text-accent-200 hover:bg-accent-400/10 cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

const SELECT_CLASS =
  "appearance-none cursor-pointer whitespace-nowrap rounded-full border border-neutral-400 bg-neutral-900 py-1.5 pl-3 pr-8 text-sm text-neutral-200 tracking-normal outline-none transition-colors duration-200 focus-visible:border-accent-300";

const PublicationsExplorer = ({ initialPage }: PublicationsExplorerProps) => {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<PublicationSortField>("id");
  const [sortOrder, setSortOrder] = useState<PublicationSortOrder>("asc");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(initialPage);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedPublicationId, setSelectedPublicationId] = useState<number | null>(
    null,
  );

  const debouncedSearch = useDebouncedValue(search, 300);

  // Reset page to 1 when debounced search or sort changes
  const filterKey = `${debouncedSearch.trim()}|${sortBy}|${sortOrder}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setPage(1);
  }

  const effectivePage = prevFilterKey !== filterKey ? 1 : page;
  const queryKey = `${filterKey}|${effectivePage}|${reloadToken}`;
  const loadedKeyRef = useRef(queryKey);

  useEffect(() => {
    if (loadedKeyRef.current === queryKey) return;

    const controller = new AbortController();
    setStatus("loading");
    setError(null);

    fetchPublications(
      {
        search: debouncedSearch,
        page: effectivePage,
        sortBy,
        sortOrder,
      },
      controller.signal,
    )
      .then((data) => {
        if (controller.signal.aborted) return;
        loadedKeyRef.current = queryKey;
        if (
          data.data.length === 0 &&
          effectivePage > 1 &&
          data.pagination.totalPages > 0 &&
          effectivePage > data.pagination.totalPages
        ) {
          setPage(data.pagination.totalPages);
          return;
        }
        setResult(data);
        setStatus("idle");
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        loadedKeyRef.current = queryKey;
        setError(
          cause instanceof Error
            ? cause.message
            : "Something went wrong loading publications.",
        );
        setStatus("error");
      });

    return () => controller.abort();
  }, [queryKey, debouncedSearch, effectivePage, sortBy, sortOrder]);

  const publications = result.data ?? [];
  const { total, totalPages } = result.pagination;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-3">
        <div className="w-full lg:w-75 lg:shrink-0">
          <Input
            type="search"
            aria-label="Search publications"
            placeholder="Search by title, acronym or ISSN"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select
              aria-label="Sort publications by"
              value={sortBy}
              onChange={(event) =>
                setSortBy(event.target.value as PublicationSortField)
              }
              className={SELECT_CLASS}
            >
              {PUBLICATION_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  Sort: {option.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-200"
              aria-hidden="true"
            />
          </div>

          <div className="relative">
            <select
              aria-label="Sort order"
              value={sortOrder}
              onChange={(event) =>
                setSortOrder(event.target.value as PublicationSortOrder)
              }
              className={SELECT_CLASS}
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-200"
              aria-hidden="true"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 min-h-6">
        <span className="text-sm text-neutral-300" aria-live="polite">
          {status === "loading"
            ? "Loading publications…"
            : `${total} publication${total === 1 ? "" : "s"}`}
        </span>
        {status === "loading" && (
          <Loader2
            className="size-4 animate-spin text-accent-300"
            aria-hidden="true"
          />
        )}
      </div>

      {status === "error" ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <h3 className="text-xl font-semibold text-danger-300">
            Couldn&apos;t load publications
          </h3>
          <p className="text-neutral-100 max-w-md">{error}</p>
          <button
            type="button"
            onClick={() => setReloadToken((token) => token + 1)}
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
          <p className="text-neutral-100">
            Try a different title, acronym or ISSN.
          </p>
        </div>
      ) : (
        <div
          className={`flex flex-col gap-4 transition-opacity duration-300 ${status === "loading" ? "opacity-60" : "opacity-100"}`}
        >
          <PublicationsTable
            publications={publications}
            onSelectPublication={(pub) => setSelectedPublicationId(pub.id)}
          />

          {totalPages > 1 && (
            <nav
              aria-label="Publications pages"
              className="flex items-center justify-center gap-4"
            >
              <button
                type="button"
                className={PAGE_BUTTON}
                disabled={effectivePage <= 1 || status === "loading"}
                onClick={() => setPage((current) => current - 1)}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                Previous
              </button>
              <span className="text-sm text-neutral-300">
                Page {effectivePage} of {totalPages}
              </span>
              <button
                type="button"
                className={PAGE_BUTTON}
                disabled={effectivePage >= totalPages || status === "loading"}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </nav>
          )}
        </div>
      )}

      <PublicationDetailModal
        publicationId={selectedPublicationId}
        onClose={() => setSelectedPublicationId(null)}
      />
    </div>
  );
};

export default PublicationsExplorer;
