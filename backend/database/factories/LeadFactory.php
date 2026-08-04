<?php

namespace Database\Factories;

use App\Models\Contact;
use App\Models\Lead;
use App\Models\Workspace;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Lead>
 */
class LeadFactory extends Factory
{
    protected $model = Lead::class;

    public function definition(): array
    {
        return [
            'workspace_id' => Workspace::factory(),
            'contact_id' => Contact::factory(),
            'source' => fake()->randomElement(['whatsapp', 'manual', 'import', 'other']),
            'status' => 'new',
        ];
    }
}
