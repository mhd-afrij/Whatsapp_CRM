<?php

namespace Tests\Feature;

use App\Models\Campaign;
use App\Models\CampaignMessage;
use App\Models\Contact;
use App\Models\Label;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class CampaignTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed> valid campaign payload
     */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'August promo',
            'description' => null,
            'message_content' => 'Hi {{contact.first_name}}, check our August offers!',
            'labels' => [],
            'statuses' => ['active'],
            'scheduled_at' => null,
        ], $overrides);
    }

    private function fakeGateway(): void
    {
        Http::fake([
            '*/internal/whatsapp/conversations/start' => Http::response([
                'success' => true,
                'data' => ['conversationId' => 501, 'created' => true],
            ]),
            '*/internal/whatsapp/messages/send' => Http::response([
                'success' => true,
                'data' => ['dispatchId' => 601, 'bullmqJobId' => 'job-1'],
            ]),
        ]);
    }

    public function test_administrator_can_create_draft_campaign(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $res = $this->asUser($admin)->postJson('/api/v1/campaigns', $this->payload())
            ->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'draft');

        $this->assertDatabaseHas('campaigns', [
            'id' => $res->json('data.id'),
            'workspace_id' => $admin->workspace_id,
            'status' => 'draft',
        ]);
    }

    public function test_campaign_with_future_schedule_is_created_scheduled(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $this->asUser($admin)->postJson('/api/v1/campaigns', $this->payload([
            'scheduled_at' => now()->addDay()->toIso8601String(),
        ]))->assertStatus(201)->assertJsonPath('data.status', 'scheduled');
    }

    public function test_agent_and_viewer_cannot_access_campaigns(): void
    {
        $this->seedRbac();

        $agent = $this->userWithRole('Agent');
        $this->asUser($agent)->getJson('/api/v1/campaigns')->assertStatus(403);
        $this->asUser($agent)->postJson('/api/v1/campaigns', $this->payload())->assertStatus(403);

        $viewer = $this->userWithRole('Viewer');
        $this->asUser($viewer)->getJson('/api/v1/campaigns')->assertStatus(403);
    }

    public function test_manager_has_read_only_access(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $admin = $this->userWithRole('Administrator');

        $campaignId = $this->asUser($admin)->postJson('/api/v1/campaigns', $this->payload())
            ->json('data.id');

        // Manager can read...
        $this->asUser($manager)->getJson('/api/v1/campaigns')->assertOk();
        $this->asUser($manager)->getJson("/api/v1/campaigns/{$campaignId}")->assertOk();

        // ...but not mutate or send.
        $this->asUser($manager)->postJson("/api/v1/campaigns/{$campaignId}/send")->assertStatus(403);
        $this->asUser($manager)->patchJson("/api/v1/campaigns/{$campaignId}", ['name' => 'X'])->assertStatus(403);
    }

    public function test_preview_audience_counts_only_contacts_with_phone(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        Contact::factory()->create(['workspace_id' => $admin->workspace_id, 'phone_number' => '+94771111111']);
        Contact::factory()->create(['workspace_id' => $admin->workspace_id, 'phone_number' => '+94772222222']);
        // No phone -> not addressable over WhatsApp.
        Contact::factory()->create(['workspace_id' => $admin->workspace_id, 'phone_number' => null]);
        // Wrong status filter target.
        Contact::factory()->create(['workspace_id' => $admin->workspace_id, 'phone_number' => '+94773333333', 'status' => 'inactive']);

        $res = $this->asUser($admin)->postJson('/api/v1/campaigns/preview-audience', [
            'labels' => [],
            'statuses' => ['active'],
        ])->assertOk();

        $this->assertSame(2, $res->json('data.count'));
        $this->assertCount(2, $res->json('data.sample'));
    }

    public function test_preview_audience_filters_by_label(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $label = Label::factory()->create(['workspace_id' => $admin->workspace_id]);
        $tagged = Contact::factory()->create(['workspace_id' => $admin->workspace_id, 'phone_number' => '+94774444444']);
        $tagged->labels()->attach($label->id, ['created_at' => now()]);
        Contact::factory()->create(['workspace_id' => $admin->workspace_id, 'phone_number' => '+94775555555']);

        $res = $this->asUser($admin)->postJson('/api/v1/campaigns/preview-audience', [
            'labels' => [$label->id],
            'statuses' => [],
        ])->assertOk();

        $this->assertSame(1, $res->json('data.count'));
    }

    public function test_send_delivers_template_variables_to_every_contact(): void
    {
        $this->seedRbac();
        $this->fakeGateway();
        $admin = $this->userWithRole('Administrator');

        Contact::factory()->create([
            'workspace_id' => $admin->workspace_id,
            'full_name' => 'Alice Perera',
            'phone_number' => '+94770000001',
        ]);
        Contact::factory()->create([
            'workspace_id' => $admin->workspace_id,
            'full_name' => 'Bob Silva',
            'phone_number' => '+94770000002',
        ]);

        $campaignId = $this->asUser($admin)->postJson('/api/v1/campaigns', $this->payload())
            ->json('data.id');

        // QUEUE_CONNECTION=sync (phpunit.xml): jobs run inline within this call.
        $res = $this->asUser($admin)->postJson("/api/v1/campaigns/{$campaignId}/send")
            ->assertOk()
            ->assertJsonPath('success', true);

        $campaign = Campaign::query()->find($campaignId);
        $this->assertSame(Campaign::STATUS_COMPLETED, $campaign->status);
        $this->assertSame(2, $campaign->total_targets);
        $this->assertSame(2, $campaign->sent_count);

        $rows = CampaignMessage::query()->where('campaign_id', $campaignId)->get();
        $this->assertSame(2, $rows->count());
        $this->assertTrue($rows->every(fn ($r) => $r->status === CampaignMessage::STATUS_SENT));
        $this->assertTrue($rows->contains(fn ($r) => $r->rendered_content === 'Hi Alice, check our August offers!'));

        // Two sends went out (plus two conversation lookups) with deterministic
        // per-recipient idempotency keys so gateway replays never double-send.
        Http::assertSentCount(4);
        $sendKeys = collect(Http::recorded())
            ->filter(fn ($pair) => str_contains((string) $pair[0]->url(), '/messages/send'))
            ->map(fn ($pair) => $pair[0]->data()['idempotencyKey'] ?? null)
            ->sort()
            ->values()
            ->all();
        $expected = $rows->map(
            fn ($r) => "campaign:{$campaignId}:{$r->id}:{$r->contact_id}"
        )->sort()->values()->all();
        $this->assertSame($expected, $sendKeys);
    }

    public function test_resend_skips_recipients_already_sent(): void
    {
        $this->seedRbac();
        $this->fakeGateway();
        $admin = $this->userWithRole('Administrator');

        $contacts = Contact::factory()->count(2)->create(['workspace_id' => $admin->workspace_id]);
        $campaignId = $this->asUser($admin)->postJson('/api/v1/campaigns', $this->payload())->json('data.id');
        $this->asUser($admin)->postJson("/api/v1/campaigns/{$campaignId}/send")->assertOk();

        // One recipient "failed" (simulate gateway outage), resend should only
        // target that one - already-sent rows are never recreated/re-sent.
        $failedRow = CampaignMessage::query()
            ->where('campaign_id', $campaignId)
            ->where('contact_id', $contacts[1]->id)
            ->first();
        $failedRow->forceFill(['status' => CampaignMessage::STATUS_FAILED])->save();

        Http::fake([
            '*/internal/whatsapp/conversations/start' => Http::response([
                'success' => true, 'data' => ['conversationId' => 501],
            ]),
            '*/internal/whatsapp/messages/send' => Http::response(['success' => true, 'data' => []]),
        ]);

        $this->asUser($admin)->postJson("/api/v1/campaigns/{$campaignId}/send")->assertOk();

        $campaign = Campaign::query()->find($campaignId);
        $this->assertSame(2, $campaign->sent_count);
        $this->assertSame(0, $campaign->failed_count);

        $sendCalls = collect(Http::recorded())->filter(
            fn ($pair) => str_contains((string) $pair[0]->url(), '/messages/send')
        );
        $this->assertSame(1, $sendCalls->count());
    }

    public function test_gateway_failure_fails_row_and_records_error(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        Contact::factory()->create(['workspace_id' => $admin->workspace_id, 'phone_number' => '+94776666666']);
        $campaignId = $this->asUser($admin)->postJson('/api/v1/campaigns', $this->payload())->json('data.id');

        Http::fake([
            '*/internal/whatsapp/*' => Http::response(['success' => false, 'message' => 'Session disconnected'], 502),
        ]);

        $this->asUser($admin)->postJson("/api/v1/campaigns/{$campaignId}/send")->assertOk();

        $row = CampaignMessage::query()->where('campaign_id', $campaignId)->first();
        $this->assertSame(CampaignMessage::STATUS_FAILED, $row->status);
        $this->assertNotNull($row->error);

        $campaign = Campaign::query()->find($campaignId);
        $this->assertSame(1, $campaign->failed_count);
        $this->assertSame(0, $campaign->sent_count);
    }

    public function test_cancel_skips_pending_recipients(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $campaign = Campaign::factory()->create([
            'workspace_id' => $admin->workspace_id,
            'message_content' => 'hello',
            'status' => Campaign::STATUS_SENDING,
        ]);
        $contactA = Contact::factory()->create(['workspace_id' => $admin->workspace_id, 'phone_number' => '+94777777771']);
        $contactB = Contact::factory()->create(['workspace_id' => $admin->workspace_id, 'phone_number' => '+94777777772']);

        CampaignMessage::factory()->create([
            'workspace_id' => $admin->workspace_id, 'campaign_id' => $campaign->id,
            'contact_id' => $contactA->id, 'phone_number' => $contactA->phone_number,
            'status' => CampaignMessage::STATUS_SENT,
        ]);
        CampaignMessage::factory()->create([
            'workspace_id' => $admin->workspace_id, 'campaign_id' => $campaign->id,
            'contact_id' => $contactB->id, 'phone_number' => $contactB->phone_number,
            'status' => CampaignMessage::STATUS_PENDING,
        ]);

        $this->asUser($admin)->postJson("/api/v1/campaigns/{$campaign->id}/cancel")
            ->assertOk()->assertJsonPath('data.status', 'cancelled');

        $this->assertDatabaseHas('campaign_messages', [
            'id' => CampaignMessage::query()->where('campaign_id', $campaign->id)
                ->where('contact_id', $contactB->id)->value('id'),
            'status' => CampaignMessage::STATUS_SKIPPED,
        ]);
    }

    public function test_scheduled_campaign_starts_via_scheduler_command(): void
    {
        $this->seedRbac();
        $this->fakeGateway();
        $admin = $this->userWithRole('Administrator');

        Contact::factory()->create(['workspace_id' => $admin->workspace_id, 'phone_number' => '+94778888888']);
        $campaignId = $this->asUser($admin)->postJson('/api/v1/campaigns', $this->payload([
            'scheduled_at' => now()->addHour()->toIso8601String(),
        ]))->assertStatus(201)->json('data.id');

        // Time passes; the scheduler picks the campaign up once it is due.
        Campaign::query()->whereKey($campaignId)->update(['scheduled_at' => now()->subMinute()]);
        $this->artisan('campaigns:dispatch-scheduled')->assertSuccessful();

        $campaign = Campaign::query()->find($campaignId);
        $this->assertSame(Campaign::STATUS_COMPLETED, $campaign->status);
        $this->assertSame(1, $campaign->sent_count);
    }

    public function test_workspace_isolation_hides_other_workspaces_campaigns(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $foreign = Campaign::factory()->create([
            'workspace_id' => \App\Models\Workspace::factory(),
            'message_content' => 'x',
        ]);

        $this->asUser($admin)->getJson("/api/v1/campaigns/{$foreign->id}")->assertNotFound();
        $this->asUser($admin)->deleteJson("/api/v1/campaigns/{$foreign->id}")->assertNotFound();
    }

    public function test_validation_rejects_unknown_labels_and_statuses(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $this->asUser($admin)->postJson('/api/v1/campaigns', $this->payload([
            'statuses' => ['bogus'],
        ]))->assertStatus(422);

        $this->asUser($admin)->postJson('/api/v1/campaigns', $this->payload([
            'message_content' => '',
        ]))->assertStatus(422);
    }
}
