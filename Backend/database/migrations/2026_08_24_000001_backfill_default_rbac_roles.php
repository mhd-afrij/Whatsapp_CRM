<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('workspaces') || ! Schema::hasTable('users') || ! Schema::hasTable('roles') || ! Schema::hasTable('role_user')) {
            return;
        }

        $now = now();

        DB::table('workspaces')->orderBy('id')->chunk(100, function ($workspaces) use ($now): void {
            foreach ($workspaces as $workspace) {
                $defaultRoleId = DB::table('roles')
                    ->where('workspace_id', $workspace->id)
                    ->where(function ($query): void {
                        $query->whereIn('slug', ['user', 'viewer', 'agent'])
                            ->orWhereIn('name', ['User', 'Viewer', 'Agent']);
                    })
                    ->orderByRaw("CASE WHEN name = 'Viewer' THEN 0 WHEN slug = 'viewer' THEN 1 WHEN name = 'Agent' THEN 2 WHEN slug = 'agent' THEN 3 ELSE 4 END")
                    ->value('id');

                if (! $defaultRoleId) {
                    $defaultRoleId = DB::table('roles')->insertGetId([
                        'workspace_id' => $workspace->id,
                        'name' => 'User',
                        'slug' => 'user',
                        'is_system' => true,
                        'description' => 'Default non-admin role assigned to existing users during RBAC backfill.',
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                }

                $userIds = DB::table('users')
                    ->where('workspace_id', $workspace->id)
                    ->whereNotExists(function ($query): void {
                        $query->selectRaw('1')
                            ->from('role_user')
                            ->whereColumn('role_user.user_id', 'users.id');
                    })
                    ->pluck('id');

                foreach ($userIds as $userId) {
                    DB::table('role_user')->insertOrIgnore([
                        'role_id' => $defaultRoleId,
                        'user_id' => $userId,
                        'created_at' => $now,
                    ]);
                }
            }
        });
    }

    public function down(): void
    {
        // Backfilled role assignments are intentionally not removed; deleting them
        // could lock existing users out during a rollback.
    }
};