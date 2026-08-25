<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\NotificationPreference;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * Per-user (never per-workspace) preference toggles for every notification trigger type
 * NotificationService knows about. `notification_preferences` has no workspace_id column
 * (see the Phase 10 migration) - isolation is by `user_id` alone, which is correct since a
 * preference is a personal setting, not shared workspace configuration.
 */
class NotificationPreferenceController extends Controller
{
    use ApiResponse;

    /** Every trigger type NotificationService::notify() is called with across the app. */
    private const KNOWN_TYPES = [
        'conversation.assigned',
        'conversation.new_message',
        'task.assigned',
        'task.reminder',
        'task.overdue',
        'task.comment_mention',
        'note.mention',
        'whatsapp.connection.failed',
        'whatsapp.connection.reauth_required',
    ];

    /**
     * GET /api/v1/notification-preferences
     * Returns one row per known type, defaulting unset types to
     * in_app_enabled=true/email_enabled=false (the migration's column defaults) rather
     * than only returning rows the user happens to have already saved - the settings page
     * needs a toggle to render for every type, not just the ones a row exists for.
     */
    public function index(Request $request)
    {
        $existing = NotificationPreference::query()
            ->where('user_id', $request->user()->id)
            ->get()
            ->keyBy('notification_type');

        $rows = collect(self::KNOWN_TYPES)->map(function (string $type) use ($existing) {
            $pref = $existing->get($type);

            return [
                'notification_type' => $type,
                'in_app_enabled' => $pref ? $pref->in_app_enabled : true,
                'email_enabled' => $pref ? $pref->email_enabled : false,
            ];
        })->values();

        return $this->success($rows, 'OK');
    }

    /**
     * PATCH /api/v1/notification-preferences
     * Body: { notification_type, in_app_enabled?, email_enabled? }. Upserts (a user may
     * never have saved a preference for this type before).
     */
    public function update(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'notification_type' => ['required', 'string', 'in:'.implode(',', self::KNOWN_TYPES)],
            'in_app_enabled' => ['sometimes', 'boolean'],
            'email_enabled' => ['sometimes', 'boolean'],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();

        $preference = NotificationPreference::query()->updateOrCreate(
            ['user_id' => $request->user()->id, 'notification_type' => $data['notification_type']],
            array_intersect_key($data, array_flip(['in_app_enabled', 'email_enabled']))
        );

        return $this->success($preference, 'Notification preference updated');
    }
}
