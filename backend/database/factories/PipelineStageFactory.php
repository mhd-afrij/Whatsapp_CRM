<?php

namespace Database\Factories;

use App\Models\Pipeline;
use App\Models\PipelineStage;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PipelineStage>
 */
class PipelineStageFactory extends Factory
{
    protected $model = PipelineStage::class;

    public function definition(): array
    {
        return [
            'pipeline_id' => Pipeline::factory(),
            'name' => fake()->unique()->word(),
            'position' => fake()->unique()->numberBetween(1, 1000),
            'probability_percent' => fake()->numberBetween(0, 100),
            'is_won_stage' => false,
            'is_lost_stage' => false,
        ];
    }
}
