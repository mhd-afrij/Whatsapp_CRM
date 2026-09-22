<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Deal;
use App\Models\Lead;
use App\Models\LeadStatus;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Models\ReportExport;
use App\Models\Task;
use App\Models\User;
use App\Models\WhatsappAccount;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

/**
 * Reports module v2 (Phase 15): unified overview endpoint, report preferences,
 * and tracked background exports. Covers permission gating, the claim+account
 * scoping rules, exact KPI fixtures, first-response semantics, weekend pruning
 * and the export lifecycle. Requires MySQL (phpunit.xml DB_DATABASE) + the Redis
 * queue stack to run - the CI/stack is provided by docker-compose.
 */
class ReportsModuleTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    private function insertMessage(Conversation $conversation, array $overrides = []): int
    {
        return DB::table('messages')->insertGetId(array_merge([
            'workspace_id' => $conversation->workspace_id,
            'conversation_id' => $conversation->id,
            'whatsapp_message_id' => 'WA_'.uniqid('', true),
            'direction' => 'inbound',
            'sender_type' => 'contact',
            'message_type' => 'text',
            'body' => 'hi',
            'status' => 'delivered',
            'sent_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));
    }

    // ── Permission enforcement ─────────────────────────────────────────────

    public function test_overview_requires_reports_view_permission(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');

        $anonymous = User::factory()->create(['workspace_id' => $manager->workspace_id]);
        $this->asUser($anonymous)->getJson('/api/v1/reports/overview')->assertForbidden();

        $this->asUser($manager)->getJson('/api/v1/reports/overview')->assertOk();
    }

    public function test_custom_range_requires_from_and_to(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');

        $this->asUser($manager)->getJson('/api/v1/reports/overview?range=custom')
            ->assertStatus(422);
    }

    // ── Agent-visibility claim ─────────────────────────────────────────────

    public function test_viewer_without_view_all_agents_only_sees_their_own_slice(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer');
        $manager = $this->userWithRole('Manager');
        $workspaceId = $viewer->workspace_id;

        Conversation::factory()->create(['workspace_id' => $workspaceId, 'assigned_user_id' => $viewer->id]);
        Conversation::factory()->create(['workspace_id' => $workspaceId, 'assigned_user_id' => $manager->id]);
        Conversation::factory()->create(['workspace_id' => $workspaceId, 'assigned_user_id' => null]);

        // Viewer: OWN claim forces the report onto themself, even with an explicit
        // foreign agent filter (never leaked).
        $data = $this->asUser($viewer)
            ->getJson('/api/v1/reports/overview?agent_user_id='.$manager->id)
            ->assertOk()->json('data');

        $this->assertSame('OWN', $data['claim']);
        $this->assertSame(1.0, $data['metrics']['conversations']['value']);

        // Manager: ALL claim sees the whole workspace.
        $data = $this->asUser($manager)
            ->getJson('/api/v1/reports/overview')
            ->assertOk()->json('data');

        $this->assertSame('ALL', $data['claim']);
        $this->assertSame(3.0, $data['metrics']['conversations']['value']);
    }

    // ── KPI correctness against fixed fixtures ─────────────────────────────

    public function test_kpi_and_deal_outcomes_match_seeded_fixtures(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $workspaceId = $manager->workspace_id;

        Conversation::factory()->count(2)->create(['workspace_id' => $workspaceId]);

        $pipeline = Pipeline::factory()->create(['workspace_id' => $workspaceId]);
        $stage = PipelineStage::factory()->create(['pipeline_id' => $pipeline->id]);
        Deal::factory()->create(['workspace_id' => $workspaceId, 'pipeline_id' => $pipeline->id, 'pipeline_stage_id' => $stage->id, 'status' => 'open', 'value_amount' => 1000]);
        Deal::factory()->create(['workspace_id' => $workspaceId, 'pipeline_id' => $pipeline->id, 'pipeline_stage_id' => $stage->id, 'status' => 'won', 'value_amount' => 500, 'closed_at' => now()->subDay()]);
        Deal::factory()->create(['workspace_id' => $workspaceId, 'pipeline_id' => $pipeline->id, 'pipeline_stage_id' => $stage->id, 'status' => 'lost', 'value_amount' => 200, 'closed_at' => now()->subDays(3)]);

        Task::factory()->create(['workspace_id' => $workspaceId, 'assignee_id' => $manager->id, 'status' => 'done', 'completed_at' => now()]);

        $data = $this->asUser($manager)->getJson('/api/v1/reports/overview')->assertOk()->json('data');

        $this->assertTrue($data['tracked']);
        $this->assertSame(2.0, $data['metrics']['conversations']['value']);
        $this->assertSame(1, $data['metrics']['won_count']['value']);
        $this->assertSame(1, $data['metrics']['lost_count']['value']);
        $this->assertEqualsWithDelta(500.0, $data['metrics']['won_value']['value'], 0.01);
        $this->assertEqualsWithDelta(200.0, $data['metrics']['lost_value']['value'], 0.01);
        $this->assertSame(50.0, $data['metrics']['win_rate']['value']);
        $this->assertSame(100.0, $data['metrics']['task_completion_rate']['value']);
        $this->assertNull($data['metrics']['avg_response_minutes']['value']);

        $outcomes = $data['deal_outcomes'];
        $this->assertSame(3, $outcomes['total']);
        $this->assertSame(1, $outcomes['won']['count']);
        $this->assertSame(1, $outcomes['lost']['count']);
        $this->assertSame(1, $outcomes['open']['count']);
        $this->assertSame(1000.0, $outcomes['open']['value']);
        $this->assertSame(50.0, $outcomes['won']['pct']);
        $this->assertSame(50.0, $outcomes['lost']['pct']);
        $this->assertSame(0.0, $outcomes['open']['pct']);
    }

    public function test_comparison_window_counts_previous_period_and_delta(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $workspaceId = $manager->workspace_id;

        // Current window (default 30d): 1 conversation today; previous window (the
        // preceding 30 days): 3 conversations seeded outside the current range.
        Conversation::factory()->create(['workspace_id' => $workspaceId, 'created_at' => now()]);
        foreach ([35, 40, 45] as $daysAgo) {
            Conversation::factory()->create(['workspace_id' => $workspaceId, 'created_at' => now()->subDays($daysAgo)]);
        }

        $data = $this->asUser($manager)->getJson('/api/v1/reports/overview')->assertOk()->json('data');

        $this->assertNotNull($data['comparison_period']);
        $this->assertSame(1.0, $data['metrics']['conversations']['value']);
        $this->assertSame(3.0, $data['metrics']['conversations']['previous']);
        $this->assertSame(-66.67, $data['metrics']['conversations']['change']);

        // compare=0 disables the previous window entirely.
        $data = $this->asUser($manager)->getJson('/api/v1/reports/overview?compare=0')->assertOk()->json('data');
        $this->assertNull($data['comparison_period']);
        $this->assertNull($data['metrics']['conversations']['previous']);
    }

    public function test_change_is_null_when_previous_period_was_empty(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        Conversation::factory()->create(['workspace_id' => $manager->workspace_id]);

        $data = $this->asUser($manager)->getJson('/api/v1/reports/overview')->assertOk()->json('data');

        $this->assertSame(1.0, $data['metrics']['conversations']['value']);
        $this->assertNull($data['metrics']['conversations']['previous']);
        $this->assertNull($data['metrics']['conversations']['change']);
    }

    // ── Response speed (first-response semantics) ──────────────────────────

    public function test_response_speed_counts_one_gap_per_conversation(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $workspaceId = $manager->workspace_id;

        $conversation = Conversation::factory()->create(['workspace_id' => $workspaceId, 'assigned_user_id' => $manager->id]);

        $start = now()->subHours(2);
        $this->insertMessage($conversation, ['direction' => 'inbound', 'sent_at' => $start]);
        $this->insertMessage($conversation, ['direction' => 'outbound', 'sender_type' => 'user', 'sent_at' => $start->copy()->addMinutes(10)]);
        $this->insertMessage($conversation, ['direction' => 'inbound', 'sent_at' => $start->copy()->addMinutes(20)]);
        $this->insertMessage($conversation, ['direction' => 'outbound', 'sender_type' => 'user', 'sent_at' => $start->copy()->addMinutes(30)]);

        $data = $this->asUser($manager)->getJson('/api/v1/reports/overview')->assertOk()->json('data');

        $speed = $data['response_speed'];
        $this->assertSame(10.0, $speed['avg_response_minutes']);
        $this->assertSame(10.0, $speed['fastest_response_minutes']);
        $this->assertSame(10.0, $speed['median_response_minutes']);
        $this->assertSame(1, $speed['sample_size']);
        $this->assertSame(0, $speed['no_reply_count']);

        $normal = collect($speed['buckets'])->firstWhere('key', 'normal');
        $this->assertSame(1, $normal['count']);
        $this->assertSame(100.0, $normal['percentage']);

        $this->assertSame(10.0, $data['metrics']['avg_response_minutes']['value']);
    }

    public function test_unanswered_inbound_conversation_counts_as_no_reply(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $conversation = Conversation::factory()->create(['workspace_id' => $manager->workspace_id]);
        $this->insertMessage($conversation, ['direction' => 'inbound', 'sent_at' => now()->subHour()]);

        $data = $this->asUser($manager)->getJson('/api/v1/reports/overview')->assertOk()->json('data');

        $this->assertSame(1, $data['response_speed']['no_reply_count']);
        $this->assertSame(0, $data['response_speed']['sample_size']);
        $this->assertNull($data['response_speed']['avg_response_minutes']);
    }

    // ── Account filter attribution ─────────────────────────────────────────

    public function test_account_filter_scopes_conversations_and_deals_via_contact_linkage(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $workspaceId = $manager->workspace_id;

        $accountA = WhatsappAccount::factory()->create(['workspace_id' => $workspaceId]);
        $accountB = WhatsappAccount::factory()->create(['workspace_id' => $workspaceId]);

        $contactA = Contact::factory()->create(['workspace_id' => $workspaceId]);
        $contactB = Contact::factory()->create(['workspace_id' => $workspaceId]);

        Conversation::factory()->create(['workspace_id' => $workspaceId, 'whatsapp_account_id' => $accountA->id, 'contact_id' => $contactA->id, 'assigned_user_id' => $manager->id]);
        Conversation::factory()->create(['workspace_id' => $workspaceId, 'whatsapp_account_id' => $accountB->id, 'contact_id' => $contactB->id, 'assigned_user_id' => $manager->id]);

        $pipeline = Pipeline::factory()->create(['workspace_id' => $workspaceId]);
        $stage = PipelineStage::factory()->create(['pipeline_id' => $pipeline->id]);
        Deal::factory()->create(['workspace_id' => $workspaceId, 'pipeline_id' => $pipeline->id, 'pipeline_stage_id' => $stage->id, 'contact_id' => $contactA->id, 'status' => 'won', 'value_amount' => 500, 'closed_at' => now()]);
        Deal::factory()->create(['workspace_id' => $workspaceId, 'pipeline_id' => $pipeline->id, 'pipeline_stage_id' => $stage->id, 'contact_id' => $contactB->id, 'status' => 'lost', 'value_amount' => 200, 'closed_at' => now()]);

        $data = $this->asUser($manager)
            ->getJson('/api/v1/reports/overview?whatsapp_account_id='.$accountA->id)
            ->assertOk()->json('data');

        $this->assertSame(1.0, $data['metrics']['conversations']['value']);
        $this->assertSame(1, $data['metrics']['won_count']['value']);
        $this->assertSame(0, $data['metrics']['lost_count']['value']);
    }

    // ── Lead + conversation analytics ──────────────────────────────────────

    public function test_lead_analytics_match_seeded_fixtures(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $workspaceId = $manager->workspace_id;

        LeadStatus::seedDefaults($workspaceId);

        // 2 qualified + 1 new lead created today; 1 lead converted today.
        Lead::factory()->count(2)->create(['workspace_id' => $workspaceId, 'stage' => 'qualified', 'owner_user_id' => $manager->id]);
        Lead::factory()->create(['workspace_id' => $workspaceId, 'stage' => 'new', 'owner_user_id' => $manager->id]);
        Lead::factory()->create(['workspace_id' => $workspaceId, 'stage' => 'converted', 'converted_at' => now(), 'owner_user_id' => $manager->id]);

        $data = $this->asUser($manager)->getJson('/api/v1/reports/overview')->assertOk()->json('data');

        $this->assertSame(4, $data['metrics']['leads_created']['value']);
        $this->assertSame(1, $data['metrics']['leads_converted']['value']);
        $this->assertSame(25.0, $data['metrics']['lead_conversion_rate']['value']);

        $this->assertSame(4, $data['leads']['total_created']);
        $this->assertSame(1, $data['leads']['converted']);
        $this->assertSame(4, $data['leads']['total_current']);

        $created = collect($data['leads']['created_by_status']);
        $this->assertSame(2, $created->firstWhere('slug', 'qualified')['count']);
        $this->assertSame(1, $created->firstWhere('slug', 'new')['count']);
        $this->assertSame(1, $created->firstWhere('slug', 'converted')['count']);

        $current = collect($data['leads']['current_by_status']);
        $this->assertSame(2, $current->firstWhere('slug', 'qualified')['count']);

        $lastDay = collect($data['trend'])->last();
        $this->assertSame(4, $lastDay['leads']);
        $this->assertSame(1, $lastDay['converted']);
    }

    public function test_conversation_analytics_counts_messages_by_direction_and_status(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $workspaceId = $manager->workspace_id;

        $open = Conversation::factory()->create(['workspace_id' => $workspaceId, 'status' => 'open']);
        $closed = Conversation::factory()->create(['workspace_id' => $workspaceId, 'status' => 'closed']);

        $this->insertMessage($open, ['direction' => 'inbound', 'sent_at' => now()->subMinutes(5)]);
        $this->insertMessage($open, ['direction' => 'outbound', 'sender_type' => 'user', 'sent_at' => now()->subMinutes(4)]);
        $this->insertMessage($open, ['direction' => 'inbound', 'sent_at' => now()->subMinutes(3)]);
        $this->insertMessage($closed, ['direction' => 'outbound', 'sender_type' => 'user', 'sent_at' => now()->subMinutes(2)]);

        $data = $this->asUser($manager)->getJson('/api/v1/reports/overview')->assertOk()->json('data');

        $analytics = $data['conversation_analytics'];
        $this->assertSame(2, $analytics['conversations_in_period']);
        $this->assertSame(2, $analytics['messages_received']);
        $this->assertSame(2, $analytics['messages_sent']);
        $this->assertSame(4, $analytics['total_messages']);
        $this->assertSame(1, collect($analytics['by_status'])->firstWhere('status', 'open')['count']);
        $this->assertSame(1, collect($analytics['by_status'])->firstWhere('status', 'closed')['count']);
    }

    // ── Report preferences / settings ──────────────────────────────────────

    public function test_settings_show_and_manage_permissions(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer');
        $admin = $this->userWithRole('Administrator');

        $this->asUser($viewer)
            ->getJson('/api/v1/reports/settings')
            ->assertOk()
            ->assertJsonPath('data.preferences.include_weekends', true)
            ->assertJsonPath('data.defaults.allow_custom_periods', true);

        // Viewer may read but not manage.
        $this->asUser($viewer)
            ->patchJson('/api/v1/reports/settings', ['include_weekends' => false])
            ->assertForbidden();
        $this->asUser($viewer)
            ->postJson('/api/v1/reports/settings/reset')
            ->assertForbidden();

        // Admin updates, then resets.
        $this->asUser($admin)
            ->patchJson('/api/v1/reports/settings', ['include_weekends' => false])
            ->assertOk()
            ->assertJsonPath('data.preferences.include_weekends', false);

        $this->assertDatabaseHas('audit_logs', ['action' => 'reports.settings.updated']);

        $this->asUser($admin)
            ->postJson('/api/v1/reports/settings/reset')
            ->assertOk()
            ->assertJsonPath('data.preferences.include_weekends', true);

        $this->assertDatabaseHas('audit_logs', ['action' => 'reports.settings.reset']);
    }

    public function test_include_weekends_false_prunes_saturday_and_sunday_from_daily_rows(): void
    {
        $this->seedRbac();
        // reports.manage_settings is Administrator-only, so the preference is updated
        // by an admin while a Manager exercises the overview read path.
        $admin = $this->userWithRole('Administrator');
        $manager = $this->userWithRole('Manager');
        $workspaceId = $manager->workspace_id;

        Conversation::factory()->create(['workspace_id' => $workspaceId]);

        $this->asUser($admin)
            ->patchJson('/api/v1/reports/settings', ['include_weekends' => false])
            ->assertOk();

        $from = now()->subDays(13)->toDateString();
        $to = now()->toDateString();

        $data = $this->asUser($manager)
            ->getJson('/api/v1/reports/overview?range=custom&from='.$from.'&to='.$to)
            ->assertOk()->json('data');

        $weekdayCount = 0;
        foreach (Carbon::parse($from)->toPeriod($to) as $day) {
            if (! in_array($day->dayOfWeek, [Carbon::SATURDAY, Carbon::SUNDAY], true)) {
                $weekdayCount++;
            }
        }

        $this->assertSame($weekdayCount, $data['daily_breakdown']['total']);
        $weekend = collect($data['daily_breakdown']['data'])->contains(fn ($row) => in_array(Carbon::parse($row['date'])->dayOfWeek, [Carbon::SATURDAY, Carbon::SUNDAY], true));
        $this->assertFalse($weekend);
    }

    // ── v2 export lifecycle ────────────────────────────────────────────────

    public function test_exports_create_download_list_and_retry_are_user_scoped(): void
    {
        Storage::fake('local');
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $otherManager = $this->userWithRole('Manager');
        $viewer = $this->userWithRole('Viewer');
        Conversation::factory()->create(['workspace_id' => $manager->workspace_id]);

        // Viewer lacks reports.export.
        $this->asUser($viewer)->postJson('/api/v1/reports/exports', [
            'type' => 'daily_metrics',
        ])->assertForbidden();

        // Queue a daily_metrics export (QUEUE_CONNECTION=sync -> runs inline).
        $this->asUser($manager)->postJson('/api/v1/reports/exports', [
            'type' => 'daily_metrics',
            'from' => now()->subDays(6)->toDateString(),
            'to' => now()->toDateString(),
        ])->assertStatus(202)->assertJsonPath('data.status', 'queued');

        $export = ReportExport::query()->where('user_id', $manager->id)->firstOrFail();
        $this->assertSame(ReportExport::STATUS_READY, $export->status);
        $this->assertNotNull($export->file_path);
        $this->assertNotNull($export->completed_at);
        $this->assertSame('text/csv', $export->mime_type);

        // Listed in the user's own collection.
        $this->asUser($manager)->getJson('/api/v1/reports/exports')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        // Downloadable with a real CSV payload.
        $download = $this->asUser($manager)->get("/api/v1/reports/exports/{$export->id}/download");
        $download->assertOk();
        $this->assertStringContainsString('text/csv', $download->headers->get('Content-Type'));
        $this->assertStringContainsString('Date', $download->getContent());
        $this->assertStringContainsString('New conversations', $download->getContent());

        // Another user cannot download or retry it.
        $this->asUser($otherManager)->get("/api/v1/reports/exports/{$export->id}/download")->assertNotFound();
        $this->asUser($otherManager)->postJson("/api/v1/reports/exports/{$export->id}/retry")->assertNotFound();

        // Retry re-queues and re-generates back to ready+completed.
        $completedAt = $export->completed_at;
        $this->asUser($manager)->postJson("/api/v1/reports/exports/{$export->id}/retry")->assertOk();

        $export->refresh();
        $this->assertSame(ReportExport::STATUS_READY, $export->status);
        $this->assertTrue($export->completed_at->gte($completedAt));
    }
}
