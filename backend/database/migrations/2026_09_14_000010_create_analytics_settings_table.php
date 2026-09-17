<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('analytics_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();

            // General
            $table->boolean('analytics_enabled')->default(true);
            $table->string('timezone', 100)->default('Asia/Colombo');
            $table->string('default_period', 20)->default('last_30_days'); // today|yesterday|last_7_days|last_30_days|last_90_days
            $table->boolean('week_starts_on_monday')->default(true);
            $table->string('currency', 8)->default('LKR');
            $table->string('date_format', 12)->default('DD/MM/YYYY'); // DD/MM/YYYY|MM/DD/YYYY|YYYY-MM-DD

            // Message tracking
            $table->boolean('track_sent_messages')->default(true);
            $table->boolean('track_received_messages')->default(true);
            $table->boolean('track_delivered_messages')->default(true);
            $table->boolean('track_read_messages')->default(true);
            $table->boolean('track_failed_messages')->default(true);
            $table->boolean('track_deleted_messages')->default(true);
            $table->boolean('track_response_time')->default(true);
            $table->boolean('track_first_response_time')->default(true);
            $table->boolean('track_message_volume')->default(true);
            $table->boolean('track_messages_by_agent')->default(true);
            $table->boolean('track_messages_by_account')->default(true);
            $table->boolean('track_messages_by_template')->default(true);
            $table->boolean('include_automated_messages')->default(true);
            $table->boolean('include_system_events')->default(false);

            // Conversation tracking
            $table->boolean('track_conversations')->default(true);
            $table->boolean('track_conversation_status_counts')->default(true);
            $table->boolean('track_conversation_duration')->default(true);
            $table->boolean('track_resolution_time')->default(true);
            $table->boolean('track_assignment_time')->default(true);
            $table->boolean('track_sla_breaches')->default(true);

            // Contact & lead tracking
            $table->boolean('track_contacts')->default(true);
            $table->boolean('track_contact_source')->default(true);
            $table->boolean('track_contact_tags')->default(true);
            $table->boolean('track_contact_activity')->default(true);
            $table->boolean('track_contact_assignment')->default(true);
            $table->boolean('track_leads')->default(true);
            $table->boolean('track_lead_source')->default(true);
            $table->boolean('track_lead_stage_changes')->default(true);
            $table->boolean('track_lead_status_changes')->default(true);
            $table->boolean('track_lead_assignment')->default(true);
            $table->boolean('track_won_leads')->default(true);
            $table->boolean('track_lost_leads')->default(true);
            $table->boolean('track_lead_conversion')->default(true);

            // Agent performance
            $table->boolean('track_agent_performance')->default(true);
            $table->boolean('track_agent_assigned_conversations')->default(true);
            $table->boolean('track_agent_conversations_handled')->default(true);
            $table->boolean('track_agent_conversations_resolved')->default(true);
            $table->boolean('track_agent_first_response_time')->default(true);
            $table->boolean('track_agent_avg_response_time')->default(true);
            $table->boolean('track_agent_resolution_time')->default(true);
            $table->boolean('track_agent_messages_sent')->default(true);
            $table->boolean('track_agent_messages_received')->default(true);
            $table->boolean('track_agent_reopened_conversations')->default(true);
            $table->boolean('track_agent_sla_performance')->default(true);
            $table->boolean('track_agent_active_conversations')->default(true);
            $table->boolean('agent_leaderboard_enabled')->default(false);
            $table->string('agent_visibility', 40)->default('managers_plus_self'); // super_admin|workspace_admins|managers|managers_plus_self|agent_self

            // WhatsApp account analytics
            $table->boolean('track_account_analytics')->default(true);
            $table->boolean('track_account_messages')->default(true);
            $table->boolean('track_account_conversations')->default(true);
            $table->boolean('track_account_contacts')->default(true);
            $table->boolean('track_account_leads')->default(true);
            $table->boolean('track_account_delivery_rate')->default(true);
            $table->boolean('track_account_read_rate')->default(true);
            $table->boolean('track_account_failed_messages')->default(true);
            $table->boolean('track_account_response_time')->default(true);
            $table->boolean('track_account_templates')->default(true);
            $table->boolean('track_account_message_volume')->default(true);
            $table->boolean('aggregate_accounts')->default(true);

            // Template analytics
            $table->boolean('track_template_analytics')->default(true);
            $table->boolean('track_template_usage')->default(true);
            $table->boolean('track_template_sent_count')->default(true);
            $table->boolean('track_template_delivered_count')->default(true);
            $table->boolean('track_template_read_count')->default(true);
            $table->boolean('track_template_failed_count')->default(true);
            $table->boolean('track_template_reply_count')->default(true);
            $table->boolean('track_template_by_account')->default(true);
            $table->boolean('track_template_by_agent')->default(true);

            // Tracking rules
            $table->string('conversation_start_rule', 40)->default('either_direction'); // first_incoming|first_outgoing|either_direction
            $table->string('conversation_resolution_rule', 40)->default('either'); // resolved|closed|either
            $table->boolean('bot_reply_counts_as_response')->default(false);
            $table->boolean('include_imported_messages')->default(false);
            $table->string('deleted_messages_rule', 20)->default('keep'); // keep|exclude
            $table->boolean('count_internal_notes')->default(false);

            // Retention
            $table->unsignedInteger('raw_event_retention_days')->default(90); // 30|90|180|365|730|0=unlimited
            $table->unsignedInteger('aggregate_retention_days')->default(365); // 90|365|730|1825|0=unlimited

            // Export
            $table->boolean('allow_csv_export')->default(true);
            $table->boolean('allow_excel_export')->default(true);
            $table->boolean('allow_pdf_export')->default(true);
            $table->boolean('allow_personal_data_export')->default(false);
            $table->unsignedInteger('max_export_range_days')->default(365); // 30|90|180|365|0=unlimited

            $table->timestamps();

            $table->unique('workspace_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('analytics_settings');
    }
};
