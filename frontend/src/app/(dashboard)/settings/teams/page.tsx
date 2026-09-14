import { redirect } from "next/navigation";

export default function LegacyTeamsRedirectPage() {
  redirect("/settings/workspace/team");
}
