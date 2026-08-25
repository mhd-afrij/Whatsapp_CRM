<?php

namespace Tests\Feature;

use App\Jobs\GenerateReportExportJob;
use App\Models\Contact;
use App\Models\Notification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Storage;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

/**
 * Phase 18 gap fill: ReportExportController had zero direct test coverage before this.
 */
class ReportExportTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    public function test_agent_without_analytics_export_permission_is_forbidden(): void
    {
        $this->seedRbac();
        $agent = $this->userWithRole('Agent');

        $this->asUser($agent)->postJson('/api/v1/reports/export', [
            'type' => 'contacts',
        ])->assertForbidden();
    }

    public function test_manager_can_queue_a_contacts_export(): void
    {
        $this->seedRbac();
        Bus::fake();
        $manager = $this->userWithRole('Manager');

        $this->asUser($manager)->postJson('/api/v1/reports/export', [
            'type' => 'contacts',
        ])->assertStatus(202)
            ->assertJsonPath('data.status', 'queued');

        Bus::assertDispatched(GenerateReportExportJob::class, fn ($job) => $job->workspaceId === $manager->workspace_id
            && $job->userId === $manager->id
            && $job->type === 'contacts');
    }

    public function test_invalid_export_type_is_rejected(): void
    {
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');

        $this->asUser($manager)->postJson('/api/v1/reports/export', [
            'type' => 'not_a_real_type',
        ])->assertStatus(422);
    }

    public function test_export_runs_end_to_end_and_produces_a_downloadable_csv(): void
    {
        Storage::fake('local');
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        Contact::factory()->count(2)->create(['workspace_id' => $manager->workspace_id]);

        $this->asUser($manager)->postJson('/api/v1/reports/export', [
            'type' => 'contacts',
        ])->assertStatus(202);

        $notification = Notification::query()
            ->where('user_id', $manager->id)
            ->where('type', 'report.export_ready')
            ->firstOrFail();

        $response = $this->asUser($manager)->get("/api/v1/reports/export/{$notification->id}/download");
        $response->assertOk();
    }

    public function test_a_user_cannot_download_another_users_export_notification(): void
    {
        Storage::fake('local');
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');
        $otherManager = $this->userWithRole('Manager');

        $this->asUser($manager)->postJson('/api/v1/reports/export', [
            'type' => 'contacts',
        ])->assertStatus(202);

        $notification = Notification::query()
            ->where('user_id', $manager->id)
            ->where('type', 'report.export_ready')
            ->firstOrFail();

        $this->asUser($otherManager)
            ->get("/api/v1/reports/export/{$notification->id}/download")
            ->assertNotFound();
    }

    public function test_download_returns_404_when_export_file_is_missing(): void
    {
        Storage::fake('local');
        $this->seedRbac();
        $manager = $this->userWithRole('Manager');

        $notification = Notification::query()->create([
            'workspace_id' => $manager->workspace_id,
            'user_id' => $manager->id,
            'type' => 'report.export_ready',
            'data' => ['type' => 'contacts', 'file' => 'exports/does-not-exist.csv'],
        ]);

        $this->asUser($manager)
            ->get("/api/v1/reports/export/{$notification->id}/download")
            ->assertNotFound();
    }
}
