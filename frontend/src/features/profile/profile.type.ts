export interface UserProfile {
  userId: string;
  firstName: string;
  lastName: string;
  gender: string | null;
  country: string | null;
  governorate: string | null;
  university: string | null;
  faculty: string | null;
  department: string | null;
  graduationYear: number | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  scholarUrl: string | null;
  skills: string[];
  experience: string | null;
}

export interface CreateProfileInput {
  firstName: string;
  lastName: string;
  gender?: string | null;
  country?: string | null;
  governorate?: string | null;
  university?: string | null;
  faculty?: string | null;
  department?: string | null;
  graduationYear?: number | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  scholarUrl?: string | null;
  skills?: string[];
  experience?: string | null;
}

export type UpdateProfileInput = Partial<CreateProfileInput>;

export interface ProfileFormValues {
  firstName: string;
  lastName: string;
  gender: string;
  country: string;
  governorate: string;
  university: string;
  faculty: string;
  department: string;
  graduationYear: string;
  linkedinUrl: string;
  githubUrl: string;
  scholarUrl: string;
  skillsText: string;
  experience: string;
}

export type ProfileErrorKind =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "rate_limited"
  | "network"
  | "server"
  | "unknown";
