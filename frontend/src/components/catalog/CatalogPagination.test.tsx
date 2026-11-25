import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CatalogPagination, { buildPaginationRange } from "./CatalogPagination";

describe("buildPaginationRange", () => {
  it("returns all pages when totalPages <= 7", () => {
    expect(buildPaginationRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(buildPaginationRange(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("shows trailing ellipsis near the start", () => {
    expect(buildPaginationRange(1, 14)).toEqual([
      1,
      2,
      3,
      4,
      5,
      "ellipsis-end",
      14,
    ]);
    expect(buildPaginationRange(4, 14)).toEqual([
      1,
      2,
      3,
      4,
      5,
      "ellipsis-end",
      14,
    ]);
  });

  it("shows both ellipses in the middle", () => {
    expect(buildPaginationRange(7, 14)).toEqual([
      1,
      "ellipsis-start",
      6,
      7,
      8,
      "ellipsis-end",
      14,
    ]);
  });

  it("shows leading ellipsis near the end", () => {
    expect(buildPaginationRange(11, 14)).toEqual([
      1,
      "ellipsis-start",
      10,
      11,
      12,
      13,
      14,
    ]);
    expect(buildPaginationRange(14, 14)).toEqual([
      1,
      "ellipsis-start",
      10,
      11,
      12,
      13,
      14,
    ]);
  });
});

describe("CatalogPagination", () => {
  it("renders nothing when totalPages <= 1", () => {
    const { container } = render(
      <CatalogPagination
        label="Test pagination"
        page={1}
        totalPages={1}
        onPageChange={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("navigates via page numbers, Previous, and Next and marks current page", () => {
    const onPageChange = vi.fn();
    render(
      <CatalogPagination
        label="Papers pagination"
        page={2}
        totalPages={10}
        onPageChange={onPageChange}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Page 2" }),
    ).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByRole("button", { name: "Page 5" }));
    expect(onPageChange).toHaveBeenLastCalledWith(5);

    fireEvent.click(screen.getByRole("button", { name: /Previous/i }));
    expect(onPageChange).toHaveBeenLastCalledWith(1);

    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    expect(onPageChange).toHaveBeenLastCalledWith(3);
  });
});
