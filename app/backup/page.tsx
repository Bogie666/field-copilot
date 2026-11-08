import type { Metadata } from "next";
import BackupPage from "../components/BackupPage";

export const metadata: Metadata = { title: "Backup and restore" };

export default function Page() {
  return <BackupPage />;
}
