import { z } from "zod";
import type {
  CreateProfileInput,
  ProfileFormValues,
  UpdateProfileInput,
  UserProfile,
} from "./profile.type";

export const GENDER_OPTIONS = [
  { value: "", label: "Prefer not to specify" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
] as const;

export const MIN_GRADUATION_YEAR = 1950;
export const MAX_GRADUATION_YEAR = 2040;

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

const optionalTrimmedText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`);

const optionalHttpUrl = (label: string) =>
  z
    .string()
    .trim()
    .max(500, `${label} must be 500 characters or fewer.`)
    .refine((val) => !val || isValidHttpUrl(val), {
      message: `${label} must start with http:// or https://.`,
    });

export const profileFormSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required.")
    .max(100, "First name must be 100 characters or fewer."),
  lastName: z
    .string()
    .trim()
    .min(1, "Last name is required.")
    .max(100, "Last name must be 100 characters or fewer."),
  gender: optionalTrimmedText(50, "Gender"),
  country: optionalTrimmedText(120, "Country"),
  governorate: optionalTrimmedText(120, "Governorate"),
  university: optionalTrimmedText(150, "University"),
  faculty: optionalTrimmedText(150, "Faculty"),
  department: optionalTrimmedText(150, "Department"),
  graduationYear: z
    .string()
    .trim()
    .refine(
      (val) => {
        if (!val) return true;
        if (!/^\d{4}$/.test(val)) return false;
        const n = Number(val);
        return n >= MIN_GRADUATION_YEAR && n <= MAX_GRADUATION_YEAR;
      },
      {
        message: `Graduation year must be a 4-digit year between ${MIN_GRADUATION_YEAR} and ${MAX_GRADUATION_YEAR}.`,
      },
    ),
  linkedinUrl: optionalHttpUrl("LinkedIn URL"),
  githubUrl: optionalHttpUrl("GitHub URL"),
  scholarUrl: optionalHttpUrl("Google Scholar URL"),
  skillsText: z
    .string()
    .max(1000, "Skills list is too long (max 1000 characters)."),
  experience: optionalTrimmedText(2000, "Experience"),
});

export function parseSkillsText(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const cleaned = part.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned.slice(0, 60));
    if (out.length >= 30) break;
  }
  return out;
}

export function splitFullName(fullName: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

export function profileToFormValues(
  profile?: UserProfile | null,
  fallbackName?: string | null,
): ProfileFormValues {
  if (!profile) {
    const { firstName, lastName } = splitFullName(fallbackName);
    return {
      firstName,
      lastName,
      gender: "",
      country: "",
      governorate: "",
      university: "",
      faculty: "",
      department: "",
      graduationYear: "",
      linkedinUrl: "",
      githubUrl: "",
      scholarUrl: "",
      skillsText: "",
      experience: "",
    };
  }
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    gender: profile.gender ?? "",
    country: profile.country ?? "",
    governorate: profile.governorate ?? "",
    university: profile.university ?? "",
    faculty: profile.faculty ?? "",
    department: profile.department ?? "",
    graduationYear:
      profile.graduationYear !== null ? String(profile.graduationYear) : "",
    linkedinUrl: profile.linkedinUrl ?? "",
    githubUrl: profile.githubUrl ?? "",
    scholarUrl: profile.scholarUrl ?? "",
    skillsText: profile.skills.join(", "),
    experience: profile.experience ?? "",
  };
}

export function formValuesToCreateInput(
  values: ProfileFormValues,
): CreateProfileInput {
  const nullable = (v: string): string | null => {
    const trimmed = v.trim();
    return trimmed ? trimmed : null;
  };
  const yearStr = values.graduationYear.trim();
  const graduationYear = yearStr ? Number(yearStr) : null;
  const skills = parseSkillsText(values.skillsText);

  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    gender: nullable(values.gender),
    country: nullable(values.country),
    governorate: nullable(values.governorate),
    university: nullable(values.university),
    faculty: nullable(values.faculty),
    department: nullable(values.department),
    graduationYear,
    linkedinUrl: nullable(values.linkedinUrl),
    githubUrl: nullable(values.githubUrl),
    scholarUrl: nullable(values.scholarUrl),
    skills,
    experience: nullable(values.experience),
  };
}

/** Computes a minimal partial payload containing ONLY fields changed relative to `original`. */
export function diffProfileChanges(
  original: UserProfile,
  values: ProfileFormValues,
): UpdateProfileInput {
  const next = formValuesToCreateInput(values);
  const diff: UpdateProfileInput = {};

  const scalarKeys = [
    "firstName",
    "lastName",
    "gender",
    "country",
    "governorate",
    "university",
    "faculty",
    "department",
    "linkedinUrl",
    "githubUrl",
    "scholarUrl",
    "experience",
  ] as const;

  for (const key of scalarKeys) {
    const prevVal = original[key] ?? null;
    const nextVal = next[key] ?? null;
    if (prevVal !== nextVal) {
      if (key === "firstName" || key === "lastName") {
        diff[key] = next[key];
      } else {
        diff[key] = nextVal;
      }
    }
  }

  if ((original.graduationYear ?? null) !== (next.graduationYear ?? null)) {
    diff.graduationYear = next.graduationYear;
  }

  const prevSkills = original.skills ?? [];
  const nextSkills = next.skills ?? [];
  const skillsChanged =
    prevSkills.length !== nextSkills.length ||
    prevSkills.some((item, idx) => item !== nextSkills[idx]);
  if (skillsChanged) {
    diff.skills = nextSkills;
  }

  return diff;
}

export function validateProfileForm(values: ProfileFormValues): {
  success: boolean;
  fieldErrors: Record<string, string>;
} {
  const parsed = profileFormSchema.safeParse(values);
  if (parsed.success) {
    return { success: true, fieldErrors: {} };
  }
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return { success: false, fieldErrors };
}
