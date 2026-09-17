<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LeadSource;
use App\Models\LeadStatus;
use App\Models\WorkspaceSetting;
use Illuminate\Http\Request;

class LeadSettingsController extends Controller
{
    private const GENERAL_DEFAULTS = [
        'default_status_id' => null,
        'default_priority' => 'normal',
        'default_owner_type' => 'none',
        'default_owner_id' => null,
        'auto_create_from_whatsapp_contact' => true,
        'auto_create_from_conversation' => true,
        'prevent_duplicate_active_leads' => true,
        'duplicate_fields' => ['contact' => true, 'phone' => true, 'email' => false],
        'require_owner' => false,
        'require_source' => false,
        'allow_manual_creation' => true,
        'allow_deletion' => false,
    ];

    private const ASSIGNMENT_DEFAULTS = [
        'enabled' => true,
        'strategy' => 'round_robin',
        'user_ids' => [],
        'team_id' => null,
        'skip_offline' => true,
        'skip_on_leave' => false,
        'period' => 'today',
        'team_strategy' => 'round_robin',
        'max_per_user' => 50,
        'when_limit_reached' => 'next_available',
    ];

    private const SCORING_DEFAULTS = [
        'enabled' => true,
        'ranges' => [
            ['name' => 'Cold', 'min' => 0, 'max' => 29, 'color' => '#64748b'],
            ['name' => 'Warm', 'min' => 30, 'max' => 59, 'color' => '#f59e0b'],
            ['name' => 'Hot', 'min' => 60, 'max' => 79, 'color' => '#ef4444'],
            ['name' => 'Very Hot', 'min' => 80, 'max' => 100, 'color' => '#22c55e'],
        ],
    ];

    private const CONVERSION_DEFAULTS = [
        'enabled' => true,
        'create' => ['relationship' => true, 'deal' => true, 'task' => false, 'follow_up' => false],
        'create_deal_automatically' => true,
        'default_pipeline_id' => null,
        'default_stage_id' => null,
        'deal_title_template' => '{{contact_name}} - {{lead_source}}',
        'deal_value' => 'estimated',
        'fixed_value' => null,
        'converted_status_id' => null,
        'copy' => [
            'owner' => true, 'source' => true, 'notes' => true,
            'tags' => true, 'estimated_value' => true, 'custom_fields' => true,
        ],
        'after_conversion' => 'keep',
    ];

    private const DEFAULTS = [
        'general' => self::GENERAL_DEFAULTS,
        'assignment' => self::ASSIGNMENT_DEFAULTS,
        'scoring' => self::SCORING_DEFAULTS,
        'conversion' => self::CONVERSION_DEFAULTS,
    ];

    public function show(Request $request)
    {
        LeadStatus::seedDefaults($request->user()->workspace_id);
        LeadSource::seedDefaults($request->user()->workspace_id);

        $settings = $this->workspaceSettings($request);
        $value = $this->mergeSettings(self::DEFAULTS, $settings->lead_sales_settings);

        if ($value['general']['default_status_id'] === null) {
            $default = LeadStatus::query()
                ->where('workspace_id', $request->user()->workspace_id)
                ->where('is_default', true)
                ->orderBy('sort_order')
                ->first()
                ?? LeadStatus::query()->where('workspace_id', $request->user()->workspace_id)->orderBy('sort_order')->first();
            if ($default) {
                $value['general']['default_status_id'] = $default->id;
            }
        }

        return $this->success([
            'settings' => $value,
            'defaults' => self::DEFAULTS,
        ]);
    }

    public function update(Request $request)
    {
        $this->validateAll($request);
        $settings = $this->workspaceSettings($request);
        $current = $this->mergeSettings(self::DEFAULTS, $settings->lead_sales_settings);
        $merged = $this->mergeSettings($current, $request->all());

        $settings->lead_sales_settings = $merged;
        $settings->save();

        return $this->success(['settings' => $merged], 'Lead settings saved.');
    }

    public function updateAssignment(Request $request)
    {
        return $this->updateSection($request, 'assignment');
    }

    public function updateScoring(Request $request)
    {
        return $this->updateSection($request, 'scoring');
    }

    public function updateConversion(Request $request)
    {
        return $this->updateSection($request, 'conversion');
    }

    private function updateSection(Request $request, string $section)
    {
        $sectionRules = match ($section) {
            'assignment' => $this->assignmentRules(),
            'scoring' => $this->scoringRules(),
            'conversion' => $this->conversionRules(),
            default => [],
        };
        $validated = $request->validate($sectionRules);

        $settings = $this->workspaceSettings($request);
        $current = $this->mergeSettings(self::DEFAULTS, $settings->lead_sales_settings);
        $current[$section] = $this->mergeSettings($current[$section] ?? self::DEFAULTS[$section], $validated);

        $settings->lead_sales_settings = $current;
        $settings->save();

        return $this->success(['settings' => $current], ucfirst($section).' settings saved.');
    }

    private function validateAll(Request $request): void
    {
        $request->validate(array_merge(
            $this->generalRules(),
            $this->assignmentRules(),
            $this->scoringRules(),
            $this->conversionRules(),
        ));
    }

    private function generalRules(): array
    {
        return [
            'general' => 'sometimes|array',
            'general.default_status_id' => 'sometimes|nullable|integer|exists:lead_statuses,id',
            'general.default_priority' => 'sometimes|string|in:low,normal,high,urgent',
            'general.default_owner_type' => 'sometimes|string|in:none,current_user,user,team',
            'general.default_owner_id' => 'sometimes|nullable|integer',
            'general.auto_create_from_whatsapp_contact' => 'sometimes|boolean',
            'general.auto_create_from_conversation' => 'sometimes|boolean',
            'general.prevent_duplicate_active_leads' => 'sometimes|boolean',
            'general.duplicate_fields' => 'sometimes|array',
            'general.require_owner' => 'sometimes|boolean',
            'general.require_source' => 'sometimes|boolean',
            'general.allow_manual_creation' => 'sometimes|boolean',
            'general.allow_deletion' => 'sometimes|boolean',
        ];
    }

    private function assignmentRules(): array
    {
        return [
            'assignment' => 'sometimes|array',
            'assignment.enabled' => 'sometimes|boolean',
            'assignment.strategy' => 'sometimes|string|in:round_robin,least_assigned,least_active,random,user,team',
            'assignment.user_ids' => 'sometimes|array',
            'assignment.user_ids.*' => 'sometimes|integer',
            'assignment.team_id' => 'sometimes|nullable|integer',
            'assignment.skip_offline' => 'sometimes|boolean',
            'assignment.skip_on_leave' => 'sometimes|boolean',
            'assignment.period' => 'sometimes|string|in:today,week,month',
            'assignment.team_strategy' => 'sometimes|string|in:round_robin,least_assigned',
            'assignment.max_per_user' => 'sometimes|integer|min:0|max:10000',
            'assignment.when_limit_reached' => 'sometimes|string|in:unassigned,next_available,anyway',
        ];
    }

    private function scoringRules(): array
    {
        return [
            'scoring' => 'sometimes|array',
            'scoring.enabled' => 'sometimes|boolean',
            'scoring.ranges' => 'sometimes|array|min:0',
            'scoring.ranges.*' => 'sometimes|array',
            'scoring.ranges.*.name' => 'required_with:scoring.ranges|string|max:60',
            'scoring.ranges.*.min' => 'required_with:scoring.ranges|integer|between:0,100',
            'scoring.ranges.*.max' => 'required_with:scoring.ranges|integer|between:0,100',
            'scoring.ranges.*.color' => 'sometimes|string|max:20',
        ];
    }

    private function conversionRules(): array
    {
        return [
            'conversion' => 'sometimes|array',
            'conversion.enabled' => 'sometimes|boolean',
            'conversion.create' => 'sometimes|array',
            'conversion.create_deal_automatically' => 'sometimes|boolean',
            'conversion.default_pipeline_id' => 'sometimes|nullable|integer|exists:pipelines,id',
            'conversion.default_stage_id' => 'sometimes|nullable|integer|exists:pipeline_stages,id',
            'conversion.deal_title_template' => 'sometimes|string|max:150',
            'conversion.deal_value' => 'sometimes|string|in:estimated,blank,fixed',
            'conversion.fixed_value' => 'sometimes|nullable|numeric|min:0',
            'conversion.converted_status_id' => 'sometimes|nullable|integer|exists:lead_statuses,id',
            'conversion.copy' => 'sometimes|array',
            'conversion.after_conversion' => 'sometimes|string|in:keep,archive,hide',
        ];
    }

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