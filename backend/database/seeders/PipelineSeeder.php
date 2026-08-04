<?php

namespace Database\Seeders;

use App\Models\Pipeline;
use App\Models\Workspace;
use Illuminate\Database\Seeder;

class PipelineSeeder extends Seeder
{
    /**
     * Seeds a default sales pipeline (with a standard stage set) for every workspace
     * that doesn't already have one. Safe to run multiple times.
     */
    public function run(): void
    {
        Workspace::query()->each(function (Workspace $workspace) {
            if ($workspace->pipelines()->exists()) {
                return;
            }

            $pipeline = Pipeline::query()->create([
                'workspace_id' => $workspace->id,
                'name' => 'Default Sales Pipeline',
                'is_default' => true,
            ]);

            $stages = [
                ['name' => 'New', 'probability_percent' => 10],
                ['name' => 'Contacted', 'probability_percent' => 20],
                ['name' => 'Qualified', 'probability_percent' => 40],
                ['name' => 'Proposal', 'probability_percent' => 60],
                ['name' => 'Negotiation', 'probability_percent' => 80],
                ['name' => 'Won', 'probability_percent' => 100, 'is_won_stage' => true],
                ['name' => 'Lost', 'probability_percent' => 0, 'is_lost_stage' => true],
            ];

            foreach ($stages as $i => $stage) {
                $pipeline->stages()->create(array_merge($stage, ['position' => $i + 1]));
            }

            if ($workspace->settings) {
                $workspace->settings->update(['default_pipeline_id' => $pipeline->id]);
            }
        });
    }
}
