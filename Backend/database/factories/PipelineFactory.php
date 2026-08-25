<?php

namespace Database\Factories;

use App\Models\Pipeline;
use App\Models\Workspace;
use Illuminate\Database\Eloquent\Factories\Factory;

class PipelineFactory extends Factory
{
    protected $model = Pipeline::class;
    public function definition(): array { return ['workspace_id' => Workspace::factory(), 'name' => fake()->unique()->words(2, true)]; }
}
