import { redirect } from "next/navigation";

export default function Home() {
  // Middleware handles auth; authenticated users land on the dashboard.
  redirect("/dashboard");
}
