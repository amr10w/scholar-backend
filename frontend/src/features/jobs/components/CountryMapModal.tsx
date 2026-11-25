"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Check, Loader2, RotateCcw, Search, X } from "lucide-react";
import Button from "@/src/components/ui/Button/Button";
import AccessibleModal from "./AccessibleModal";

const LeafletWorldMap = dynamic(() => import("./LeafletWorldMap"), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="flex h-full w-full items-center justify-center gap-2 rounded-2xl border border-neutral-500/60 bg-neutral-800/60 text-sm text-neutral-200"
    >
      <Loader2
        aria-hidden="true"
        className="size-5 text-accent-300 motion-safe:animate-spin"
      />
      Loading interactive map…
    </div>
  ),
});

interface CountryMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCountries: string[];
  countryCounts: Record<string, number>;
  availableCountries: string[];
  itemNoun: "opening" | "company";
  onConfirm: (countries: string[]) => void;
}

export default function CountryMapModal({
  isOpen,
  onClose,
  selectedCountries,
  countryCounts,
  availableCountries,
  itemNoun,
  onConfirm,
}: CountryMapModalProps) {
  const [draft, setDraft] = useState<string[]>(selectedCountries);
  const [listSearch, setListSearch] = useState("");
  const [prevOpen, setPrevOpen] = useState(false);

  // Sync draft selection when the modal opens
  if (isOpen && !prevOpen) {
    setPrevOpen(true);
    setDraft(selectedCountries);
    setListSearch("");
  } else if (!isOpen && prevOpen) {
    setPrevOpen(false);
  }

  const toggleCountry = (country: string) => {
    setDraft((prev) =>
      prev.includes(country)
        ? prev.filter((item) => item !== country)
        : [...prev, country],
    );
  };

  const allCountries = [
    ...new Set([
      ...availableCountries,
      ...Object.keys(countryCounts),
      ...draft,
    ]),
  ].sort(
    (a, b) =>
      (countryCounts[b] ?? 0) - (countryCounts[a] ?? 0) || a.localeCompare(b),
  );

  const term = listSearch.trim().toLowerCase();
  const filteredList = term
    ? allCountries.filter((country) => country.toLowerCase().includes(term))
    : allCountries;

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="country-map-modal-title"
      maxWidthClass="max-w-6xl"
      fullHeightOnDesktop
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-500/60 bg-neutral-800/70 px-5 py-4 pr-16">
        <div className="flex items-center gap-3">
          <h2
            id="country-map-modal-title"
            className="text-lg font-bold tracking-wide text-primary-200 uppercase sm:text-xl"
          >
            Select Region
          </h2>
          <span className="rounded-full border border-accent-400/50 bg-accent-700/25 px-2.5 py-0.5 text-xs font-semibold text-accent-200">
            {draft.length} Selected
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {draft.length > 0 && (
            <button
              type="button"
              onClick={() => setDraft([])}
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-500/70 bg-overlay/5 px-3 py-2 text-xs font-medium text-neutral-100 transition-colors hover:border-danger-300 hover:text-danger-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200 cursor-pointer"
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              Clear
            </button>
          )}
          <Button
            type="button"
            variant="outlined"
            intent="primary"
            size="md"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="solid"
            intent="primary"
            size="md"
            onClick={() => {
              onConfirm(draft);
              onClose();
            }}
          >
            <Check aria-hidden="true" className="mr-1 size-4" />
            Confirm
          </Button>
        </div>
      </div>

      {/* Body: Interactive Leaflet Map + Synchronized Searchable Country List */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden bg-neutral-900/60 p-4 lg:grid-cols-[1fr_280px]">
        <div className="min-h-64 w-full lg:h-full">
          <LeafletWorldMap
            selectedCountries={draft}
            countryCounts={countryCounts}
            itemNoun={itemNoun}
            onToggleCountry={toggleCountry}
          />
        </div>

        <aside
          aria-label="Country checklist"
          className="flex min-h-0 flex-col rounded-2xl border border-neutral-500/70 bg-surface p-3"
        >
          <p className="mb-2 text-xs font-semibold tracking-wider text-neutral-200 uppercase">
            Countries ({allCountries.length})
          </p>
          <div className="relative mb-2.5">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-300"
            />
            <input
              type="search"
              aria-label="Filter countries"
              placeholder="Search countries…"
              value={listSearch}
              onChange={(event) => setListSearch(event.target.value)}
              className="w-full rounded-xl border border-neutral-500/70 bg-neutral-800/60 py-2 pr-3 pl-9 text-sm text-neutral-50 placeholder:text-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-200"
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
            {filteredList.length === 0 ? (
              <p className="py-6 text-center text-xs text-neutral-300">
                No matching countries.
              </p>
            ) : (
              filteredList.map((country) => {
                const checked = draft.includes(country);
                const count = countryCounts[country] ?? 0;
                return (
                  <label
                    key={country}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                      checked
                        ? "bg-primary-700/50 text-primary-100"
                        : "text-neutral-100 hover:bg-overlay/5"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCountry(country)}
                        className="size-4 shrink-0 accent-accent-400"
                      />
                      <span className="truncate">{country}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-overlay/10 px-2 py-0.5 text-xs text-neutral-200">
                      {count}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </aside>
      </div>

      {/* Selected Chips Footer */}
      {draft.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-500/60 bg-neutral-800/70 px-5 py-3">
          <span className="text-xs font-semibold text-neutral-200">
            Selected:
          </span>
          {draft.map((country) => (
            <span
              key={country}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent-400/50 bg-accent-700/20 px-2.5 py-1 text-xs font-medium text-accent-200"
            >
              {country}
              <button
                type="button"
                aria-label={`Remove ${country}`}
                onClick={() => toggleCountry(country)}
                className="rounded-full p-0.5 hover:bg-overlay/10 hover:text-danger-300 focus-visible:outline-2 focus-visible:outline-accent-200 cursor-pointer"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </AccessibleModal>
  );
}
