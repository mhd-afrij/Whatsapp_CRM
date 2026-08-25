<?php

namespace Database\Factories;

use App\Models\Campaign;
use App\Models\MessageTemplate;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Database\Eloquent\Factories\Factory;

class CampaignFactory extends Factory
{
    protected $model = Campaign::class;

    public function definition(): array
    {
        return [
            'workspace_id' => Workspace::factory(),
            'name' => fake()->words(3, true),
            'message_content' => 'Hi {{contact.first_name}}, quick update!',
            'audience_filter' => ['labels' => [], 'statuses' => ['active']],
            'status' => Campaign::STATUS_DRAFT,
            'created_by' => User::factory(),
        ];
    }

    public function scheduled(): static
    {
        return $this->state(fn () => [
            'status' => Campaign::STATUS_SCHEDULED,
            'scheduled_at' => now()->addDay(),
        ]);
    }

    public function fromTemplate(): static
    {
        return $this->state(fn () => [
            'message_template_id' => MessageTemplate::factory(),
        ]);
    }
}
