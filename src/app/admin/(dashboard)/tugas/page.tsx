import type { Metadata } from "next";
import { TugasManager } from "@/components/admin/tugas-manager";
import { listAssignments } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kelola Tugas — Admin X RPL 1",
};

export default async function AdminTugasPage() {
  const assignments = await listAssignments();
  return <TugasManager initialAssignments={assignments} />;
}
