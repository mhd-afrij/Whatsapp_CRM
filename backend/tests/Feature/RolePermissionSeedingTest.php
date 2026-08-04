<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use Database\Seeders\AdminUserSeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\WorkspaceSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RolePermissionSeedingTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeding_creates_the_five_system_roles_for_the_default_workspace(): void
    {
        $this->seed(WorkspaceSeeder::class);
        $this->seed(PermissionSeeder::class);
        $this->seed(RolePermissionSeeder::class);

        $roleNames = Role::query()->where('is_system', true)->pluck('name')->sort()->values()->all();

        $this->assertSame(
            ['Administrator', 'Agent', 'Manager', 'Super Administrator', 'Viewer'],
            $roleNames
        );
    }

    public function test_seeding_creates_every_permission_in_the_catalog(): void
    {
        $this->seed(PermissionSeeder::class);

        $this->assertSame(
            count(PermissionSeeder::catalog()),
            Permission::query()->count()
        );

        $this->assertTrue(Permission::query()->where('name', 'contacts.view')->exists());
        $this->assertTrue(Permission::query()->where('name', 'roles.manage')->exists());
    }

    public function test_super_admin_has_every_permission_and_viewer_cannot_create_contacts(): void
    {
        $this->seed(WorkspaceSeeder::class);
        $this->seed(PermissionSeeder::class);
        $this->seed(RolePermissionSeeder::class);

        $superAdmin = Role::query()->where('name', 'Super Administrator')->firstOrFail();
        $viewer = Role::query()->where('name', 'Viewer')->firstOrFail();

        $this->assertSame(Permission::query()->count(), $superAdmin->permissions()->count());

        $this->assertTrue($viewer->permissions()->where('name', 'contacts.view')->exists());
        $this->assertFalse($viewer->permissions()->where('name', 'contacts.create')->exists());
        $this->assertFalse($viewer->permissions()->where('name', 'roles.manage')->exists());
    }

    public function test_full_database_seeder_creates_a_super_admin_user_with_a_hashed_password(): void
    {
        $this->seed();

        $admin = \App\Models\User::query()->where('email', AdminUserSeeder::EMAIL)->firstOrFail();

        $this->assertNotSame(AdminUserSeeder::PLAINTEXT_PASSWORD, $admin->password);
        $this->assertTrue(\Illuminate\Support\Facades\Hash::check(AdminUserSeeder::PLAINTEXT_PASSWORD, $admin->password));
        $this->assertTrue($admin->roles()->where('name', 'Super Administrator')->exists());
    }
}
