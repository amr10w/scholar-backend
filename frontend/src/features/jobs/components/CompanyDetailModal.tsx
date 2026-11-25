"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { Briefcase, ExternalLink, Globe, Loader2 } from "lucide-react";
import { safeExternalUrl } from "@/src/components/catalog/CatalogDetails";
import Badge from "@/src/components/ui/Badge/Badge";
import Button from "@/src/components/ui/Button/Button";
import { fetchCompanyById } from "../companies.api";
import { JOB_TYPES } from "../jobs.constants";
import type { CompanyDetail, CompanySummary } from "../jobs.type";
import {
  companyAvatarTone,
  companyInitials,
  shortIsoDate,
} from "../jobs.utils";
import AccessibleModal from "./AccessibleModal";
import HiringTimelineChart from "./HiringTimelineChart";

interface CompanyDetailModalProps {
  company: CompanySummary | null;
  isOpen: boolean;
  onClose: () => void;
}

function LinkedInIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4 shrink-0 fill-current"
    >
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z" />
    </svg>
  );
}

export default function CompanyDetailModal({
  company,
  isOpen,
  onClose,
}: CompanyDetailModalProps) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    key: string;
    detail?: CompanyDetail;
    error?: string;
  }>();

  const companyId = company?.id ?? null;
  const requestKey = companyId !== null ? `${companyId}:${attempt}` : "";

  useEffect(() => {
    if (!isOpen || companyId === null) return;
    const controller = new AbortController();
    fetchCompanyById(companyId, controller.signal)
      .then((detail) => {
        if (!controller.signal.aborted) {
          setState({ key: requestKey, detail });
        }
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && !axios.isCancel(cause)) {
          setState({
            key: requestKey,
            error:
              cause instanceof Error
                ? cause.message
                : "Could not load company timeline.",
          });
        }
      });
    return () => controller.abort();
  }, [isOpen, companyId, requestKey]);

  if (!company) return null;

  const isCurrent = state?.key === requestKey;
  const detail = isCurrent ? state?.detail : undefined;
  const loading = isOpen && !isCurrent;
  const error = isCurrent ? state?.error : undefined;

  const display = detail ?? company;
  const website = safeExternalUrl(display.website);
  const linkedin = safeExternalUrl(display.linkedin);
  const latestPositions = detail?.latestPositions ?? [];
  const monthlyStats = detail?.monthlyStats ?? [];

  return (
    <AccessibleModal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="company-detail-modal-title"
      maxWidthClass="max-w-4xl"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 sm:p-8">
        {/* Header */}
        <div className="mb-7 flex items-start gap-4 pr-10 sm:gap-5">
          <span
            aria-hidden="true"
            className={`flex size-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold text-on-action shadow-sm sm:size-16 sm:text-3xl ${companyAvatarTone(display.id || display.name)}`}
          >
            {companyInitials(display.name, display.shortName)}
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="company-detail-modal-title"
              className="wrap-break-word text-xl leading-tight font-bold text-neutral-50 sm:text-2xl"
            >
              {display.name}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {display.industry && (
                <p className="text-sm text-neutral-200">{display.industry}</p>
              )}
              {display.size && (
                <Badge variant="outlined" intent="accent" size="sm">
                  {display.size} employees
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Hiring Timeline + Latest Positions */}
        <div className="mb-7 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-bold text-neutral-50">
              Hiring Timeline (Opened Positions)
            </h3>
            {loading ? (
              <div
                role="status"
                className="flex h-52 items-center justify-center gap-2 rounded-2xl border border-neutral-500/50 bg-overlay/5 text-sm text-neutral-200"
              >
                <Loader2
                  aria-hidden="true"
                  className="size-4 text-accent-300 motion-safe:animate-spin"
                />
                Loading hiring timeline…
              </div>
            ) : error ? (
              <div
                role="alert"
                className="flex h-52 flex-col items-center justify-center gap-3 rounded-2xl border border-danger-400/50 bg-danger-800/15 p-4 text-center"
              >
                <p className="text-sm text-neutral-100">{error}</p>
                <Button
                  type="button"
                  variant="outlined"
                  intent="accent"
                  size="sm"
                  onClick={() => setAttempt((v) => v + 1)}
                >
                  Retry
                </Button>
              </div>
            ) : (
              <HiringTimelineChart
                stats={monthlyStats}
                companyName={display.name}
              />
            )}
          </div>

          <div>
            <h3 className="mb-3 text-sm font-bold text-neutral-50">
              Latest Positions
            </h3>
            <div className="flex max-h-52 flex-col gap-2.5 overflow-y-auto pr-1">
              {loading ? (
                <div className="space-y-2.5" aria-hidden="true">
                  <div className="h-16 rounded-xl bg-overlay/10 motion-safe:animate-pulse" />
                  <div className="h-16 rounded-xl bg-overlay/10 motion-safe:animate-pulse" />
                </div>
              ) : latestPositions.length > 0 ? (
                latestPositions.map((pos) => {
                  const safeUrl = safeExternalUrl(pos.applyLink);
                  const dateLabel = shortIsoDate(pos.postedAt);
                  const typeLabel = pos.type ? JOB_TYPES[pos.type] : null;
                  const meta = [dateLabel, typeLabel]
                    .filter(Boolean)
                    .join(" • ");
                  const inner = (
                    <>
                      <div className="min-w-0 flex-1">
                        <h4 className="line-clamp-1 text-sm font-semibold text-neutral-50 group-hover:text-primary-200">
                          {pos.title}
                        </h4>
                        {meta && (
                          <p className="mt-1 text-xs text-neutral-200">
                            {meta}
                          </p>
                        )}
                      </div>
                      <Briefcase
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-accent-300"
                      />
                    </>
                  );

                  return safeUrl ? (
                    <a
                      key={pos.id}
                      href={safeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start justify-between gap-3 rounded-xl border border-neutral-500/60 bg-overlay/5 p-3 transition-colors hover:border-primary-300/80 hover:bg-overlay/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200"
                    >
                      {inner}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  ) : (
                    <div
                      key={pos.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-neutral-500/60 bg-overlay/5 p-3"
                    >
                      {inner}
                    </div>
                  );
                })
              ) : (
                <div className="flex h-52 items-center justify-center rounded-2xl border border-neutral-500/50 bg-overlay/5 px-4 text-center">
                  <p className="text-sm text-neutral-200">
                    No active positions tracked recently.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* About */}
        {display.description && (
          <section className="mb-6 rounded-2xl border border-neutral-500/50 bg-overlay/5 p-5">
            <h3 className="mb-2 text-sm font-bold text-neutral-50">About</h3>
            <p className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-neutral-100">
              {display.description}
            </p>
          </section>
        )}

        {/* Global Presence */}
        {display.globalPresence.length > 0 && (
          <section className="mb-7">
            <h3 className="mb-3 text-sm font-bold text-neutral-50">
              Global Presence
            </h3>
            <div className="flex flex-wrap gap-2">
              {display.globalPresence.map((region) => (
                <span
                  key={region}
                  className="inline-flex items-center rounded-lg border border-neutral-500/70 bg-overlay/5 px-3 py-1.5 text-xs font-medium text-neutral-100"
                >
                  {region}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Website & LinkedIn External Links */}
        {(website || linkedin) && (
          <div className="mt-auto flex flex-col gap-3 sm:flex-row">
            {website && (
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-action-primary px-5 py-2.5 text-sm font-bold text-on-action transition-colors hover:bg-action-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200"
              >
                <Globe aria-hidden="true" className="size-4 shrink-0" />
                <span>Website</span>
                <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
            {linkedin && (
              <a
                href={linkedin}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0a66c2] px-5 py-2.5 text-sm font-bold text-on-action transition-colors hover:bg-[#004182] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200"
              >
                <LinkedInIcon />
                <span>LinkedIn</span>
                <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
          </div>
        )}
      </div>
    </AccessibleModal>
  );
}
