import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

const { get, post, patch, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@/src/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/lib/api-client")>();
  return {
    ...actual,
    api: { get, post, patch, delete: del },
  };
});

import { ApiError } from "@/src/lib/api-client";
import { normalizeResearchYears } from "../researchYears.api";
import {
  PAPERS_MAX_LIMIT,
  PaperApiError,
  buildPaperParams,
  createPaper,
  deletePaper,
  fetchPaper,
  fetchPapers,
  getPaperErrorKind,
  isPaperForbidden,
  isPaperNotFound,
  isPaperUnauthorized,
  normalizePaper,
  resolvePaperExternalUrl,
  updatePaper,
  type PaperSortField,
} from "./paper.api";

const RAW_PAPER = {
  id: 22,
  putCode: "900719925474099312",
  orcidPath: "0000-0002-9999-0022",
  title: "  Mock Paper: Pioneer 1994 Deep-Submicron Scaling Retrospective  ",
  subtitle: "64-bit BigInt putCode serialization check",
  type: "journal-article",
  journalTitle: "Mock Journal of Solid-State Circuits",
  doi: "10.5555/mock.paper.1994.022",
  url: "https://example.org/mock-papers/22",
  publicationYear: 1994,
  publicationMonth: 1,
  publicationDay: 10,
  sourceName: "IEEE Xplore Mock Index",
  visibility: "public",
  staffId: 5,
  staff: { id: 5, name: "Dr. Mock Huda Mostafa" },
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  del.mockReset();
});

describe("buildPaperParams (real parameter names & caps)", () => {
  it("uses `order` (never `sortOrder`), caps `limit` at 50, and omits invalid sort values", () => {
    const params = buildPaperParams({
      search: "  CMOS  ",
      page: 2,
      limit: 250,
      sortBy: "title",
      order: "asc",
      yearRange: { fromYear: 2020, toYear: 2025 },
      year: 2021, // ignored when yearRange is set so backend never rejects with 400
    });

    expect(params).toEqual({
      page: 2,
      limit: PAPERS_MAX_LIMIT,
      search: "CMOS",
      fromYear: 2020,
      toYear: 2025,
      sortBy: "title",
      order: "asc",
    });
    expect("sortOrder" in params).toBe(false);
    expect("year" in params).toBe(false);

    const invalidSort = buildPaperParams({
      sortBy: "bogusField" as PaperSortField,
      limit: 0,
    });
    expect(invalidSort).toEqual({ page: 1, limit: 10 });
  });
});

describe("normalizePaper & resolvePaperExternalUrl", () => {
  it("preserves 64-bit putCode strings, trims text, and handles null/missing fields", () => {
    const normalized = normalizePaper(RAW_PAPER);
    expect(normalized.putCode).toBe("900719925474099312");
    expect(normalized.title).toBe(
      "Mock Paper: Pioneer 1994 Deep-Submicron Scaling Retrospective",
    );
    expect(normalized.staff).toEqual({ id: 5, name: "Dr. Mock Huda Mostafa" });

    const minimal = normalizePaper({ id: 11, title: "Minimal", publicationYear: 0 });
    expect(minimal.publicationYear).toBeNull();
    expect(minimal.subtitle).toBeNull();
    expect(minimal.staff).toBeNull();
  });

  it("allows only http(s) URLs and falls back to https://doi.org when url is absent or unsafe", () => {
    expect(
      resolvePaperExternalUrl({
        url: "https://example.org/p/1",
        doi: "10.5555/test",
      }),
    ).toBe("https://example.org/p/1");

    expect(
      resolvePaperExternalUrl({
        url: "javascript:alert(1)",
        doi: null,
      }),
    ).toBeNull();

    expect(
      resolvePaperExternalUrl({
        url: "ftp://legacy.mock.example/file.pdf",
        doi: "10.5555/mock.safe.doi.21",
      }),
    ).toBe("https://doi.org/10.5555/mock.safe.doi.21");
  });
});

describe("normalizeResearchYears", () => {
  it("sorts years ascending, deduplicates, and ignores null or invalid years", () => {
    const res = normalizeResearchYears(
      [2025, 1999, 2025, -5, null, 2012],
      [
        { year: 2025, count: 4 },
        { year: 1999, count: 2 },
        { year: 2012, count: 1 },
      ],
    );
    expect(res).toEqual({
      years: [1999, 2012, 2025],
      counts: [
        { year: 1999, count: 2 },
        { year: 2012, count: 1 },
        { year: 2025, count: 4 },
      ],
    });
  });
});

describe("fetchPapers, fetchPaper, createPaper, updatePaper, deletePaper", () => {
  it("fetches paginated papers with `order` param and normalizes rows", async () => {
    get.mockResolvedValue({
      status: 200,
      data: {
        success: true,
        data: [RAW_PAPER],
        pagination: { total: 160, page: 1, limit: 12, totalPages: 14 },
      },
    });

    const res = await fetchPapers({
      search: " scaling ",
      sortBy: "publicationYear",
      order: "desc",
    });

    expect(get).toHaveBeenCalledWith(
      "/papers",
      expect.objectContaining({
        params: {
          page: 1,
          limit: 12,
          search: "scaling",
          sortBy: "publicationYear",
          order: "desc",
        },
      }),
    );
    expect(res.data[0].putCode).toBe("900719925474099312");
    expect(res.pagination.total).toBe(160);
  });

  it("fetches a paper by ID and supports create, partial update, and delete", async () => {
    get.mockResolvedValueOnce({
      status: 200,
      data: { success: true, data: RAW_PAPER },
    });
    const single = await fetchPaper(22);
    expect(single.id).toBe(22);

    post.mockResolvedValueOnce({
      status: 201,
      data: { success: true, data: { ...RAW_PAPER, id: 161 } },
    });
    const created = await createPaper({
      title: "Mock Paper: Created",
      staffId: 5,
      putCode: 123456,
    });
    expect(created.id).toBe(161);
    expect(post).toHaveBeenCalledWith(
      "/papers",
      expect.objectContaining({ title: "Mock Paper: Created", staffId: 5, putCode: "123456" }),
      expect.any(Object),
    );

    patch.mockResolvedValueOnce({
      status: 200,
      data: { success: true, data: { ...RAW_PAPER, title: "Mock Paper: Updated" } },
    });
    const updated = await updatePaper(22, { title: "Mock Paper: Updated" });
    expect(updated.title).toBe("Mock Paper: Updated");

    del.mockResolvedValueOnce({ status: 200, data: { success: true } });
    await expect(deletePaper(22)).resolves.toBeUndefined();
  });

  it("classifies 400 (with fieldErrors), 401, 403, 404, 409, 429, 5xx, network(0), non-JSON bodies, and aborted requests", async () => {
    // 400 validation with field mapping
    post.mockResolvedValueOnce({
      status: 400,
      data: { success: false, message: "University staff member not found" },
    });
    await expect(
      createPaper({ title: "Mock", staffId: 999 }),
    ).rejects.toMatchObject({
      status: 400,
      kind: "validation",
      fieldErrors: { staffId: "University staff member not found" },
    });

    // Non-JSON HTML 502 error body
    get.mockResolvedValueOnce({
      status: 502,
      data: "<html><body>Bad Gateway</body></html>",
    });
    await expect(fetchPaper(1)).rejects.toMatchObject({
      status: 502,
      kind: "server",
      message: "Request failed with status 502",
    });

    // Aborted request propagates as cancel error
    const cancel = new axios.CanceledError("aborted");
    get.mockRejectedValueOnce(cancel);
    await expect(fetchPapers()).rejects.toBe(cancel);

    // Status helpers
    expect(getPaperErrorKind(new ApiError(401, "No session"))).toBe("unauthorized");
    expect(isPaperUnauthorized(new ApiError(401, "No session"))).toBe(true);
    expect(isPaperForbidden(new ApiError(403, "Admins only"))).toBe(true);
    expect(isPaperNotFound(new ApiError(404, "Not found"))).toBe(true);
    expect(getPaperErrorKind(new ApiError(409, "Conflict"))).toBe("conflict");
    expect(getPaperErrorKind(new ApiError(429, "Too many requests"))).toBe("rate_limited");
    expect(getPaperErrorKind(new ApiError(0, "Network down"))).toBe("network");
    expect(getPaperErrorKind(new PaperApiError(400, "Title is required", "validation"))).toBe(
      "validation",
    );
  });
});
