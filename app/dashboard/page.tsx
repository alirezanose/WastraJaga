import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import DashboardClient from "./DashboardClient";

export const metadata = {
  title: "Dashboard Pecalang — WastraJaga",
  description: "Pusat kendali dan verifikasi kelayakan busana adat pura secara real-time.",
};

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/dashboard");
  }

  return (
    <DashboardClient
      user={{
        id: session.user.id,
        name: session.user.name || "Petugas Pecalang",
        email: session.user.email || "",
        role: session.user.role || "officer",
        templeId: session.user.templeId,
      }}
    />
  );
}
