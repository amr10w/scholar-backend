"use client";

import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import {
  DetailFields,
  DetailSection,
  safeExternalUrl,
} from "@/src/components/catalog/CatalogDetails";
import Badge from "@/src/components/ui/Badge/Badge";
import getButtonClasses from "@/src/components/ui/Button/button.style";
import { useCatalogDetail } from "@/src/hooks/useCatalogDetail";
import {
  ResearchDetailShell,
  ResearchDetailState,
} from "../ResearchDetailShell";
import {
  ACCESS_TYPE_LABELS,
  LICENSE_LABELS,
  PUBLISHER_LABELS,
} from "./publication.constants";
import type { Publication } from "./publication.type";
import {
  daysToWeeks,
  formatCost,
  formatIssn,
  formatNumber,
  hasText,
  toNumber,
} from "./publication.utils";

function filterPresentFields(
  fields: { label: string; value: ReactNode }[],
): { label: string; value: ReactNode }[] {
  return fields.filter(
    ({ value }) =>
      value !== null &&
      value !== undefined &&
      value !== "" &&
      value !== "—",
  );
}

export default function PublicationDetails({
  id,
  initialPublication,
  onBack,
}: {
  id: string;
  /** Row already loaded by the list, so details render without a spinner */
  initialPublication?: Publication;
  onBack?: () => void;
}) {
  const state = useCatalogDetail<Publication>(
    id,
    "/publications",
    initialPublication,
  );
  const publication = state.data;
  const website = safeExternalUrl(publication?.URL);
  const editorialStats = publication?.editorialStats ?? [];
  const categoryLine = publication
    ? [
        publication.subCategory?.domain?.name,
        publication.subCategory?.name,
      ]
        .filter(hasText)
        .join(" · ")
    : "";
  const hasScope =
    hasText(publication?.journalScope) ||
    hasText(publication?.specificFocusScope);

  const infoFields = publication
    ? filterPresentFields([
        {
          label: "Publisher",
          value: hasText(publication.publisher)
            ? (PUBLISHER_LABELS[publication.publisher] ??
              publication.publisher)
            : null,
        },
        {
          label: "Type",
          value: hasText(publication.publicationType)
            ? publication.publicationType
            : null,
        },
        {
          label: "Sub-category",
          value: categoryLine || null,
        },
        {
          label: "Launched",
          value: publication.yearLunched ?? publication.launchYear ?? null,
        },
        { label: "ISSN", value: formatIssn(publication.issn) },
        { label: "eISSN", value: formatIssn(publication.eissn) },
        {
          label: "CD-ROM ISSN",
          value: formatIssn(publication.issnCdrom),
        },
        {
          label: "License",
          value: publication.licenseType
            ? (LICENSE_LABELS[publication.licenseType] ??
              publication.licenseType)
            : null,
        },
        {
          label: "Access model",
          value: hasText(publication.openAccessType)
            ? (ACCESS_TYPE_LABELS[publication.openAccessType] ??
              publication.openAccessType)
            : null,
        },
        {
          label: "Workflow",
          value: hasText(publication.workflow)
            ? publication.workflow === "standard"
              ? "Standard"
              : "Non-standard"
            : null,
        },
        {
          label: "Imprint",
          value: hasText(publication.imprint) ? publication.imprint : null,
        },
        {
          label: "Publishing collection",
          value: hasText(publication.subBucket)
            ? publication.subBucket.replace(/_/g, " ")
            : null,
        },
      ])
    : [];

  return (
    <ResearchDetailShell onBack={onBack} backParam="publication">
      <ResearchDetailState
        label="Publication"
        loading={state.loading}
        notFound={state.notFound}
        error={state.error}
        onRetry={state.reload}
      />
      {publication && (
        <article className="flex min-w-0 flex-col gap-6">
          <header className="rounded-3xl border border-primary-300/60 bg-brand-gradient p-5 md:p-7">
            <p className="mb-3 text-sm text-accent-300">
              {PUBLISHER_LABELS[publication.publisher] ?? publication.publisher}
              {hasText(publication.acronym) ? ` · ${publication.acronym}` : ""}
            </p>
            <h1 className="wrap-break-word text-2xl font-semibold text-primary-200 md:text-3xl">
              {publication.title}
            </h1>
            {categoryLine && (
              <p className="mt-3 text-neutral-200">{categoryLine}</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {hasText(publication.publicationType) && (
                <Badge variant="solid" intent="accent">
                  {publication.publicationType}
                </Badge>
              )}
              {hasText(publication.openAccessType) && (
                <Badge variant="outlined" intent="accent">
                  {ACCESS_TYPE_LABELS[publication.openAccessType] ??
                    publication.openAccessType}
                </Badge>
              )}
              {publication.licenseType && (
                <Badge variant="outlined" intent="primary">
                  {LICENSE_LABELS[publication.licenseType] ??
                    publication.licenseType}
                </Badge>
              )}
            </div>
            {website && (
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className={`${getButtonClasses({ variant: "outlined", intent: "accent", size: "md" })} mt-5 min-h-11 w-fit gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-200`}
              >
                Visit publication website
                <ExternalLink aria-hidden="true" className="size-4" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
          </header>
          {hasScope && (
            <DetailSection title="Scope and focus">
              {hasText(publication.journalScope) && (
                <p className="max-w-4xl whitespace-pre-wrap wrap-break-word leading-relaxed text-neutral-100">
                  {publication.journalScope}
                </p>
              )}
              {hasText(publication.specificFocusScope) && (
                <p
                  className={`${hasText(publication.journalScope) ? "mt-4 " : ""}max-w-4xl wrap-break-word leading-relaxed text-neutral-200`}
                >
                  Specific focus: {publication.specificFocusScope}
                </p>
              )}
            </DetailSection>
          )}
          {infoFields.length > 0 && (
            <DetailSection title="Publication information">
              <DetailFields fields={infoFields} />
            </DetailSection>
          )}
          {!!publication.yearlyMetrics?.length && (
            <DetailSection title="Metrics by year">
              <div className="flex flex-col gap-6">
                {publication.yearlyMetrics.map((metric) => {
                  const metricFields = filterPresentFields([
                    {
                      label: "Impact factor",
                      value: formatNumber(toNumber(metric.impactFactor)),
                    },
                    {
                      label: "5-year impact factor",
                      value: formatNumber(toNumber(metric.impactFactor5yr)),
                    },
                    { label: "Quartile", value: metric.quartile },
                    {
                      label: "CiteScore",
                      value: formatNumber(toNumber(metric.citescore)),
                    },
                    {
                      label: "SJR",
                      value: formatNumber(toNumber(metric.sjr)),
                    },
                    {
                      label: "JCI",
                      value: formatNumber(toNumber(metric.jci)),
                    },
                    {
                      label: "H5 index",
                      value: formatNumber(toNumber(metric.h5Index)),
                    },
                    {
                      label: "Eigenfactor",
                      value: formatNumber(toNumber(metric.eigenfactor)),
                    },
                    {
                      label: "Article influence score",
                      value: formatNumber(
                        toNumber(metric.articleInfluenceScore),
                      ),
                    },
                    {
                      label: "Total citations",
                      value:
                        typeof metric.totalCitations === "number"
                          ? metric.totalCitations.toLocaleString("en")
                          : null,
                    },
                    {
                      label: "Article downloads",
                      value:
                        typeof metric.articleDownloads === "number"
                          ? metric.articleDownloads.toLocaleString("en")
                          : null,
                    },
                  ]);
                  if (!metricFields.length) return null;
                  return (
                    <section
                      key={metric.id}
                      className="border-t border-neutral-600/60 pt-4 first:border-0 first:pt-0"
                    >
                      <h3 className="mb-4 font-medium text-accent-200">
                        {metric.metricYear}
                        {metric.indexingService
                          ? ` · ${metric.indexingService}`
                          : ""}
                      </h3>
                      <DetailFields fields={metricFields} />
                    </section>
                  );
                })}
              </div>
            </DetailSection>
          )}
          {!!publication.pricings?.length && (
            <DetailSection title="Fees and pricing">
              <DetailFields
                fields={filterPresentFields(
                  publication.pricings.map((price) => ({
                    label: `${price.currency} · ${price.pricingYear}${price.isSubscription ? " · Subscription" : " · Article fee"}`,
                    value: formatCost(price),
                  })),
                )}
              />
            </DetailSection>
          )}
          {editorialStats.length > 0 && (
            <DetailSection title="Editorial process">
              <div className="flex flex-col gap-6">
                {editorialStats.map((stat, index) => {
                  const statFields = filterPresentFields([
                    {
                      label: "First decision",
                      value: formatNumber(
                        daysToWeeks(stat.submissionToFirstDecision),
                        " weeks",
                      ),
                    },
                    {
                      label: "Review decision",
                      value: formatNumber(
                        daysToWeeks(stat.submissionToReviewDecision),
                        " weeks",
                      ),
                    },
                    {
                      label: "Submission to acceptance",
                      value: formatNumber(
                        daysToWeeks(stat.submissionToAcceptance),
                        " weeks",
                      ),
                    },
                    {
                      label: "Acceptance to publication",
                      value: formatNumber(
                        daysToWeeks(stat.acceptanceToPublication),
                        " weeks",
                      ),
                    },
                    {
                      label: "Acceptance rate",
                      value: formatNumber(toNumber(stat.acceptanceRate), "%"),
                    },
                  ]);
                  if (!statFields.length) return null;
                  return (
                    <section key={stat.id}>
                      {editorialStats.length > 1 && (
                        <h3 className="mb-3 text-accent-200">
                          Editorial statistics {index + 1}
                        </h3>
                      )}
                      <DetailFields fields={statFields} />
                    </section>
                  );
                })}
              </div>
            </DetailSection>
          )}
        </article>
      )}
    </ResearchDetailShell>
  );
}
