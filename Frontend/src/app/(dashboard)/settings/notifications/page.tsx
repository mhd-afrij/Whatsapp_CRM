"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  NOTIFICATION_TYPE_LABELS,
  fetchNotificationPreferences,
  updateNotificationPreference,
  type NotificationPreferenceRow,
} from "@/lib/notifications-api";

const PREFERENCES_KEY = ["notification-preferences"] as const;

function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-primary" : "bg-border"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-4.5" : "translate-x-1"
        }`}
        style={{ transform: checked ? "translateX(18px)" : "translateX(2px)" }}
      />
    </button>
  );
}

function PreferenceRow({ pref }: { pref: NotificationPreferenceRow }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: updateNotificationPreference,
    onMutate: async (values) => {
      await queryClient.cancelQueries({ queryKey: PREFERENCES_KEY });
      const previous = queryClient.getQueryData<NotificationPreferenceRow[]>(PREFERENCES_KEY);
      queryClient.setQueryData<NotificationPreferenceRow[] | undefined>(PREFERENCES_KEY, (current) =>
        current?.map((row) =>
          row.notification_type === values.notification_type ? { ...row, ...values } : row
        )
      );
      return { previous };
    },
    onError: (_err, _values, context) => {
      if (context?.previous) {
        queryClient.setQueryData(PREFERENCES_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PREFERENCES_KEY });
    },
  });

  return (
    <li className="flex items-center justify-between gap-4 rounded-md border border-border bg-bg px-4 py-3">
      <span className="text-sm font-medium text-text">
        {NOTIFICATION_TYPE_LABELS[pref.notification_type] ?? pref.notification_type}
      </span>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-xs text-muted">
          In-app
          <Toggle
            label={`In-app notifications for ${pref.notification_type}`}
            checked={pref.in_app_enabled}
            disabled={mutation.isPending}
            onChange={(value) =>
              mutation.mutate({ notification_type: pref.notification_type, in_app_enabled: value })
            }
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          Email
          <Toggle
            label={`Email notifications for ${pref.notification_type}`}
            checked={pref.email_enabled}
            disabled={mutation.isPending}
            onChange={(value) =>
              mutation.mutate({ notification_type: pref.notification_type, email_enabled: value })
            }
          />
        </label>
      </div>
    </li>
  );
}

export default function NotificationSettingsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: PREFERENCES_KEY,
    queryFn: fetchNotificationPreferences,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text">Notification preferences</h1>
        <p className="mt-1 text-sm text-muted">
          Choose which events notify you in-app (the notification bell) and by email. These
          preferences are personal — they only affect notifications sent to you.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        {isLoading && <p className="text-sm text-muted">Loading…</p>}
        {isError && <p className="text-sm text-danger">Unable to load notification preferences.</p>}
        {!isLoading && !isError && data && (
          <ul className="space-y-2">
            {data.map((pref) => (
              <PreferenceRow key={pref.notification_type} pref={pref} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
