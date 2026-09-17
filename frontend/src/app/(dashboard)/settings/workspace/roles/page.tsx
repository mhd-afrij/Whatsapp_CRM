import { redirect } from "next/navigation";

export default function WorkspaceRolesRedirectPage() {
  redirect("/settings/roles");
}