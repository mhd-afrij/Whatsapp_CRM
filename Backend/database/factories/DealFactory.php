<?php

namespace Database\Factories;

use App\Models\Contact;
use App\Models\Deal;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Models\Workspace;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Deal>
 */
class DealFactory extends Factory
{
    protected $model = Deal::class;

    public function definition(): array
    {
        return [
            'workspace_id' => Workspace::factory(),
            'contact_id' => Contact::factory(),
            'pipeline_id' => Pipeline::factory(),
            'pipeline_stage_id' => PipelineStage::factory(),
            'title' => fake()->words(3, true),
            'value_amount' => fake()->randomFloat(2, 100, 10000),
            'value_currency' => 'USD',
            'status' => 'open',
        ];
    }
}
