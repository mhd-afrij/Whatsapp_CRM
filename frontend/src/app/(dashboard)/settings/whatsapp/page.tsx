import { redirect } from "next/navigation";

export default function LegacyWhatsappRedirectPage() {
  redirect("/settings/workspace/whatsapp");
}
