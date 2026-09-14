import { redirect } from "next/navigation";

export default function WorkspaceRootRedirectPage() {
  redirect("/settings/workspace/general");
}