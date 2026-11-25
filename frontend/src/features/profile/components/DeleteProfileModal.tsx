"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, Trash2, X } from "lucide-react";
import Button from "@/src/components/ui/Button/Button";

interface DeleteProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

const CONFIRM_WORD = "DELETE";

export default function DeleteProfileModal({
  isOpen,
  onClose,
  onConfirm,
}: DeleteProfileModalProps) {
  const titleId = useId();
  const inputId = useId();
  const [confirmationText, setConfirmationText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const handleClose = () => {
    setConfirmationText("");
    setError(null);
    setIsDeleting(false);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isDeleting) {
        event.preventDefault();
        setConfirmationText("");
        setError(null);
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  const canConfirm =
    confirmationText.trim().toUpperCase() === CONFIRM_WORD && !isDeleting;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setError(null);
    setIsDeleting(true);
    try {
      await onConfirm();
      handleClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not delete your profile. Please try again.",
      );
      setIsDeleting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
    >
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-neutral-900/75 backdrop-blur-sm"
        onClick={() => {
          if (!isDeleting) handleClose();
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-lg rounded-3xl border border-danger-400/60 bg-surface p-6 text-neutral-50 shadow-2xl sm:p-7"
      >
        <button
          type="button"
          onClick={handleClose}
          disabled={isDeleting}
          aria-label="Close delete profile dialog"
          className="absolute top-4 right-4 inline-flex size-10 items-center justify-center rounded-full border border-neutral-500/60 bg-overlay/5 text-neutral-200 transition-colors hover:border-primary-300 hover:text-neutral-50 focus-visible:outline-2 focus-visible:outline-accent-200 disabled:opacity-50 cursor-pointer"
        >
          <X aria-hidden="true" className="size-5" />
        </button>

        <div className="flex items-start gap-3 pr-10">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-danger-400/50 bg-danger-800/20 text-danger-300">
            <AlertTriangle aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 id={titleId} className="text-xl font-bold text-neutral-50">
              Delete Profile
            </h2>
            <p className="mt-1 text-sm text-neutral-200">
              This removes your saved profile details permanently.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-2 rounded-2xl border border-neutral-600/70 bg-overlay/5 p-4 text-sm text-neutral-200">
          <p>
            <strong className="text-danger-300">What will be removed:</strong>{" "}
            Your profile information (name, location, university, faculty,
            department, graduation year, social links, skills, and experience).
          </p>
          <p>
            <strong className="text-accent-200">What will remain:</strong> Your
            login account (email &amp; password) and active session will remain.
            You can create a new profile again at any time or sign out
            afterward.
          </p>
        </div>

        <div className="mt-5">
          <label
            htmlFor={inputId}
            className="mb-1.5 block text-sm font-medium text-neutral-100"
          >
            Type <span className="font-mono font-bold text-danger-300">{CONFIRM_WORD}</span>{" "}
            to confirm
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            autoComplete="off"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder={CONFIRM_WORD}
            className="h-11 w-full rounded-xl border border-neutral-500/80 bg-neutral-800/70 px-3.5 text-sm text-neutral-50 placeholder:text-neutral-400 focus-visible:outline-2 focus-visible:outline-accent-200"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-xl border border-danger-400/60 bg-danger-800/20 px-3.5 py-2.5 text-sm text-danger-300"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="outlined"
            intent="primary"
            disabled={isDeleting}
            onClick={handleClose}
            className="min-h-11 rounded-xl"
          >
            Cancel
          </Button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={handleConfirm}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-danger-400/80 bg-danger-700/30 px-5 text-sm font-semibold text-danger-200 transition-colors hover:bg-danger-700/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger-300 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            {isDeleting ? (
              <>
                <Loader2
                  aria-hidden="true"
                  className="size-4 motion-safe:animate-spin"
                />
                Deleting…
              </>
            ) : (
              <>
                <Trash2 aria-hidden="true" className="size-4" />
                Delete Profile
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
