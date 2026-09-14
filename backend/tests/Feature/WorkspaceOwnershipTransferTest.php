<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\CreatesWorkspaceUsers;
use Tests\TestCase;

class WorkspaceOwnershipTransferTest extends TestCase
{
    use CreatesWorkspaceUsers, RefreshDatabase;

    public function test_administrator_cannot_transfer_ownership_or_promote_themselves(): void
    {
        $this->seedRbac();
        $admin = $this->userWithRole('Administrator');

        $this->asUser($admin)->postJson('/api/v1/workspace/transfer-ownership', [
            'user_id' => $admin->id,
        ])->assertStatus(403)->assertJsonPath('success', false);

        $this->assertFalse($admin->fresh()->isSuperAdmin());
    }

    public function test_super_admin_can_transfer_ownership_to_an_active_user(): void
    {
        $this->seedRbac();
        $superAdmin = $this->userWithRole('Super Administrator');
        $admin = $this->userWithRole('Administrator');

        $this->asUser($superAdmin)->postJson('/api/v1/workspace/transfer-ownership', [
            'user_id' => $admin->id,
        ])->assertOk()->assertJsonPath('success', true);

        // New owner is now a super administrator...
        $this->assertTrue($admin->fresh()->isSuperAdmin());
        // ...and the previous owner stepped down to Administrator.
        $this->assertFalse($superAdmin->fresh()->isSuperAdmin());
        $this->assertTrue($superAdmin->fresh()->isAdmin());
    }

    public function test_super_admin_cannot_transfer_to_an_inactive_user(): void
    {
        $this->seedRbac();
        $superAdmin = $this->userWithRole('Super Administrator');
        $inactive = User::factory()->create([
            'workspace_id' => $superAdmin->workspace_id,
            'is_active' => false,
        ]);

        $this->asUser($superAdmin)->postJson('/api/v1/workspace/transfer-ownership', [
            'user_id' => $inactive->id,
        ])->assertStatus(422)->assertJsonPath('success', false);
    }

    public function test_cannot_transfer_to_a_user_in_another_workspace(): void
    {
        $this->seedRbac();
        $superAdmin = $this->userWithRole('Super Administrator');
        $foreign = User::factory()->create(['is_active' => true]);

        $this->asUser($superAdmin)->postJson('/api/v1/workspace/transfer-ownership', [
            'user_id' => $foreign->id,
        ])->assertStatus(422)->assertJsonPath('success', false);
    }
}