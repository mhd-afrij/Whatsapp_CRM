<?php

namespace Tests\Feature;

use App\Jobs\GenerateReportExportJob;
use App\Models\Campaign;
use App\Models\Contact;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class FailedJobTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    private function exportPayload(int $workspaceId, int $userId): string
    {
        $job = new GenerateReportExportJob($workspaceId, $userId, 'contacts', null, null);

        return json_encode([
            'uuid' => (string) \Illuminate\Support\Str::uuid(),
            'displayName' => 'App\\Jobs\\GenerateReportExportJob',
            'job' => 'Illuminate\\Queue\\CallQueuedHandler@call',
            'data' => [
                'commandName' => 'App\\Jobs\\GenerateReportExportJob',
                'command' => serialize($job),
            ],
        ]);
    }

    private function insertFailedJob(int $workspaceId, int $userId, array $overrides = []): int
    {
        return DB::table('failed_jobs')->insertGetId(array_merge([
            'uuid' => (string) \Illuminate\Support\Str::uuid(),
            'connection' => 'database',
            'queue' => 'default',
            'payload' => $this->exportPayload($workspaceId, $userId),
            'exception' => 'RuntimeException: boom at app/Jobs/GenerateReportExportJob.php:45',
            'failed_at' => now(),
        ], $overrides));
    }

    public function test_agent_without_dlq_manage_cannot_access_the_failed_jobs_surface(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $this->asUser($agent)->getJson('/api/v1/failed-jobs')
            ->assertStatus(403);

        $this->asUser($agent)->postJson('/api/v1/failed-jobs/1/retry')
            ->assertStatus(403);
    }

    public function test_admin_sees_only_their_own_workspaces_failed_jobs_without_raw_payloads(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $ownId = $this->insertFailedJob($admin->workspace_id, $admin->id);

        $other = \App\Models\Workspace::factory()->create();
        $foreignUserId = User::factory()->create(['workspace_id' => $other->id])->id;
        $this->insertFailedJob($other->id, $foreignUserId);

        // A job with no tenant attribution (framework/system level) is hidden too.
        DB::table('failed_jobs')->insert([
            'uuid' => (string) \Illuminate\Support\Str::uuid(),
            'connection' => 'database',
            'queue' => 'default',
            'payload' => json_encode(['displayName' => 'Unattributable', 'job' => '@foo']),
            'exception' => 'SystemException: x',
            'failed_at' => now(),
        ]);

        $response = $this->asUser($admin)->getJson('/api/v1/failed-jobs')
            ->assertOk();

        $this->assertSame(1, $response->json('meta.total'));
        $this->assertSame(1, count($response->json('data.items')));
        $this->assertSame($ownId, $response->json('data.items.0.id'));

        // Raw serialized payload and full stack trace are never exposed.
        $item = $response->json('data.items.0');
        $this->assertArrayNotHasKey('payload', $item);
        $this->assertArrayNotHasKey('exception', $item);
        $this->assertArrayHasKey('exception_preview', $item);
        $this->assertSame('App\\Jobs\\GenerateReportExportJob', $item['job_class']);
    }

    public function test_admin_cannot_retry_or_delete_another_workspaces_failed_job(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $other = \App\Models\Workspace::factory()->create();
        $foreignUserId = User::factory()->create(['workspace_id' => $other->id])->id;
        $foreignId = $this->insertFailedJob($other->id, $foreignUserId);

        $this->asUser($admin)->postJson('/api/v1/failed-jobs/'.$foreignId.'/retry')
            ->assertStatus(404);

        $this->asUser($admin)->deleteJson('/api/v1/failed-jobs/'.$foreignId)
            ->assertStatus(404);

        $this->assertDatabaseHas('failed_jobs', ['id' => $foreignId]);
    }

    public function test_retry_all_only_redispaches_the_caller_workspaces_jobs(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $ownId = $this->insertFailedJob($admin->workspace_id, $admin->id);

        $other = \App\Models\Workspace::factory()->create();
        $foreignUserId = User::factory()->create(['workspace_id' => $other->id])->id;
        $this->insertFailedJob($other->id, $foreignUserId);

        $response = $this->asUser($admin)->postJson('/api/v1/failed-jobs/retry-all')
            ->assertOk();

        // Only the caller's own job was re-queued and removed.
        $this->assertSame('1 jobs re-dispatched.', $response->json('message'), 'retry-all message');
        $this->assertDatabaseMissing('failed_jobs', ['id' => $ownId]);
        $this->assertDatabaseCount('jobs', 1);
    }

    public function test_campaign_job_is_scoped_through_its_campaign_message_row(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $contact = Contact::factory()->create(['workspace_id' => $admin->workspace_id]);
        $campaign = Campaign::factory()->create([
            'workspace_id' => $admin->workspace_id,
            'created_by' => $admin->id,
        ]);
        $messageId = DB::table('campaign_messages')->insertGetId([
            'workspace_id' => $admin->workspace_id,
            'campaign_id' => $campaign->id,
            'contact_id' => $contact->id,
            'phone_number' => '94771234567',
            'status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $job = new \App\Jobs\SendCampaignMessageJob($messageId);
        $failedId = DB::table('failed_jobs')->insertGetId([
            'uuid' => (string) \Illuminate\Support\Str::uuid(),
            'connection' => 'database',
            'queue' => 'campaigns',
            'payload' => json_encode([
                'uuid' => (string) \Illuminate\Support\Str::uuid(),
                'displayName' => 'App\\Jobs\\SendCampaignMessageJob',
                'job' => 'Illuminate\\Queue\\CallQueuedHandler@call',
                'data' => [
                    'commandName' => 'App\\Jobs\\SendCampaignMessageJob',
                    'command' => serialize($job),
                ],
            ]),
            'exception' => 'RuntimeException: gateway unreachable',
            'failed_at' => now(),
        ]);

        $other = \App\Models\Workspace::factory()->create();
        $this->insertFailedJob($other->id, User::factory()->create(['workspace_id' => $other->id])->id);

        $response = $this->asUser($admin)->getJson('/api/v1/failed-jobs')
            ->assertOk();

        $this->assertSame(1, $response->json('meta.total'));
        $this->assertSame($failedId, $response->json('data.items.0.id'));
        $this->assertSame('App\\Jobs\\SendCampaignMessageJob', $response->json('data.items.0.job_class'));
    }
}