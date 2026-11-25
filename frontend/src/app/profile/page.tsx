import type { Metadata } from "next";
import ProfilePageClient from "@/src/features/profile/components/ProfilePageClient";

export const metadata: Metadata = {
  title: "Profile | NEXUS",
  description: "Manage your Scholar NEXUS academic and professional profile.",
};

export default function ProfilePage() {
  return (
    <main className="min-h-screen bg-background px-6 pt-32 pb-20 sm:px-10 lg:px-26">
      <ProfilePageClient />
    </main>
  );
}
