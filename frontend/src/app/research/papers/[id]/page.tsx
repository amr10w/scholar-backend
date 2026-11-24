import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Paper details | NEXUS" };

export default async function PaperPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const similar = sp?.similar === "1" ? "&similar=1" : "";
  redirect(`/research?tab=papers&paper=${encodeURIComponent(id)}${similar}`);
}
