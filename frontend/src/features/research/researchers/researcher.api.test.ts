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
  buildResearcherParams,
  createResearcher,
  deleteResearcher,
  fetchResearcher,
  fetchResearcherFacets,
  fetchResearchers,
  fetchScholarProfile,
  getResearcherErrorKind,
  isNotFoundError,
  isUnauthorizedError,
  resolveScholarAuthorId,
  updateResearcher,
} from "./researcher.api";
import {
  COLLABORATORS,
  RESEARCHERS,
  makeResearcher,
  makeScholarAuthor,
} from "./researcher.test-fixtures";

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  del.mockReset();
});

describe("buildResearcherParams", () => {
  it("omits empty and whitespace-only values and trims populated filters", () => {
    expect(
      buildResearcherParams({
        page: 2,
        limit: 12,
        sortBy: "lastName",
        sortOrder: "desc",
        researcher: "  Hassan Ali  ",
        mainTopic: "  ",
        firstName: "  Hassan  ",
        lastName: "Ali",
        topics: ["VLSI & Hardware", "Robotics"],
        departments: [],
        institutionName: "VLSI & Hardware",
        department: "",
      }),
    ).toEqual({
      page: 2,
      limit: 12,
      sortBy: "lastName",
      sortOrder: "desc",
      researcher: "Hassan Ali",
      firstName: "Hassan",
      lastName: "Ali",
      topics: ["VLSI & Hardware", "Robotics"],
      institutionName: "VLSI & Hardware",
    });
  });
});

describe("fetchResearchers", () => {
  it("requests GET /researchers with page, limit and filters", async () => {
    const page = {
      success: true,
      data: [RESEARCHERS[0]],
      pagination: { total: 45, page: 2, limit: 12, totalPages: 4 },
    };
    get.mockResolvedValue({ data: page });

    const res = await fetchResearchers({
      page: 2,
      mainTopic: "VLSI & Hardware",
      researcher: "  Hassan  ",
    });

    expect(res.data).toEqual([RESEARCHERS[0]]);
    expect(res.pagination).toEqual({ total: 45, page: 2, limit: 12, totalPages: 4 });
    expect(get).toHaveBeenCalledWith("/researchers", {
      params: {
        page: 2,
        limit: 12,
        researcher: "Hassan",
        mainTopic: "VLSI & Hardware",
      },
      paramsSerializer: { indexes: null },
      signal: undefined,
    });
  });

  it("defensively normalizes missing or nullable fields", async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: [{ id: 9, firstName: "Ali", lastName: "Nour" }],
      },
    });

    const res = await fetchResearchers({ page: 1 });
    expect(res.data[0]).toEqual({
      id: 9,
      firstName: "Ali",
      lastName: "Nour",
      institutionName: null,
      department: null,
      affiliation: null,
      mainTopic: null,
      subtopics: null,
      scholarId: null,
      linkedinUrl: null,
      createdAt: "",
      updatedAt: "",
    });
    expect(res.pagination).toEqual({ total: 1, page: 1, limit: 12, totalPages: 1 });
  });

  it("propagates aborted requests without wrapping them", async () => {
    const cancelErr = new axios.CanceledError("aborted");
    get.mockRejectedValue(cancelErr);
    await expect(fetchResearchers({ page: 1 })).rejects.toBe(cancelErr);
  });
});

describe("fetchResearcherFacets", () => {
  it("requests options from the full catalog instead of sampling a page", async () => {
    const facets = {
      topics: ["NLP", "VLSI"],
      departments: ["Marine Biology", "School of Sciences"],
      universities: ["Alexandria University", "American University in Cairo"],
    };
    get.mockResolvedValue({ data: { success: true, data: facets } });

    await expect(fetchResearcherFacets()).resolves.toEqual(facets);
    expect(get).toHaveBeenCalledWith("/researchers/filters", { signal: undefined });
  });
});

describe("fetchResearcher", () => {
  it("unwraps the { data } envelope and URL-encodes the id", async () => {
    const researcher = makeResearcher({ id: 7 });
    get.mockResolvedValue({ data: { success: true, data: researcher } });

    await expect(fetchResearcher("7")).resolves.toEqual(researcher);
    expect(get).toHaveBeenCalledWith("/researchers/7", { signal: undefined });
  });
});

describe("write operations (POST / PATCH / DELETE)", () => {
  it("creates a researcher via POST /researchers", async () => {
    const created = makeResearcher({ id: 46, firstName: "Ziad", lastName: "Tarek" });
    post.mockResolvedValue({ data: { success: true, data: created } });

    await expect(
      createResearcher({ firstName: "Ziad", lastName: "Tarek", mainTopic: "Robotics" }),
    ).resolves.toEqual(created);
    expect(post).toHaveBeenCalledWith(
      "/researchers",
      { firstName: "Ziad", lastName: "Tarek", mainTopic: "Robotics" },
      { signal: undefined },
    );
  });

  it("updates a researcher via PATCH /researchers/:id", async () => {
    const updated = makeResearcher({ id: 7, mainTopic: "Photonics" });
    patch.mockResolvedValue({ data: { success: true, data: updated } });

    await expect(updateResearcher(7, { mainTopic: "Photonics" })).resolves.toEqual(updated);
    expect(patch).toHaveBeenCalledWith(
      "/researchers/7",
      { mainTopic: "Photonics" },
      { signal: undefined },
    );
  });

  it("deletes a researcher via DELETE /researchers/:id without depending on response body", async () => {
    del.mockResolvedValue({ data: undefined });
    await expect(deleteResearcher(7)).resolves.toBeUndefined();
    expect(del).toHaveBeenCalledWith("/researchers/7", { signal: undefined });
  });

  it("surfaces 401 unauthorized errors cleanly for write calls", async () => {
    const unauth = new ApiError(401, "Access Denied. No session.");
    post.mockRejectedValue(unauth);

    try {
      await createResearcher({ firstName: "A", lastName: "B" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(isUnauthorizedError(err)).toBe(true);
      expect(getResearcherErrorKind(err)).toBe("unauthorized");
      expect((err as Error).message).toBe("Access Denied. No session.");
    }
  });
});

describe("error classification", () => {
  it("distinguishes 401, 404, 400, network (0), 5xx, and unknown errors", () => {
    expect(getResearcherErrorKind(new ApiError(401, "No session"))).toBe("unauthorized");
    expect(isUnauthorizedError(new ApiError(401, "No session"))).toBe(true);
    expect(getResearcherErrorKind(new ApiError(404, "Not found"))).toBe("not_found");
    expect(isNotFoundError(new ApiError(404, "Not found"))).toBe(true);
    expect(getResearcherErrorKind(new ApiError(400, "Bad input"))).toBe("validation");
    expect(getResearcherErrorKind(new ApiError(0, "Network error"))).toBe("network");
    expect(getResearcherErrorKind(new ApiError(500, "Server boom"))).toBe("server");
    expect(getResearcherErrorKind(new Error("Other"))).toBe("unknown");
  });
});

describe("resolveScholarAuthorId", () => {
  it("uses a numeric scholarId as the Semantic Scholar id without searching", async () => {
    await expect(
      resolveScholarAuthorId(makeResearcher({ scholarId: " 145053999 " })),
    ).resolves.toBe("145053999");
    expect(get).not.toHaveBeenCalled();
  });

  it("searches by cleaned name otherwise and takes the top hit", async () => {
    get.mockResolvedValue({ data: { success: true, total: 1, authors: [{ authorId: "42" }] } });

    await expect(
      resolveScholarAuthorId(makeResearcher({ firstName: "Dr. Raghied", scholarId: "AbC" })),
    ).resolves.toBe("42");
    expect(get).toHaveBeenCalledWith("/search", {
      params: { query: "Raghied Atta", limit: 1 },
      signal: undefined,
    });
  });

  it("returns null when the search has no match", async () => {
    get.mockResolvedValue({ data: { success: true, total: 0, authors: [] } });
    await expect(resolveScholarAuthorId(makeResearcher())).resolves.toBeNull();
  });
});

describe("fetchScholarProfile", () => {
  it("posts the resolved id to /analyze and maps the result", async () => {
    post.mockResolvedValue({
      data: { author: makeScholarAuthor(), collaborators: COLLABORATORS },
    });
    const controller = new AbortController();

    const profile = await fetchScholarProfile(
      makeResearcher({ scholarId: "145053999" }),
      controller.signal,
    );

    expect(post).toHaveBeenCalledWith(
      "/analyze",
      { authorId: "145053999" },
      { signal: controller.signal },
    );
    expect(profile?.stats).toEqual({ hIndex: 9, publications: 37, citations: 321 });
    expect(profile?.coAuthors[0].name).toBe("G. Reed");
  });

  it("returns null without calling /analyze when no author matches", async () => {
    get.mockResolvedValue({ data: { success: true, total: 0, authors: [] } });
    await expect(fetchScholarProfile(makeResearcher())).resolves.toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});
