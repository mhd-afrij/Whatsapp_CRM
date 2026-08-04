<?php

namespace Database\Factories;

use App\Models\InternalNote;
use App\Models\Workspace;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<InternalNote>
 */
class InternalNoteFactory extends Factory
{
    protected $model = InternalNote::class;

    public function definition(): array
    {
        return [
            'workspace_id' => Workspace::factory(),
            'body' => fake()->paragraph(),
            'is_private' => false,
        ];
    }
}
