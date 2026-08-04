<?php

namespace Tests\Feature;

use App\Jobs\GenerateReportExportJob;
use App\Models\Conversation;
use App\Models\Deal;
use App\Models\Lead;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Models\Task;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class DashboardAnalyticsTest extends TestCase
{
    use RefreshDatabase, CreatesWorkspaceUsers;

    protected function setUp(): void
    {
        parent::setUp();

        Http::fake([
            '*/internal/whatsapp/events/emit' => Http::response(['success' => true, 'message' => 'OK', 'data' => null], 200),
        ]);
    }

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

    // ---- Permission enforcement ----

    public function test_dashboard_summary_requires_dashboard_view_workspace_permission(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent'); // does not hold dashboard.view_workspace

        $this->asUser($agent)->getJson('/api/v1/dashboard/summary')->assertForbidden();

        $manager = $this->userWithRole('Manager');
        $this->asUser($manager)->getJson('/api/v1/dashboard/summary')->assertOk();
    }

    public function test_analytics_endpoints_require_analytics_view_permission(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');
        $viewer = $this->userWithRole('Viewer');

        $this->asUser($agent)->getJson('/api/v1/analytics/conversation-volume')->assertForbidden();
        $this->asUser($viewer)->getJson('/api/v1/analytics/conversation-volume')->assertOk();
    }

    public function test_report_export_requires_analytics_export_permission(): void
    {
        $this->seedRbac();
        $viewer = $this->userWithRole('Viewer'); // has analytics.view but not analytics.export
        $manager = $this->userWithRole('Manager');

        $this->asUser($viewer)->postJson('/api/v1/reports/export', ['type' => 'contacts'])->assertForbidden();
        Bus::fake();
        $this->asUser($manager)->postJson('/api/v1/reports/export', ['type' => 'contacts'])
            ->assertStatus(202);
        Bus::assertDispatched(GenerateReportExportJob::class);
    }

    // ---- Summary correctness against known fixture data ----

    public function test_summary_numbers_are_exact_against_seeded_fixtures(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $agent = $this->userWithRole('Agent');
        $workspaceId = $manager->workspace_id;

        // Conversations: 2 open (1 assigned to agent, 1 unassigned), 1 closed within range.
        Conversation::factory()->create(['workspace_id' => $workspaceId, 'status' => 'open', 'assigned_user_id' => $agent->id]);
        Conversation::factory()->create(['workspace_id' => $workspaceId, 'status' => 'open', 'assigned_user_id' => null]);
        Conversation::factory()->create(['workspace_id' => $workspaceId, 'status' => 'closed', 'closed_at' => now()->subDay()]);

        // Leads: 3 new, 1 converted.
        Lead::factory()->create(['workspace_id' => $workspaceId, 'status' => 'new']);
        Lead::factory()->create(['workspace_id' => $workspaceId, 'status' => 'contacted']);
        Lead::factory()->create(['workspace_id' => $workspaceId, 'status' => 'converted']);

        // Deals: 1 open (value 1000), 1 won in range (value 500), 1 lost in range.
        $pipeline = Pipeline::factory()->create(['workspace_id' => $workspaceId]);
        $stage = PipelineStage::factory()->create(['pipeline_id' => $pipeline->id]);
        Deal::factory()->create(['workspace_id' => $workspaceId, 'pipeline_id' => $pipeline->id, 'pipeline_stage_id' => $stage->id, 'status' => 'open', 'value_amount' => 1000]);
        Deal::factory()->create(['workspace_id' => $workspaceId, 'pipeline_id' => $pipeline->id, 'pipeline_stage_id' => $stage->id, 'status' => 'won', 'value_amount' => 500, 'closed_at' => now()->subDay()]);
        Deal::factory()->create(['workspace_id' => $workspaceId, 'pipeline_id' => $pipeline->id, 'pipeline_stage_id' => $stage->id, 'status' => 'lost', 'value_amount' => 200, 'closed_at' => now()->subDay()]);

        // Tasks: 1 overdue open, 1 completed (not overdue).
        Task::factory()->create(['workspace_id' => $workspaceId, 'assignee_id' => $agent->id, 'status' => 'open', 'due_at' => now()->subDay()]);
        Task::factory()->create(['workspace_id' => $workspaceId, 'assignee_id' => $agent->id, 'status' => 'done', 'due_at' => now()->addDay(), 'completed_at' => now()]);

        $response = $this->asUser($manager)->getJson('/api/v1/dashboard/summary')->assertOk();

        $data = $response->json('data');

        $this->assertSame(3, $data['conversations']['new']);
        $this->assertSame(2, $data['conversations']['open']);
        $this->assertSame(1, $data['conversations']['closed']);
        $this->assertSame(1, $data['conversations']['unassigned']);

        $this->assertSame(3, $data['leads']['new']);
        $this->assertSame(1, $data['leads']['converted']);
        $this->assertEqualsWithDelta(33.33, $data['leads']['conversion_rate_percent'], 0.01);

        $this->assertEqualsWithDelta(1000.0, $data['deals']['pipeline_value'], 0.01);
        $this->assertEqualsWithDelta(500.0, $data['deals']['won_value'], 0.01);
        $this->assertSame(1, $data['deals']['lost_count']);

        $this->assertSame(1, $data['tasks']['overdue']);

        $agentWorkload = collect($data['agent_workload'])->firstWhere('user_id', $agent->id);
        $this->assertSame(1, $agentWorkload['open_conversations']);
        $this->assertSame(1, $agentWorkload['open_tasks']);
    }

    public function test_response_time_averages_computed_from_real_message_timestamps(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $workspaceId = $manager->workspace_id;

        $conversation = Conversation::factory()->create(['workspace_id' => $workspaceId]);

        $start = now()->subHours(2);
        $this->insertMessage($conversation, ['direction' => 'inbound', 'sent_at' => $start]);
        $this->insertMessage($conversation, ['direction' => 'outbound', 'sender_type' => 'user', 'sent_at' => $start->copy()->addMinutes(10)]);
        $this->insertMessage($conversation, ['direction' => 'inbound', 'sent_at' => $start->copy()->addMinutes(20)]);
        $this->insertMessage($conversation, ['direction' => 'outbound', 'sender_type' => 'user', 'sent_at' => $start->copy()->addMinutes(30)]);

        $data = $this->asUser($manager)->getJson('/api/v1/dashboard/summary')->assertOk()->json('data');

        // First response gap = 10 minutes; average of both gaps (10 and 10) = 10 minutes.
        $this->assertEqualsWithDelta(10.0, $data['response_time']['avg_first_response_minutes'], 0.01);
        $this->assertEqualsWithDelta(10.0, $data['response_time']['avg_response_minutes'], 0.01);
        $this->assertSame(2, $data['response_time']['sample_size']);
    }

    // ---- Filter correctness ----

    public function test_date_range_filter_narrows_conversation_volume(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $workspaceId = $manager->workspace_id;

        Conversation::factory()->create(['workspace_id' => $workspaceId, 'created_at' => now()->subDays(40)]);
        Conversation::factory()->create(['workspace_id' => $workspaceId, 'created_at' => now()]);

        $data = $this->asUser($manager)
            ->getJson('/api/v1/analytics/conversation-volume?from='.now()->subDays(2)->toDateString().'&to='.now()->toDateString())
            ->assertOk()->json('data');

        $total = array_sum(array_column($data, 'count'));
        $this->assertSame(1, $total);
    }

    public function test_agent_filter_narrows_agent_performance(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $agentA = $this->userWithRole('Agent');
        $agentB = $this->userWithRole('Agent');
        $workspaceId = $manager->workspace_id;

        Task::factory()->create([
            'workspace_id' => $workspaceId, 'assignee_id' => $agentA->id, 'status' => 'done', 'completed_at' => now(),
        ]);
        Task::factory()->create([
            'workspace_id' => $workspaceId, 'assignee_id' => $agentB->id, 'status' => 'done', 'completed_at' => now(),
        ]);

        $data = $this->asUser($manager)
            ->getJson('/api/v1/analytics/agent-performance?agent_user_id='.$agentA->id)
            ->assertOk()->json('data');

        $this->assertCount(1, $data);
        $this->assertSame($agentA->id, $data[0]['user_id']);
        $this->assertSame(1, $data[0]['tasks_completed']);
    }

    // ---- Export job + notification ----

    public function test_export_job_produces_a_file_and_a_notification(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        \App\Models\Contact::factory()->create(['workspace_id' => $manager->workspace_id]);

        $this->asUser($manager)->postJson('/api/v1/reports/export', ['type' => 'contacts'])
            ->assertStatus(202);

        // QUEUE_CONNECTION=sync in tests (phpunit.xml), so the job already ran synchronously.
        $this->assertDatabaseHas('notifications', [
            'user_id' => $manager->id,
            'type' => 'report.export_ready',
        ]);

        $notification = \App\Models\Notification::query()->where('type', 'report.export_ready')->firstOrFail();
        $this->assertTrue(\Illuminate\Support\Facades\Storage::disk('local')->exists($notification->data['file']));

        $this->asUser($manager)
            ->get("/api/v1/reports/export/{$notification->id}/download")
            ->assertOk();
    }
}
