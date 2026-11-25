"use client";

import {
  Banknote,
  Briefcase,
  Clock,
  Code,
  ExternalLink,
  Globe,
  MousePointerClick,
  User,
} from "lucide-react";
import { safeExternalUrl } from "@/src/components/catalog/CatalogDetails";
import Badge from "@/src/components/ui/Badge/Badge";
import Button from "@/src/components/ui/Button/Button";
import getButtonClasses from "@/src/components/ui/Button/button.style";
import { JOB_TYPES, SENIORITY_LEVELS } from "../jobs.constants";
import type { Job } from "../jobs.type";
import {
  applyCtaLabel,
  companyAvatarTone,
  companyInitials,
  formatSourceLabel,
  jobLocation,
  jobLocationBadge,
  postedDate,
} from "../jobs.utils";
import AccessibleModal from "./AccessibleModal";

interface JobDetailModalProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function JobDetailModal({
  job,
  isOpen,
  onClose,
}: JobDetailModalProps) {
  if (!job) return null;

  const formattedDate = postedDate(job.postedAt);
  const locationText = jobLocation(job);
  const locBadge = jobLocationBadge(job);
  const safeApply = safeExternalUrl(job.applyLink);
  const ctaLabel = applyCtaLabel(job.applyLink);
  const sourceLabel = formatSourceLabel(job.source);

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="job-detail-modal-title"
      maxWidthClass="max-w-2xl"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 sm:p-8">
        {/* Header */}
        <div className="mb-6 flex items-start gap-4 pr-10 sm:gap-5">
          <span
            aria-hidden="true"
            className={`flex size-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold text-on-action shadow-sm sm:size-16 sm:text-3xl ${companyAvatarTone(job.company.id || job.company.name)}`}
          >
            {companyInitials(job.company.name, job.company.shortName)}
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="job-detail-modal-title"
              className="wrap-break-word text-xl leading-tight font-bold text-neutral-50 sm:text-2xl"
            >
              {job.title}
            </h2>
            <p className="mt-1 wrap-break-word text-base text-neutral-100">
              {job.company.name}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-200">
              {formattedDate && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock aria-hidden="true" className="size-4 shrink-0" />
                  <span>Posted {formattedDate}</span>
                </span>
              )}
              {locationText && (
                <span className="inline-flex items-center gap-1.5">
                  <Globe aria-hidden="true" className="size-4 shrink-0" />
                  <span>{locationText}</span>
                </span>
              )}
              <span
                className="inline-flex items-center gap-1.5 font-medium text-primary-200"
                title="Number of views"
              >
                <MousePointerClick aria-hidden="true" className="size-4 shrink-0" />
                <span>{job.numberVisited.toLocaleString("en-US")} visited</span>
              </span>
            </div>
          </div>
        </div>

        {/* Job Details Badges */}
        <div className="mb-6 space-y-4">
          <h3 className="text-xs font-bold tracking-wider text-neutral-200 uppercase">
            Job Details
          </h3>
          <div className="flex flex-wrap gap-2.5">
            {job.seniority && (
              <Badge variant="outlined" intent="primary" size="md" className="gap-1.5">
                <User aria-hidden="true" className="size-3.5 shrink-0" />
                <span>{SENIORITY_LEVELS[job.seniority]}</span>
              </Badge>
            )}
            {job.type && (
              <Badge variant="outlined" intent="accent" size="md" className="gap-1.5">
                <Briefcase aria-hidden="true" className="size-3.5 shrink-0" />
                <span>{JOB_TYPES[job.type]}</span>
              </Badge>
            )}
            {locBadge && (
              <Badge variant="solid" intent="accent" size="md" className="gap-1.5">
                <Globe aria-hidden="true" className="size-3.5 shrink-0" />
                <span>{locBadge}</span>
              </Badge>
            )}
            {sourceLabel && (
              <Badge variant="outlined" intent="primary" size="md">
                Source: {sourceLabel}
              </Badge>
            )}
            {job.salary && (
              <Badge variant="outlined" intent="accent" size="md" className="gap-1.5">
                <Banknote aria-hidden="true" className="size-3.5 shrink-0" />
                <span>{job.salary}</span>
              </Badge>
            )}
          </div>

          {job.domains.length > 0 && (
            <div className="pt-2">
              <h3 className="mb-2.5 text-xs font-bold tracking-wider text-neutral-200 uppercase">
                Technologies / Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {job.domains.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary-300/40 bg-primary-700/25 px-3 py-1 text-xs font-semibold text-primary-100"
                  >
                    <Code aria-hidden="true" className="size-3.5 shrink-0" />
                    <span>{tag}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {job.description && (
            <div className="rounded-2xl border border-neutral-500/50 bg-overlay/5 p-4">
              <h3 className="mb-1.5 text-xs font-bold tracking-wider text-neutral-200 uppercase">
                Overview
              </h3>
              <p className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-neutral-100">
                {job.description}
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-auto flex flex-wrap items-center justify-end gap-3 border-t border-neutral-500/50 pt-5">
          <Button
            type="button"
            variant="outlined"
            intent="primary"
            size="md"
            onClick={onClose}
          >
            Cancel
          </Button>

          {safeApply ? (
            <a
              href={safeApply}
              target="_blank"
              rel="noopener noreferrer"
              className={`${getButtonClasses({ variant: "solid", intent: "primary", size: "md" })} min-h-11 gap-2 px-6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200`}
            >
              <span>{ctaLabel}</span>
              <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <button
              type="button"
              disabled
              title="Application link unavailable for this listing"
              aria-label="Application link unavailable"
              className={`${getButtonClasses({ variant: "outlined", intent: "primary", size: "md" })} min-h-11 cursor-not-allowed opacity-50`}
            >
              Application link unavailable
            </button>
          )}
        </div>
      </div>
    </AccessibleModal>
  );
}
