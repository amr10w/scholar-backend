"use client";

import {
  Briefcase,
  Code,
  MapPin,
  MousePointerClick,
  User,
} from "lucide-react";
import { JOB_TYPES, SENIORITY_LEVELS } from "../jobs.constants";
import type { Job } from "../jobs.type";
import {
  companyAvatarTone,
  companyInitials,
  jobLocationBadge,
} from "../jobs.utils";

interface JobCardProps {
  job: Job;
  onSelect?: (job: Job) => void;
}

export default function JobCard({ job, onSelect }: JobCardProps) {
  const locationBadge = jobLocationBadge(job);
  const disciplineText =
    job.domains.length > 0
      ? job.domains.slice(0, 3).join(", ")
      : job.industry;

  return (
    <article aria-label={job.title} className="min-w-0">
      <button
        type="button"
        onClick={() => onSelect?.(job)}
        className="group flex h-full w-full cursor-pointer flex-col rounded-3xl border border-primary-300/70 bg-brand-gradient p-5 text-left transition-all duration-200 hover:border-accent-300 hover:bg-overlay/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200"
      >
        {/* Top Row: Deterministic Avatar Tile + Country/Remote Badge */}
        <div className="mb-4 flex w-full items-start justify-between gap-3">
          <span
            aria-hidden="true"
            className={`flex size-11 shrink-0 items-center justify-center rounded-xl text-base font-bold text-on-action shadow-sm ${companyAvatarTone(job.company.id || job.company.name)}`}
          >
            {companyInitials(job.company.name, job.company.shortName)}
          </span>
          {locationBadge && (
            <span className="shrink-0 rounded-lg border border-neutral-500/70 bg-overlay/5 px-2.5 py-1 text-xs font-semibold tracking-wider text-neutral-100">
              {locationBadge}
            </span>
          )}
        </div>

        {/* Title & Company */}
        <h3 className="mb-1.5 line-clamp-2 wrap-break-word text-base leading-snug font-semibold text-neutral-50 transition-colors group-hover:text-primary-200">
          {job.title}
        </h3>
        <p className="mb-5 line-clamp-1 wrap-break-word text-sm text-neutral-200">
          {job.company.name}
        </p>

        {/* Bottom Badges */}
        <div className="mt-auto flex w-full flex-col gap-2">
          {(job.seniority || job.type) && (
            <div className="flex flex-wrap items-center gap-2">
              {job.seniority && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary-300/50 bg-primary-700/30 px-2.5 py-1 text-xs font-medium text-primary-100">
                  <User aria-hidden="true" className="size-3.5 shrink-0" />
                  <span>{SENIORITY_LEVELS[job.seniority]}</span>
                </span>
              )}
              {job.type && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-400/50 bg-accent-700/25 px-2.5 py-1 text-xs font-medium text-accent-200">
                  <Briefcase aria-hidden="true" className="size-3.5 shrink-0" />
                  <span>{JOB_TYPES[job.type]}</span>
                </span>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {disciplineText && (
              <span className="inline-flex max-w-52 items-center gap-1.5 rounded-full border border-accent-300/40 bg-accent-800/30 px-2.5 py-1 text-xs font-medium text-accent-200">
                <Code aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">{disciplineText}</span>
              </span>
            )}
            {locationBadge && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-500/70 bg-overlay/5 px-2.5 py-1 text-xs font-medium text-neutral-100">
                <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-accent-300" />
                <span>{locationBadge}</span>
              </span>
            )}
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-primary-300/40 bg-primary-700/20 px-2.5 py-1 text-xs font-medium text-primary-200"
              title="Number of views"
            >
              <MousePointerClick aria-hidden="true" className="size-3.5 shrink-0" />
              <span>{job.numberVisited.toLocaleString("en-US")} visited</span>
            </span>
          </div>
        </div>
      </button>
    </article>
  );
}
