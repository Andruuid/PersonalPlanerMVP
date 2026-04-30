import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function RootPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.role === "ADMIN") {
    redirect("/dashboard");
  }
  if (session.user.role === "EMPLOYEE") {
    redirect("/my-week");
  }
  redirect("/forbidden");
}
