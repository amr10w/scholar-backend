"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";
import Button from "@/src/components/ui/Button/Button";
import getButtonClasses from "@/src/components/ui/Button/button.style";
import { fetchPublication, isPublicationNotFound } from "./publication.api";
import {
  ACCESS_TYPE_LABELS,
  LICENSE_LABELS,
  PUBLISHER_LABELS,
  SUB_BUCKET_LABELS,
  WORKFLOW_LABELS,
} from "./publication.constants";
import type { Publication } from "./publication.type";
import { formatIssn, hasText, safePublicationUrl } from "./publication.utils";

interface PublicationDetailModalProps {
  publicationId: number | null;
  onClose: () => void;
}

type ModalState =
  | { status: "loading" }
  | { status: "ready"; publication: Publication }
  | { status: "not_found"; message: string }
  | { status: "error"; message: string };

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const PublicationDetailModal = ({
  publicationId,
  onClose,
}: PublicationDetailModalProps) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const [attempt, setAttempt] = useState(0);
  const [prevId, setPrevId] = useState(publicationId);
  const [state, setState] = useState<ModalState>({ status: "loading" });

  // Reset state immediately during render when switching to a different publicationId (no error flash)
  if (prevId !== publicationId) {
    setPrevId(publicationId);
    setAttempt(0);
    setState({ status: "loading" });
  }

  // Capture trigger focus, move focus into dialog, lock background scroll, and restore on close
  useEffect(() => {
    if (publicationId === null) return;

    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [publicationId, onClose]);

  // Fetch publication details by ID
  useEffect(() => {
    if (publicationId === null) return;

    const controller = new AbortController();

    fetchPublication(publicationId, controller.signal)
      .then((publication) => {
        if (controller.signal.aborted) return;
        setState({ status: "ready", publication });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        const message =
          cause instanceof Error && cause.message
            ? cause.message
            : "Couldn't load publication details.";
        if (isPublicationNotFound(cause)) {
          setState({ status: "not_found", message });
        } else {
          setState({ status: "error", message });
        }
      });

    return () => controller.abort();
  }, [publicationId, attempt]);

  if (publicationId === null) return null;

  const publication = state.status === "ready" ? state.publication : null;
  const externalUrl = publication ? safePublicationUrl(publication.URL) : null;
  const formattedIssn = publication ? formatIssn(publication.issn) : null;
  const formattedEissn = publication ? formatIssn(publication.eissn) : null;
  const formattedIssnCdrom = publication ? formatIssn(publication.issnCdrom) : null;
  const publisherLabel =
    publication && hasText(publication.publisher)
      ? (PUBLISHER_LABELS[publication.publisher] ?? publication.publisher)
      : null;
  const accessLabel =
    publication && hasText(publication.openAccessType)
      ? (ACCESS_TYPE_LABELS[publication.openAccessType] ?? publication.openAccessType)
      : null;
  const workflowLabel =
    publication && hasText(publication.workflow)
      ? (WORKFLOW_LABELS[publication.workflow] ?? publication.workflow)
      : null;
  const licenseLabel =
    publication?.licenseType && hasText(publication.licenseType)
      ? (LICENSE_LABELS[publication.licenseType] ?? publication.licenseType)
      : null;
  const subBucketLabel =
    publication?.subBucket && hasText(publication.subBucket)
      ? (SUB_BUCKET_LABELS[publication.subBucket] ?? publication.subBucket)
      : null;
  const subCategoryName =
    publication?.subCategory && hasText(publication.subCategory.name)
      ? publication.subCategory.name.trim()
      : null;
  const domainName =
    publication?.subCategory?.domain && hasText(publication.subCategory.domain.name)
      ? publication.subCategory.domain.name.trim()
      : null;

  const metadataItems: { label: string; value: string }[] = [];
  if (publisherLabel) metadataItems.push({ label: "Publisher", value: publisherLabel });
  if (publication && hasText(publication.publicationType)) {
    metadataItems.push({ label: "Publication Type", value: publication.publicationType });
  }
  if (accessLabel) metadataItems.push({ label: "Access Model", value: accessLabel });
  if (workflowLabel) metadataItems.push({ label: "Editorial Workflow", value: workflowLabel });
  if (licenseLabel) metadataItems.push({ label: "License", value: licenseLabel });
  if (publication && publication.launchYear !== null) {
    metadataItems.push({ label: "Launch Year", value: String(publication.launchYear) });
  }
  if (subCategoryName) {
    metadataItems.push({
      label: "Sub-Category",
      value: domainName ? `${subCategoryName} (${domainName})` : subCategoryName,
    });
  }
  if (formattedIssn) metadataItems.push({ label: "ISSN", value: formattedIssn });
  if (formattedEissn) metadataItems.push({ label: "eISSN", value: formattedEissn });
  if (formattedIssnCdrom) metadataItems.push({ label: "CD-ROM ISSN", value: formattedIssnCdrom });
  if (publication && hasText(publication.imprint)) {
    metadataItems.push({ label: "Imprint", value: publication.imprint.trim() });
  }
  if (subBucketLabel) metadataItems.push({ label: "Subscription Bucket", value: subBucketLabel });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/80 p-4 backdrop-blur-xs"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col gap-6 overflow-y-auto rounded-2xl border border-neutral-500 bg-neutral-900 p-5 text-neutral-50 shadow-2xl md:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            {publication && hasText(publication.acronym) && (
              <span className="self-start rounded-full border border-accent-300 px-3 py-0.5 text-xs font-semibold text-accent-200">
                {publication.acronym.trim()}
              </span>
            )}
            <h2
              id={titleId}
              className="text-xl font-bold leading-snug text-neutral-50 wrap-break-word md:text-2xl"
            >
              {publication && hasText(publication.title)
                ? publication.title.trim()
                : state.status === "not_found"
                  ? "Publication not found"
                  : state.status === "error"
                    ? "Publication unavailable"
                    : "Publication details"}
            </h2>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close publication details"
            onClick={onClose}
            className="shrink-0 rounded-full border border-neutral-500 p-2 text-neutral-200 transition-colors hover:border-accent-300 hover:text-accent-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-300 cursor-pointer"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {state.status === "loading" && (
          <div
            role="status"
            className="flex items-center justify-center gap-2.5 py-16 text-neutral-200"
          >
            <Loader2 className="size-5 animate-spin text-accent-300" aria-hidden="true" />
            <span>Loading publication details…</span>
          </div>
        )}

        {state.status === "not_found" && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <p className="max-w-md text-neutral-100">
              This publication could not be found or may have been removed.
            </p>
            <Button
              type="button"
              variant="outlined"
              intent="secondary"
              size="md"
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        )}

        {state.status === "error" && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <p className="max-w-md text-neutral-100">{state.message}</p>
            <Button
              type="button"
              variant="outlined"
              intent="accent"
              size="md"
              onClick={() => {
                setState({ status: "loading" });
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </Button>
          </div>
        )}

        {publication && (
          <div className="flex flex-col gap-6">
            {metadataItems.length > 0 && (
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {metadataItems.map((item) => (
                  <div
                    key={item.label}
                    className="flex min-w-0 flex-col gap-0.5 rounded-xl border border-neutral-500/60 bg-white/5 p-3"
                  >
                    <dt className="text-xs font-medium uppercase tracking-wider text-neutral-300">
                      {item.label}
                    </dt>
                    <dd className="text-sm font-semibold text-neutral-50 wrap-break-word">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {hasText(publication.specificFocusScope) && (
              <div className="flex flex-col gap-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-accent-300">
                  Specific Focus Scope
                </h3>
                <p className="text-sm leading-relaxed text-neutral-100 wrap-break-word">
                  {publication.specificFocusScope.trim()}
                </p>
              </div>
            )}

            {hasText(publication.journalScope) && (
              <div className="flex flex-col gap-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-accent-300">
                  Journal Scope
                </h3>
                <p className="text-sm leading-relaxed text-neutral-100 wrap-break-word">
                  {publication.journalScope.trim()}
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-neutral-500/60 pt-4">
              {externalUrl && (
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${getButtonClasses({
                    variant: "solid",
                    intent: "primary",
                    size: "md",
                  })} inline-flex items-center gap-2 rounded-full! px-5`}
                >
                  <span>Visit Journal Website</span>
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              )}
              <Button
                type="button"
                variant="outlined"
                intent="secondary"
                size="md"
                onClick={onClose}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicationDetailModal;
