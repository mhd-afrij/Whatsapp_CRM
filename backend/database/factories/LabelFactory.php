<?php

namespace Database\Factories;

use App\Models\Label;
use App\Models\Workspace;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Label>
 */
class LabelFactory extends Factory
{
    protected $model = Label::class;

    public function definition(): array
    {
        return [
            'workspace_id' => Workspace::factory(),
            'name' => fake()->unique()->word(),
            'color_hex' => fake()->randomElement(['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6']),
        ];
    }
}
