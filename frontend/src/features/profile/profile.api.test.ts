import { beforeEach, describe, expect, it, vi } from "vitest";

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
  createMyProfile,
  deleteMyProfile,
  fetchMyProfile,
  normalizeProfile,
  updateMyProfile,
} from "./profile.api";
import {
  diffProfileChanges,
  profileToFormValues,
  validateProfileForm,
} from "./profile.schema";

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  del.mockReset();
});

const SAMPLE_PROFILE = {
  userId: "user-123",
  firstName: "Nadia",
  lastName: "El-Masry",
  gender: "female",
  country: "Egypt",
  governorate: "Cairo",
  university: "Cairo University",
  faculty: "Engineering",
  department: "Electronics",
  graduationYear: 2025,
  linkedinUrl: "https://linkedin.com/in/nadia",
  githubUrl: "https://github.com/nadia",
  scholarUrl: "https://scholar.google.com/citations?user=123",
  skills: ["VLSI", "Python"],
  experience: "Analog Design Intern",
};

describe("profile.api & profile.schema", () => {
  it("normalizes profile fields and strips unsafe URLs", () => {
    const normalized = normalizeProfile({
      ...SAMPLE_PROFILE,
      linkedinUrl: "javascript:alert(1)",
      githubUrl: "ftp://bad.example.com",
      skills: ["VLSI", "  VLSI ", "Python", ""],
    });
    expect(normalized.linkedinUrl).toBeNull();
    expect(normalized.githubUrl).toBeNull();
    expect(normalized.scholarUrl).toBe(
      "https://scholar.google.com/citations?user=123",
    );
    expect(normalized.skills).toEqual(["VLSI", "Python"]);
  });

  it("maps GET /profile 404 to null (no profile yet) and throws on 401/500", async () => {
    get.mockResolvedValueOnce({ data: { success: true, data: SAMPLE_PROFILE } });
    const loaded = await fetchMyProfile();
    expect(loaded?.firstName).toBe("Nadia");

    get.mockRejectedValueOnce(new ApiError(404, "Profile not found"));
    expect(await fetchMyProfile()).toBeNull();

    get.mockRejectedValueOnce(new ApiError(401, "Access Denied. No session."));
    await expect(fetchMyProfile()).rejects.toMatchObject({
      kind: "unauthorized",
    });
  });

  it("handles POST 201 & 409 Conflict, PATCH partial diff, and DELETE /profile/:id", async () => {
    post.mockResolvedValueOnce({ data: { success: true, data: SAMPLE_PROFILE } });
    const created = await createMyProfile({
      firstName: "Nadia",
      lastName: "El-Masry",
    });
    expect(created.userId).toBe("user-123");

    post.mockRejectedValueOnce(
      new ApiError(409, "Profile already exists. Use update instead."),
    );
    await expect(
      createMyProfile({ firstName: "Nadia", lastName: "El-Masry" }),
    ).rejects.toMatchObject({ kind: "conflict" });

    // Only changed fields are sent in PATCH
    const normalized = normalizeProfile(SAMPLE_PROFILE);
    const formValues = profileToFormValues(normalized);
    const diff = diffProfileChanges(normalized, {
      ...formValues,
      department: "Computer Engineering",
      skillsText: "VLSI, Python, SystemVerilog",
    });
    expect(diff).toEqual({
      department: "Computer Engineering",
      skills: ["VLSI", "Python", "SystemVerilog"],
    });

    patch.mockResolvedValueOnce({
      data: {
        success: true,
        data: { ...SAMPLE_PROFILE, ...diff },
      },
    });
    const updated = await updateMyProfile(diff);
    expect(patch).toHaveBeenCalledWith("/profile", diff);
    expect(updated.department).toBe("Computer Engineering");

    del.mockResolvedValueOnce({ data: { success: true } });
    await deleteMyProfile("user-123");
    expect(del).toHaveBeenCalledWith("/profile/user-123");
  });

  it("validates required names, graduation year bounds, and http(s) URLs", () => {
    const base = profileToFormValues(null);
    const invalid = validateProfileForm({
      ...base,
      firstName: "",
      lastName: "",
      graduationYear: "abcd",
      linkedinUrl: "javascript:alert(1)",
    });
    expect(invalid.success).toBe(false);
    expect(invalid.fieldErrors.firstName).toBeDefined();
    expect(invalid.fieldErrors.lastName).toBeDefined();
    expect(invalid.fieldErrors.graduationYear).toBeDefined();
    expect(invalid.fieldErrors.linkedinUrl).toBeDefined();

    const valid = validateProfileForm({
      ...base,
      firstName: "Nadia",
      lastName: "Mansour",
      graduationYear: "2026",
      linkedinUrl: "https://linkedin.com/in/nadia",
    });
    expect(valid.success).toBe(true);
  });
});
