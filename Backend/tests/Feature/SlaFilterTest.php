<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Deal;
use App\Models\Lead;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Models\SlaConfig;
use App\Models\SlaEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class SlaFilterTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    private function insertMessage(Conversation $conversation, array $overrides = []): int
    {
        return DB::table('messages')->insertGetId(array_merge([
            'workspace_id' => $conversation->workspace_id,
            'conversation_id' => $conversation->id,
            'whatsapp_message_id' => 'WA_'.uniqid(),
            'direction' => 'inbound',
            'sender_type' => 'contact',
            'message_type' => 'text',
            'body' => 'hello',
            'status' => 'delivered',
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));
    }

    private function makeConversations(string $role): array
    {
        $this->seedRbac();
        $agent = $this->userWithRole($role);

        // Assign every conversation to the agent: the inbox `visibleTo` scope
        // only surfaces conversations assigned to the user (or their team)
        // unless the user holds conversations.view_all.
        $atRisk = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);
        $breached = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);
        $onTrack = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);
        $noSla = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);

        $config = SlaConfig::create([
            'workspace_id' => $agent->workspace_id,
            'name' => 'Default',
            'first_response_minutes' => 60,
            'followup_response_minutes' => 240,
            'is_active' => true,
        ]);

        // at_risk: active timer whose deadline is ~4 minutes away.
        SlaEvent::create([
            'workspace_id' => $agent->workspace_id,
            'conversation_id' => $atRisk->id,
            'sla_config_id' => $config->id,
            'type' => 'first_response',
            'status' => 'pending',
            'started_at' => now()->subMinutes(56),
            'deadline_at' => now()->addMinutes(4),
        ]);

        // breached: active timer whose deadline has passed.
        SlaEvent::create([
            'workspace_id' => $agent->workspace_id,
            'conversation_id' => $breached->id,
            'sla_config_id' => $config->id,
            'type' => 'first_response',
            'status' => 'pending',
            'started_at' => now()->subHours(2),
            'deadline_at' => now()->subHour(),
        ]);

        // on-track: active timer far from the deadline - matches neither tab.
        SlaEvent::create([
            'workspace_id' => $agent->workspace_id,
            'conversation_id' => $onTrack->id,
            'sla_config_id' => $config->id,
            'type' => 'first_response',
            'status' => 'pending',
            'started_at' => now()->subMinutes(5),
            'deadline_at' => now()->addMinutes(55),
        ]);

        return ['agent' => $agent, 'ids' => [
            'at_risk' => $atRisk->id,
            'breached' => $breached->id,
            'on_track' => $onTrack->id,
            'no_sla' => $noSla->id,
        ]];
    }

    public function test_sla_risk_filter_returns_only_soon_to_breach_conversations(): void
    {
        $ctx = $this->makeConversations('Agent');

        $response = $this->asUser($ctx['agent'])->getJson('/api/v1/conversations?sla_status=risk')->assertOk();

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertContains($ctx['ids']['at_risk'], $ids);
        $this->assertNotContains($ctx['ids']['breached'], $ids);
        $this->assertNotContains($ctx['ids']['on_track'], $ids);
        $this->assertNotContains($ctx['ids']['no_sla'], $ids);
    }

    public function test_sla_breached_filter_returns_only_breached_conversations(): void
    {
        $ctx = $this->makeConversations('Agent');

        $response = $this->asUser($ctx['agent'])->getJson('/api/v1/conversations?sla_status=breached')->assertOk();

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertContains($ctx['ids']['breached'], $ids);
        $this->assertNotContains($ctx['ids']['at_risk'], $ids);
        $this->assertNotContains($ctx['ids']['on_track'], $ids);
        $this->assertNotContains($ctx['ids']['no_sla'], $ids);
    }

    public function test_lead_status_filter_returns_only_matching_contact_leads(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $qualifiedContact = Contact::factory()->create(['workspace_id' => $agent->workspace_id]);
        $otherContact = Contact::factory()->create(['workspace_id' => $agent->workspace_id]);

        $qualifiedConversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'contact_id' => $qualifiedContact->id,
            'assigned_user_id' => $agent->id,
        ]);
        $otherConversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'contact_id' => $otherContact->id,
            'assigned_user_id' => $agent->id,
        ]);

        Lead::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'contact_id' => $qualifiedContact->id,
            'stage' => 'qualified',
        ]);
        Lead::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'contact_id' => $otherContact->id,
            'stage' => 'new',
        ]);

        $response = $this->asUser($agent)->getJson('/api/v1/conversations?lead_status=qualified')->assertOk();

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertContains($qualifiedConversation->id, $ids);
        $this->assertNotContains($otherConversation->id, $ids);
    }

    public function test_deal_stage_filter_returns_only_matching_deals(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $wonContact = Contact::factory()->create(['workspace_id' => $agent->workspace_id]);
        $otherContact = Contact::factory()->create(['workspace_id' => $agent->workspace_id]);

        $wonConversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'contact_id' => $wonContact->id,
            'assigned_user_id' => $agent->id,
        ]);
        $otherConversation = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'contact_id' => $otherContact->id,
            'assigned_user_id' => $agent->id,
        ]);

        $pipeline = Pipeline::factory()->create(['workspace_id' => $agent->workspace_id]);
        $wonStage = PipelineStage::factory()->create([
            'pipeline_id' => $pipeline->id,
            'name' => 'Won',
            'is_won_stage' => true,
        ]);
        $newStage = PipelineStage::factory()->create([
            'pipeline_id' => $pipeline->id,
            'name' => 'New',
        ]);

        Deal::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'contact_id' => $wonContact->id,
            'pipeline_id' => $pipeline->id,
            'pipeline_stage_id' => $wonStage->id,
        ]);
        Deal::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'contact_id' => $otherContact->id,
            'pipeline_id' => $pipeline->id,
            'pipeline_stage_id' => $newStage->id,
        ]);

        $response = $this->asUser($agent)->getJson('/api/v1/conversations?deal_stage=Won')->assertOk();

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertContains($wonConversation->id, $ids);
        $this->assertNotContains($otherConversation->id, $ids);
    }

    public function test_date_range_filter_narrows_by_last_message_at(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $recent = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
            'last_message_at' => now(),
        ]);
        $old = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
            'last_message_at' => now()->subDays(30),
        ]);

        $from = now()->subDays(1)->format('Y-m-d');
        $to = now()->addDay()->format('Y-m-d');

        $response = $this->asUser($agent)->getJson("/api/v1/conversations?date_from={$from}&date_to={$to}")->assertOk();

        $ids = collect($response->json('data'))->pluck('id')->all();
        $this->assertContains($recent->id, $ids);
        $this->assertNotContains($old->id, $ids);
    }

    public function test_date_range_rejects_inverted_bounds(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $from = now()->addDay()->format('Y-m-d');
        $to = now()->subDay()->format('Y-m-d');

        $this->asUser($agent)->getJson("/api/v1/conversations?date_from={$from}&date_to={$to}")->assertStatus(422);
    }

    public function test_sla_status_rejects_unknown_values(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $this->asUser($agent)->getJson('/api/v1/conversations?sla_status=bogus')->assertStatus(422);
    }

    public function test_sla_check_breaches_command_starts_timers_and_flips_statuses(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $unanswered = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);
        $this->insertMessage($unanswered, ['created_at' => now()->subMinutes(10)]);

        $answered = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);
        $this->insertMessage($answered, ['created_at' => now()->subMinutes(10)]);
        $this->insertMessage($answered, [
            'direction' => 'outbound',
            'sender_type' => 'user',
            'sender_user_id' => $agent->id,
            'created_at' => now()->subMinutes(5),
        ]);

        $config = SlaConfig::create([
            'workspace_id' => $agent->workspace_id,
            'name' => 'Default',
            'first_response_minutes' => 60,
            'followup_response_minutes' => 240,
            'is_active' => true,
        ]);

        // A timer that has already gone past its deadline should flip to breached.
        $alreadyBreached = Conversation::factory()->create([
            'workspace_id' => $agent->workspace_id,
            'assigned_user_id' => $agent->id,
        ]);
        SlaEvent::create([
            'workspace_id' => $agent->workspace_id,
            'conversation_id' => $alreadyBreached->id,
            'sla_config_id' => $config->id,
            'type' => 'first_response',
            'status' => 'pending',
            'started_at' => now()->subHours(2),
            'deadline_at' => now()->subHour(),
        ]);

        $this->artisan('sla:check-breaches')->assertExitCode(0);

        $this->assertDatabaseHas('sla_events', [
            'conversation_id' => $unanswered->id,
            'type' => 'first_response',
            'status' => 'pending',
        ]);

        // The answered conversation must not get a timer.
        $this->assertDatabaseMissing('sla_events', ['conversation_id' => $answered->id]);

        // The overdue pending timer was flipped to breached.
        $this->assertDatabaseHas('sla_events', [
            'conversation_id' => $alreadyBreached->id,
            'status' => 'breached',
        ]);
    }
}
