<?php

namespace Database\Seeders;

use App\Models\Workspace;
use Illuminate\Database\Seeder;

class WorkspaceSeeder extends Seeder
{
    public function run(): void
    {
        Workspace::query()->firstOrCreate(
            ['slug' => 'default'],
            [
                'name' => 'Default Workspace',
                'timezone' => 'UTC',
                'is_active' => true,
            ]
        );
    }
}
