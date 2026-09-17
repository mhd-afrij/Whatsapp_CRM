<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\WorkspaceSetting;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    private const CONTACT_DEFAULTS = [
        'identification' => [
            'name_format' => 'first_last',
            'default_country_code' => '+1',
            'primary_identifier' => 'phone',
            'require_phone' => true,
            'require_email' => false,
            'require_name' => false,
        ],
        'whatsapp_creation' => [
            'auto_create' => true,
            'update_from_profile' => true,
            'save_profile_name' => true,
            'save_number' => true,
        ],
        'ownership' => [
            'default_owner_user_id' => null,
            'default_team_id' => null,
            'allow_unassigned' => true,
        ],
        'data_management' => [
            'allow_csv_import' => true,
            'allow_export' => true,
            'allow_archive' => true,
            'restrict_permanent_delete' => true,
        ],
        'lifecycle' => [
            'statuses' => [
                ['key' => 'new', 'label' => 'New', 'color' => '#0ea5e9', 'enabled' => true, 'is_default' => true],
                ['key' => 'prospect', 'label' => 'Prospect', 'color' => '#6366f1', 'enabled' => true, 'is_default' => false],
                ['key' => 'lead', 'label' => 'Lead', 'color' => '#f59e0b', 'enabled' => true, 'is_default' => false],
                ['key' => 'customer', 'label' => 'Customer', 'color' => '#22c55e', 'enabled' => true, 'is_default' => false],
                ['key' => 'vip', 'label' => 'VIP', 'color' => '#a855f7', 'enabled' => true, 'is_default' => false],
                ['key' => 'inactive', 'label' => 'Inactive', 'color' => '#64748b', 'enabled' => true, 'is_default' => false],
                ['key' => 'lost', 'label' => 'Lost', 'color' => '#ef4444', 'enabled' => true, 'is_default' => false],
            ],
        ],
        'duplicates' => [
            'match_phone' => true,
            'match_email' => true,
            'match_whatsapp_id' => true,
            'strategy' => 'warn_only',
        ],
    ];

    private const INBOX_DEFAULTS = [
        'general' => [
            'default_priority' => 'normal',
            'show_customer_profile' => true,
            'enable_internal_notes' => true,
            'allow_file_attachments' => true,
            'allow_reassignment' => true,
            'allow_closing' => true,
            'auto_reopen_on_reply' => true,
            'show_typing_status' => true,
            'read_receipts' => false,
        ],
        'routing' => [
            'enabled' => true,
            'strategy' => 'round_robin',
            'team_id' => null,
            'max_active_per_agent' => 25,
            'when_limit_reached' => 'next_available',
            'fallback' => 'round_robin',
            'fallback_team_id' => null,
            'fallback_user_id' => null,
        ],
        'sla' => [
            'enabled' => false,
            'first_response_minutes' => 5,
            'resolution_hours' => 24,
            'priorities' => [
                'low' => 60,
                'normal' => 30,
                'high' => 10,
                'urgent' => 5,
            ],
            'pause_outside_hours' => true,
            'pause_waiting_customer' => true,
            'notify_before_minutes' => 15,
            'alert_assigned_agent' => true,
            'alert_team_manager' => true,
            'alert_admin' => false,
        ],
        'working_hours' => [
            'timezone' => 'Asia/Colombo',
            'days' => [
                'monday' => ['enabled' => true, 'periods' => [['start' => '09:00', 'end' => '18:00']]],
                'tuesday' => ['enabled' => true, 'periods' => [['start' => '09:00', 'end' => '18:00']]],
                'wednesday' => ['enabled' => true, 'periods' => [['start' => '09:00', 'end' => '18:00']]],
                'thursday' => ['enabled' => true, 'periods' => [['start' => '09:00', 'end' => '18:00']]],
                'friday' => ['enabled' => true, 'periods' => [['start' => '09:00', 'end' => '18:00']]],
                'saturday' => ['enabled' => false, 'periods' => []],
                'sunday' => ['enabled' => false, 'periods' => []],
            ],
            'holidays' => [],
            'after_hours' => 'queue',
            'auto_reply_message' => 'Thanks for contacting us. Our team will get back to you during business hours.',
        ],
    ];

    public function contactSettings(Request $request)
    {
        $settings = $this->workspaceSettings($request);
        $value = $this->mergeSettings(self::CONTACT_DEFAULTS, $settings->contact_settings);

        return $this->success([
            'settings' => $value,
            'defaults' => self::CONTACT_DEFAULTS,
        ]);
    }

    public function updateContactSettings(Request $request)
    {
        $request->validate([
            'identification' => 'sometimes|array',
            'identification.name_format' => 'sometimes|string|in:first_last,last_first,single',
            'identification.primary_identifier' => 'sometimes|string|in:phone,email,whatsapp_id',
            'whatsapp_creation' => 'sometimes|array',
            'ownership' => 'sometimes|array',
            'ownership.default_owner_user_id' => 'sometimes|nullable|integer|exists:users,id',
            'data_management' => 'sometimes|array',
            'lifecycle' => 'sometimes|array',
            'lifecycle.statuses' => 'sometimes|array',
            'lifecycle.statuses.*.key' => 'sometimes|string|max:50',
            'lifecycle.statuses.*.label' => 'sometimes|string|max:100',
            'lifecycle.statuses.*.color' => 'sometimes|string|max:20',
            'duplicates' => 'sometimes|array',
            'duplicates.strategy' => 'sometimes|string|in:warn_only,prevent_creation,auto_merge',
        ]);

        $merged = $this->mergeSettings(self::CONTACT_DEFAULTS, $request->all());
        $settings = $this->workspaceSettings($request);
        $settings->contact_settings = $merged;
        $settings->save();

        return $this->success(['settings' => $merged], 'Contact settings saved.');
    }

    public function inboxSettings(Request $request)
    {
        $settings = $this->workspaceSettings($request);
        $value = $this->mergeSettings(self::INBOX_DEFAULTS, $settings->inbox_settings);

        return $this->success([
            'settings' => $value,
            'defaults' => self::INBOX_DEFAULTS,
        ]);
    }

    public function updateInboxSettings(Request $request)
    {
        $request->validate([
            'general' => 'sometimes|array',
            'general.default_priority' => 'sometimes|string|in:low,normal,high,urgent',
            'routing' => 'sometimes|array',
            'routing.strategy' => 'sometimes|string|in:round_robin,least_loaded,ticket_rotation',
            'routing.fallback' => 'sometimes|string|in:round_robin,least_loaded,team_leader',
            'sla' => 'sometimes|array',
            'sla.priorities' => 'sometimes|array',
            'working_hours' => 'sometimes|array',
            'working_hours.days' => 'sometimes|array',
        ]);

        $merged = $this->mergeSettings(self::INBOX_DEFAULTS, $request->all());
        $settings = $this->workspaceSettings($request);
        $settings->inbox_settings = $merged;
        $settings->save();

        return $this->success(['settings' => $merged], 'Inbox settings saved.');
    }

    /**
     * Recursively merge an incoming payload over defaults. Booleans are coerced
     * (form toggles arrive as "1"/"0"/"on"), arrays recurse, everything else is
     * taken as-is. Unknown keys are dropped so clients cannot inject junk.
     */
    private function mergeSettings(array $defaults, ?array $incoming): array
    {
        $merged = [];

        foreach ($defaults as $key => $defaultValue) {
            if (! is_array($incoming) || ! array_key_exists($key, $incoming)) {
                $merged[$key] = $defaultValue;

                continue;
            }

            $value = $incoming[$key];

            if (is_bool($defaultValue)) {
                $merged[$key] = $value === null ? $defaultValue : filter_var($value, FILTER_VALIDATE_BOOLEAN);
            } elseif (is_array($defaultValue)) {
                // List arrays (e.g. lifecycle statuses) should replace wholesale so
                // adding/removing items survives; associative arrays deep-merge.
                $merged[$key] = is_array($value)
                    ? (array_is_list($defaultValue)
                        ? $value
                        : $this->mergeSettings($defaultValue, $value))
                    : $defaultValue;
            } else {
                $merged[$key] = $value;
            }
        }

        return $merged;
    }

    private function workspaceSettings(Request $request): WorkspaceSetting
    {
        return WorkspaceSetting::firstOrCreate(
            ['workspace_id' => $request->user()->workspace_id],
            ['workspace_id' => $request->user()->workspace_id],
        );
    }
}