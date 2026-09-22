<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Workspace-scoped analytics configuration. One row per workspace
 * (unique index on workspace_id) - the Analytics Settings page is the only
 * writer and AnalyticsController / future analytics jobs are the readers.
 */
class AnalyticsSetting extends Model
{
    use BelongsToWorkspace;

    protected $fillable = [
        'workspace_id',

        'analytics_enabled', 'timezone', 'default_period', 'week_starts_on_monday', 'currency', 'date_format',

        'track_sent_messages', 'track_received_messages', 'track_delivered_messages', 'track_read_messages',
        'track_failed_messages', 'track_deleted_messages', 'track_response_time', 'track_first_response_time',
        'track_message_volume', 'track_messages_by_agent', 'track_messages_by_account', 'track_messages_by_template',
        'include_automated_messages', 'include_system_events',

        'track_conversations', 'track_conversation_status_counts', 'track_conversation_duration',
        'track_resolution_time', 'track_assignment_time', 'track_sla_breaches',

        'track_contacts', 'track_contact_source', 'track_contact_tags', 'track_contact_activity',
        'track_contact_assignment', 'track_leads', 'track_lead_source', 'track_lead_stage_changes',
        'track_lead_status_changes', 'track_lead_assignment', 'track_won_leads', 'track_lost_leads',
        'track_lead_conversion',

        'track_agent_performance', 'track_agent_assigned_conversations', 'track_agent_conversations_handled',
        'track_agent_conversations_resolved', 'track_agent_first_response_time', 'track_agent_avg_response_time',
        'track_agent_resolution_time', 'track_agent_messages_sent', 'track_agent_messages_received',
        'track_agent_reopened_conversations', 'track_agent_sla_performance', 'track_agent_active_conversations',
        'agent_leaderboard_enabled', 'agent_visibility',

        'track_account_analytics', 'track_account_messages', 'track_account_conversations', 'track_account_contacts',
        'track_account_leads', 'track_account_delivery_rate', 'track_account_read_rate',
        'track_account_failed_messages', 'track_account_response_time', 'track_account_templates',
        'track_account_message_volume', 'aggregate_accounts',

        'track_template_analytics', 'track_template_usage', 'track_template_sent_count',
        'track_template_delivered_count', 'track_template_read_count', 'track_template_failed_count',
        'track_template_reply_count', 'track_template_by_account', 'track_template_by_agent',

        'conversation_start_rule', 'conversation_resolution_rule', 'bot_reply_counts_as_response',
        'include_imported_messages', 'deleted_messages_rule', 'count_internal_notes',

        'raw_event_retention_days', 'aggregate_retention_days',

        'allow_csv_export', 'allow_excel_export', 'allow_pdf_export', 'allow_personal_data_export',
        'max_export_range_days',

        // Reports-page prefs (JSON blob, cast to array - see reportPreferenceDefaults).
        'report_preferences',
    ];

    protected function casts(): array
    {
        $booleans = [
            'analytics_enabled', 'week_starts_on_monday',
            'track_sent_messages', 'track_received_messages', 'track_delivered_messages', 'track_read_messages',
            'track_failed_messages', 'track_deleted_messages', 'track_response_time', 'track_first_response_time',
            'track_message_volume', 'track_messages_by_agent', 'track_messages_by_account', 'track_messages_by_template',
            'include_automated_messages', 'include_system_events',
            'track_conversations', 'track_conversation_status_counts', 'track_conversation_duration',
            'track_resolution_time', 'track_assignment_time', 'track_sla_breaches',
            'track_contacts', 'track_contact_source', 'track_contact_tags', 'track_contact_activity',
            'track_contact_assignment', 'track_leads', 'track_lead_source', 'track_lead_stage_changes',
            'track_lead_status_changes', 'track_lead_assignment', 'track_won_leads', 'track_lost_leads',
            'track_lead_conversion',
            'track_agent_performance', 'track_agent_assigned_conversations', 'track_agent_conversations_handled',
            'track_agent_conversations_resolved', 'track_agent_first_response_time', 'track_agent_avg_response_time',
            'track_agent_resolution_time', 'track_agent_messages_sent', 'track_agent_messages_received',
            'track_agent_reopened_conversations', 'track_agent_sla_performance', 'track_agent_active_conversations',
            'agent_leaderboard_enabled',
            'track_account_analytics', 'track_account_messages', 'track_account_conversations', 'track_account_contacts',
            'track_account_leads', 'track_account_delivery_rate', 'track_account_read_rate',
            'track_account_failed_messages', 'track_account_response_time', 'track_account_templates',
            'track_account_message_volume', 'aggregate_accounts',
            'track_template_analytics', 'track_template_usage', 'track_template_sent_count',
            'track_template_delivered_count', 'track_template_read_count', 'track_template_failed_count',
            'track_template_reply_count', 'track_template_by_account', 'track_template_by_agent',
            'bot_reply_counts_as_response', 'include_imported_messages', 'count_internal_notes',
            'allow_csv_export', 'allow_excel_export', 'allow_pdf_export', 'allow_personal_data_export',
        ];

        return array_merge(
            array_combine($booleans, array_fill(0, count($booleans), 'boolean')),
            [
                'raw_event_retention_days' => 'integer',
                'aggregate_retention_days' => 'integer',
                'max_export_range_days' => 'integer',
                'report_preferences' => 'array',
            ]
        );
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    /**
     * Recommended defaults as a literal array (the canonical source used by
     * both the settings endpoint and reset). Keep in sync with the migration.
     *
     * @return array<string, mixed>
     */
    public static function recommendedDefaults(): array
    {
        return [
            'analytics_enabled' => true,
            'timezone' => 'Asia/Colombo',
            'default_period' => 'last_30_days',
            'week_starts_on_monday' => true,
            'currency' => 'LKR',
            'date_format' => 'DD/MM/YYYY',

            'track_sent_messages' => true,
            'track_received_messages' => true,
            'track_delivered_messages' => true,
            'track_read_messages' => true,
            'track_failed_messages' => true,
            'track_deleted_messages' => true,
            'track_response_time' => true,
            'track_first_response_time' => true,
            'track_message_volume' => true,
            'track_messages_by_agent' => true,
            'track_messages_by_account' => true,
            'track_messages_by_template' => true,
            'include_automated_messages' => true,
            'include_system_events' => false,

            'track_conversations' => true,
            'track_conversation_status_counts' => true,
            'track_conversation_duration' => true,
            'track_resolution_time' => true,
            'track_assignment_time' => true,
            'track_sla_breaches' => true,

            'track_contacts' => true,
            'track_contact_source' => true,
            'track_contact_tags' => true,
            'track_contact_activity' => true,
            'track_contact_assignment' => true,
            'track_leads' => true,
            'track_lead_source' => true,
            'track_lead_stage_changes' => true,
            'track_lead_status_changes' => true,
            'track_lead_assignment' => true,
            'track_won_leads' => true,
            'track_lost_leads' => true,
            'track_lead_conversion' => true,

            'track_agent_performance' => true,
            'track_agent_assigned_conversations' => true,
            'track_agent_conversations_handled' => true,
            'track_agent_conversations_resolved' => true,
            'track_agent_first_response_time' => true,
            'track_agent_avg_response_time' => true,
            'track_agent_resolution_time' => true,
            'track_agent_messages_sent' => true,
            'track_agent_messages_received' => true,
            'track_agent_reopened_conversations' => true,
            'track_agent_sla_performance' => true,
            'track_agent_active_conversations' => true,
            'agent_leaderboard_enabled' => false,
            'agent_visibility' => 'managers_plus_self',

            'track_account_analytics' => true,
            'track_account_messages' => true,
            'track_account_conversations' => true,
            'track_account_contacts' => true,
            'track_account_leads' => true,
            'track_account_delivery_rate' => true,
            'track_account_read_rate' => true,
            'track_account_failed_messages' => true,
            'track_account_response_time' => true,
            'track_account_templates' => true,
            'track_account_message_volume' => true,
            'aggregate_accounts' => true,

            'track_template_analytics' => true,
            'track_template_usage' => true,
            'track_template_sent_count' => true,
            'track_template_delivered_count' => true,
            'track_template_read_count' => true,
            'track_template_failed_count' => true,
            'track_template_reply_count' => true,
            'track_template_by_account' => true,
            'track_template_by_agent' => true,

            'conversation_start_rule' => 'either_direction',
            'conversation_resolution_rule' => 'either',
            'bot_reply_counts_as_response' => false,
            'include_imported_messages' => false,
            'deleted_messages_rule' => 'keep',
            'count_internal_notes' => false,

            'raw_event_retention_days' => 90,
            'aggregate_retention_days' => 365,

            'allow_csv_export' => true,
            'allow_excel_export' => true,
            'allow_pdf_export' => true,
            'allow_personal_data_export' => false,
            'max_export_range_days' => 365,
        ];
    }

    /**
     * Defaults for the Reports page preferences (report_preferences JSON column).
     * Kept separate from recommendedDefaults on purpose: recommendedDefaults() is also
     * the whitelist for the Analytics Settings page rules/validation, and these prefs
     * belong only to the Reports module (ReportSettingsController is their writer).
     *
     * @return array<string, mixed>
     */
    public static function reportPreferenceDefaults(): array
    {
        return [
            'include_weekends' => true,
            'allow_custom_periods' => true,
            'compare_previous' => true,
        ];
    }
}
