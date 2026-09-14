import { redirect } from "next/navigation";

export default function LegacyProfileRoute() {
  redirect("/settings/profile");
}

