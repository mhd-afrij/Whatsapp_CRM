import { redirect } from "next/navigation";

export default function WorkspaceNotificationsRedirectPage() {
  // Notification preferences are PER-USER data (see backend
  // NotificationPreferenceController: isolation by user_id, never workspace)
  // and the API only ever touches the authenticated user's own rows, so the
  // canonical page is the ungated personal one at /settings/notifications.
  redirect("/settings/notifications");
}

