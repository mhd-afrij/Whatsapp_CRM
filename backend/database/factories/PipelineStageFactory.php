<?php

namespace Database\Factories;

use App\Models\Pipeline;
use App\Models\PipelineStage;
use Illuminate\Database\Eloquent\Factories\Factory;

class PipelineStageFactory extends Factory
{
    protected $model = PipelineStage::class;
    public function definition(): array { return ['pipeline_id' => Pipeline::factory(), 'name' => fake()->word(), 'position' => 1]; }
}
