import type { Metadata } from "next";
import { PengaturanForm } from "@/components/admin/pengaturan-form";
import { getClassSettings } from "@/lib/repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pengaturan Kelas — Admin X RPL 1",
};

export default async function AdminPengaturanPage() {
  const settings = await getClassSettings();
  return <PengaturanForm initialSettings={settings} />;
}
