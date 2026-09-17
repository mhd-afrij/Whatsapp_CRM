<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\NotificationPreference;
use App\Models\NotificationSetting;
use App\Support\NotificationTypes;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

use function is_array;

/**
 * Full notification preferences API: per-trigger toggles plus the caller's
 * global delivery settings. Personal (user-scoped) settings only - never
 * gated on a workspace permission, matching /notification-preferences.
 */
class NotificationSettingsController extends Controller
{
    private const GLOBAL_DEFAULTS = [
        'email_enabled' => true,
        'email_digest' => 'immediately', // immediately|hourly|daily|never
        'digest_time' => '09:00',
        'quiet_hours' => [
            'enabled' => false,
            'start' => '22:00',
            'end' => '08:00',
            'timezone' => 'Asia/Colombo',
            'allow_critical' => false,
        ],
        'in_app_sound' => true,
        'browser_notifications' => true,
        'show_unread_badge' => true,
        'auto_mark_read' => true,
    ];

    public function index(Request $request)
    {
        $rows = $this->preferenceRows($request);
        $global = $this->mergeGlobal(self::GLOBAL_DEFAULTS, $this->userSettings($request));

        return $this->success([
            'preferences' => $rows,
            'global' => $global,
        ]);
    }

    /**
     * PATCH /settings/notifications
     * Body shape (any subset):
     *   { "global": { "email_digest": "daily", "quiet_hours": {...}, ... },
     *     "preferences": [{ "notificationType": "task.reminder", "inApp": true, "email": false }, ...] }
     */
    public function update(Request $request)
    {
        $payload = $request->all();
        $changes = [];

        if (array_key_exists('preferences', $payload)) {
            $rows = is_array($payload['preferences']) ? $payload['preferences'] : [];
            foreach ($rows as $row) {
                $this->savePreferenceRow($request, $row);
            }
            $changes['preferences'] = true;
        }

        if (array_key_exists('global', $payload) && is_array($payload['global'])) {
            $this->saveGlobal($request, $payload['global']);
            $changes['global'] = true;
        }

        if ($changes === []) {
            return $this->error('No settings provided.');
        }

        return $this->success([
            'preferences' => $this->preferenceRows($request),
            'global' => $this->mergeGlobal(self::GLOBAL_DEFAULTS, $this->userSettings($request)),
        ], 'Notification settings updated.');
    }

    /**
     * PATCH /settings/notifications/{notificationType}
     * Body: { "inApp": true, "email": false } (snake_case aliases accepted).
     */
    public function updateOne(Request $request, string $notificationType)
    {
        if (! in_array($notificationType, NotificationTypes::KNOWN_TYPES, true)) {
            return $this->error('Unknown notification type.');
        }

        $payload = $request->all();

        $inApp = $payload['in_app_enabled'] ?? $payload['inApp'] ?? null;
        $email = $payload['email_enabled'] ?? $payload['email'] ?? null;

        $validator = Validator::make(
            [
                'in_app_enabled' => $inApp,
                'email_enabled' => $email,
            ],
            [
                'in_app_enabled' => ['sometimes', 'boolean'],
                'email_enabled' => ['sometimes', 'boolean'],
            ]
        );

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();

        $preference = NotificationPreference::query()->updateOrCreate(
            ['user_id' => $request->user()->id, 'notification_type' => $notificationType],
            $data
        );

        return $this->success($preference, 'Notification preference updated.');
    }

    private function preferenceRows(Request $request): array
    {
        $existing = NotificationPreference::query()
            ->where('user_id', $request->user()->id)
            ->get()
            ->keyBy('notification_type');

        return collect(NotificationTypes::KNOWN_TYPES)->map(function (string $type) use ($existing) {
            $pref = $existing->get($type);

            return [
                'notification_type' => $type,
                'in_app_enabled' => $pref ? $pref->in_app_enabled : true,
                'email_enabled' => $pref ? $pref->email_enabled : false,
            ];
        })->values()->all();
    }

    private function savePreferenceRow(Request $request, mixed $row): void
    {
        if (! is_array($row)) {
            return;
        }

        $type = $row['notification_type'] ?? $row['notificationType'] ?? null;
        if (! is_string($type) || ! in_array($type, NotificationTypes::KNOWN_TYPES, true)) {
            return;
        }

        $inApp = $row['in_app_enabled'] ?? $row['inApp'] ?? null;
        $email = $row['email_enabled'] ?? $row['email'] ?? null;

        $data = array_filter(
            [
                'in_app_enabled' => $inApp === null ? null : filter_var($inApp, FILTER_VALIDATE_BOOLEAN),
                'email_enabled' => $email === null ? null : filter_var($email, FILTER_VALIDATE_BOOLEAN),
            ],
            fn ($v) => $v !== null
        );

        if ($data === []) {
            return;
        }

        NotificationPreference::query()->updateOrCreate(
            ['user_id' => $request->user()->id, 'notification_type' => $type],
            $data
        );
    }

    private function saveGlobal(Request $request, array $global): void
    {
        $validator = Validator::make($global, [
            'email_enabled' => ['sometimes', 'boolean'],
            'email_digest' => ['sometimes', 'string', 'in:immediately,hourly,daily,never'],
            'digest_time' => ['sometimes', 'string', 'date_format:H:i'],
            'quiet_hours' => ['sometimes', 'array'],
            'quiet_hours.enabled' => ['sometimes', 'boolean'],
            'quiet_hours.start' => ['sometimes', 'string', 'date_format:H:i'],
            'quiet_hours.end' => ['sometimes', 'string', 'date_format:H:i'],
            'quiet_hours.timezone' => ['sometimes', 'string', 'max:100'],
            'quiet_hours.allow_critical' => ['sometimes', 'boolean'],
            'in_app_sound' => ['sometimes', 'boolean'],
            'browser_notifications' => ['sometimes', 'boolean'],
            'show_unread_badge' => ['sometimes', 'boolean'],
            'auto_mark_read' => ['sometimes', 'boolean'],
        ]);

        if ($validator->fails()) {
            return;
        }

        // Coerce booleans (form toggles send "0"/"1"/"on").
        $data = array_map(function ($value) {
            if (is_bool($value) || $value === null) {
                return $value;
            }

            return is_string($value) && in_array($value, ['true', 'false', '1', '0', 'on', 'off', ''], true)
                ? filter_var($value, FILTER_VALIDATE_BOOLEAN)
                : $value;
        }, $validator->validated());

        NotificationSetting::query()->updateOrCreate(
            ['user_id' => $request->user()->id],
            $data
        );
    }

    private function mergeGlobal(array $defaults, ?NotificationSetting $model): array
    {
        $fromModel = $model ? $model->only(array_keys($defaults)) : [];

        return $this->merge($defaults, $fromModel);
    }

    private function merge(array $defaults, array $incoming): array
    {
        $merged = [];

        foreach ($defaults as $key => $defaultValue) {
            if (! array_key_exists($key, $incoming)) {
                $merged[$key] = $defaultValue;

                continue;
            }

            $value = $incoming[$key];

            if ($value === null) {
                $merged[$key] = $defaultValue;
            } elseif (is_bool($defaultValue)) {
                $merged[$key] = filter_var($value, FILTER_VALIDATE_BOOLEAN);
            } elseif (is_array($defaultValue)) {
                $merged[$key] = is_array($value) ? $this->merge($defaultValue, $value) : $defaultValue;
            } else {
                $merged[$key] = $value;
            }
        }

        return $merged;
    }

    private function userSettings(Request $request): ?NotificationSetting
    {
        return NotificationSetting::query()->where('user_id', $request->user()->id)->first();
    }
}