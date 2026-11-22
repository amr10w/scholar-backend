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
import {
  buildPublicationParams,
  createPublication,
  deletePublication,
  fetchPublication,
  fetchPublications,
  getPublicationErrorKind,
  isPublicationConflict,
  isPublicationForbidden,
  isPublicationNotFound,
  isPublicationUnauthorized,
  normalizePublication,
  updatePublication,
} from "./publication.api";

const RAW_JAIR = {
  id: 1,
  subCategoryId: 5,
  title: "Journal of Artificial Intelligence Research",
  acronym: "JAIR",
  publisher: "ACM" as const,
  publicationType: "Journal" as const,
  openAccessType: "Full_Open_Access" as const,
  workflow: "standard" as const,
  issn: "1076-9757",
  eissn: "1943-5037",
  issnCdrom: null,
  URL: "https://jair.org",
  yearLunched: 1993,
  specificFocusScope: "Foundational AI research",
  licenseType: "CC_BY" as const,
  journalScope: "Peer-reviewed AI articles.",
  imprint: "AI Access Foundation",
  subBucket: "CoreGold" as const,
  createdAt: "2026-01-01T10:00:00.000Z",
  updatedAt: "2026-01-01T10:00:00.000Z",
  subCategory: { id: 5, domainId: 1, name: "Artificial Intelligence" },
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  del.mockReset();
});

describe("buildPublicationParams", () => {
  it("omits empty search and forwards sortBy and sortOrder", () => {
    expect(
      buildPublicationParams({
        page: 2,
        limit: 10,
        search: "   ",
        sortBy: "yearLunched",
        sortOrder: "desc",
      }),
    ).toEqual({
      page: 2,
      limit: 10,
      sortBy: "yearLunched",
      sortOrder: "desc",
    });

    expect(buildPublicationParams({ search: "  JAIR  " })).toEqual({
      page: 1,
      limit: 10,
      search: "JAIR",
    });
  });
});

describe("normalizePublication (yearLunched boundary isolation)", () => {
  it("maps raw yearLunched to launchYear and never exposes yearLunched on the model", () => {
    const pub = normalizePublication(RAW_JAIR);
    expect(pub.launchYear).toBe(1993);
    expect("yearLunched" in pub).toBe(false);
    expect(pub.subCategory).toEqual({ id: 5, domainId: 1, name: "Artificial Intelligence" });
  });

  it("defensively handles null, undefined, or partial records without crashing", () => {
    const empty = normalizePublication(null);
    expect(empty.id).toBe(0);
    expect(empty.title).toBe("");
    expect(empty.launchYear).toBeNull();
    expect(empty.subCategory).toBeNull();
  });
});

describe("fetchPublications", () => {
  it("fetches GET /publications with search, sort, page, limit and normalizes rows", async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: [RAW_JAIR],
        pagination: { total: 200, page: 1, limit: 10, totalPages: 20 },
      },
    });

    const res = await fetchPublications({
      search: " JAIR ",
      page: 1,
      sortBy: "title",
      sortOrder: "asc",
    });

    expect(get).toHaveBeenCalledWith("/publications", {
      params: { page: 1, limit: 10, search: "JAIR", sortBy: "title", sortOrder: "asc" },
      signal: undefined,
    });
    expect(res.data[0].launchYear).toBe(1993);
    expect("yearLunched" in res.data[0]).toBe(false);
    expect(res.pagination.total).toBe(200);
  });

  it("propagates aborted requests without wrapping them", async () => {
    const cancel = new axios.CanceledError("aborted");
    get.mockRejectedValue(cancel);
    await expect(fetchPublications({ page: 1 })).rejects.toBe(cancel);
  });
});

describe("fetchPublication", () => {
  it("fetches GET /publications/:id, URL-encodes id, and maps yearLunched to launchYear", async () => {
    get.mockResolvedValue({ data: { success: true, data: RAW_JAIR } });

    const pub = await fetchPublication(1);
    expect(get).toHaveBeenCalledWith("/publications/1", { signal: undefined });
    expect(pub.id).toBe(1);
    expect(pub.launchYear).toBe(1993);
    expect("yearLunched" in pub).toBe(false);
  });
});

describe("createPublication, updatePublication, deletePublication", () => {
  it("maps launchYear -> yearLunched on POST /publications and normalizes the response", async () => {
    post.mockResolvedValue({ data: { success: true, data: { ...RAW_JAIR, id: 201 } } });

    const created = await createPublication({
      subCategoryId: 5,
      title: "New AI Journal",
      publisher: "ACM",
      publicationType: "Journal",
      openAccessType: "Full_Open_Access",
      workflow: "standard",
      launchYear: 2025,
    });

    expect(post).toHaveBeenCalledWith(
      "/publications",
      {
        subCategoryId: 5,
        title: "New AI Journal",
        publisher: "ACM",
        publicationType: "Journal",
        openAccessType: "Full_Open_Access",
        workflow: "standard",
        yearLunched: 2025,
      },
      { signal: undefined },
    );
    expect(created.id).toBe(201);
    expect(created.launchYear).toBe(1993);
  });

  it("maps launchYear -> yearLunched on PATCH /publications/:id", async () => {
    patch.mockResolvedValue({
      data: { success: true, data: { ...RAW_JAIR, yearLunched: 2026 } },
    });

    const updated = await updatePublication(1, { launchYear: 2026, acronym: "JAIR2" });
    expect(patch).toHaveBeenCalledWith(
      "/publications/1",
      { acronym: "JAIR2", yearLunched: 2026 },
      { signal: undefined },
    );
    expect(updated.launchYear).toBe(2026);
  });

  it("deletes via DELETE /publications/:id without depending on the response body", async () => {
    del.mockResolvedValue({ data: undefined });
    await expect(deletePublication(1)).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledWith("/publications/1", { signal: undefined });
  });
});

describe("getPublicationErrorKind", () => {
  it("classifies 400, 401, 403, 404, 409, 5xx, network(0), non-JSON errors, and unknown causes", () => {
    expect(getPublicationErrorKind(new ApiError(400, "Publication title is required"))).toBe(
      "validation",
    );
    expect(getPublicationErrorKind(new ApiError(401, "Access Denied. No session."))).toBe(
      "unauthorized",
    );
    expect(isPublicationUnauthorized(new ApiError(401, "No session"))).toBe(true);
    expect(getPublicationErrorKind(new ApiError(403, "Access Denied. Admins only."))).toBe(
      "forbidden",
    );
    expect(isPublicationForbidden(new ApiError(403, "Admins only"))).toBe(true);
    expect(getPublicationErrorKind(new ApiError(404, "Publication not found"))).toBe("not_found");
    expect(isPublicationNotFound(new ApiError(404, "Publication not found"))).toBe(true);
    expect(
      getPublicationErrorKind(new ApiError(409, "A publication with this issn already exists.")),
    ).toBe("conflict");
    expect(isPublicationConflict(new ApiError(409, "Duplicate issn"))).toBe(true);
    expect(getPublicationErrorKind(new ApiError(500, "Internal server error"))).toBe("server");
    expect(getPublicationErrorKind(new ApiError(502, "Request failed with status 502"))).toBe(
      "server",
    );
    expect(getPublicationErrorKind(new ApiError(0, "Could not reach the server."))).toBe(
      "network",
    );
    expect(getPublicationErrorKind(new Error("Unexpected"))).toBe("unknown");
  });
});
