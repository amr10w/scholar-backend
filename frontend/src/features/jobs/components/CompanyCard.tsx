"use client";

import { Building2, MapPin, ShieldCheck } from "lucide-react";
import type { CompanySummary } from "../jobs.type";
import { companyAvatarTone, companyInitials } from "../jobs.utils";

interface CompanyCardProps {
  company: CompanySummary;
  onSelect: (company: CompanySummary) => void;
}

export default function CompanyCard({ company, onSelect }: CompanyCardProps) {
  return (
    <article aria-label={company.name} className="min-w-0">
      <button
        type="button"
        onClick={() => onSelect(company)}
        className="group flex h-full w-full cursor-pointer flex-col rounded-3xl border border-primary-300/70 bg-brand-gradient p-5 text-left transition-all duration-200 hover:border-accent-300 hover:bg-overlay/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200"
      >
        {/* Top Row: Deterministic Avatar Tile + Category & Size Badges */}
        <div className="mb-4 flex w-full items-start justify-between gap-3">
          <span
            aria-hidden="true"
            className={`flex size-11 shrink-0 items-center justify-center rounded-xl text-base font-bold text-on-action shadow-sm ${companyAvatarTone(company.id || company.name)}`}
          >
            {companyInitials(company.name, company.shortName)}
          </span>
          <div className="flex min-w-0 flex-col items-end gap-1">
            {company.industry && (
              <span className="max-w-52 truncate rounded-lg border border-neutral-500/70 bg-overlay/5 px-2.5 py-1 text-[10px] font-bold tracking-wider text-neutral-100 uppercase">
                {company.industry}
              </span>
            )}
            {company.size && (
              <span className="inline-flex items-center gap-1 rounded-md border border-primary-300/40 bg-primary-700/20 px-2 py-0.5 text-[11px] font-medium text-primary-200">
                <Building2 aria-hidden="true" className="size-3 shrink-0" />
                <span>{company.size}</span>
              </span>
            )}
          </div>
        </div>

        {/* Name & Description */}
        <h3 className="mb-1.5 line-clamp-2 wrap-break-word text-base leading-snug font-semibold text-neutral-50 transition-colors group-hover:text-primary-200">
          {company.name}
        </h3>
        {company.description && (
          <p className="mb-5 line-clamp-2 wrap-break-word text-sm leading-relaxed text-neutral-200">
            {company.description}
          </p>
        )}

        {/* Bottom Metadata: HQ, Global Presence Chips, Highlighted Note */}
        <div className="mt-auto flex w-full flex-col gap-3">
          {company.headquartersCountry && (
            <div className="flex items-center gap-1.5 text-sm text-neutral-200">
              <MapPin
                aria-hidden="true"
                className="size-4 shrink-0 text-accent-300"
              />
              <span className="truncate">HQ: {company.headquartersCountry}</span>
            </div>
          )}

          {company.globalPresence.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {company.globalPresence.slice(0, 3).map((region) => (
                <span
                  key={region}
                  className="inline-flex items-center rounded-md border border-neutral-500/70 bg-overlay/5 px-2.5 py-0.5 text-xs text-neutral-100"
                >
                  {region}
                </span>
              ))}
              {company.globalPresence.length > 3 && (
                <span className="inline-flex items-center rounded-md border border-accent-400/50 bg-accent-700/20 px-2.5 py-0.5 text-xs font-medium text-accent-200">
                  +{company.globalPresence.length - 3}
                </span>
              )}
            </div>
          )}

          {company.note && (
            <div className="flex items-center gap-1.5 pt-0.5 text-xs font-semibold text-accent-300">
              <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="truncate">{company.note}</span>
            </div>
          )}
        </div>
      </button>
    </article>
  );
}
