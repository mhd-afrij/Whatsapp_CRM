<?php

namespace Database\Factories;

use App\Models\Campaign;
use App\Models\CampaignMessage;
use App\Models\Contact;
use App\Models\Workspace;
use Illuminate\Database\Eloquent\Factories\Factory;

class CampaignMessageFactory extends Factory
{
    protected $model = CampaignMessage::class;

    public function definition(): array
    {
        return [
            'workspace_id' => Workspace::factory(),
            'campaign_id' => Campaign::factory(),
            'contact_id' => Contact::factory(),
            'phone_number' => fake()->unique()->e164PhoneNumber(),
            'rendered_content' => fake()->sentence(),
            'status' => CampaignMessage::STATUS_PENDING,
        ];
    }

    public function sent(): static
    {
        return $this->state(fn () => [
            'status' => CampaignMessage::STATUS_SENT,
            'sent_at' => now(),
            'wa_message_id' => 'WA-'.fake()->uuid(),
        ]);
    }

    public function failed(): static
    {
        return $this->state(fn () => [
            'status' => CampaignMessage::STATUS_FAILED,
            'error' => 'Gateway unreachable',
        ]);
    }
}
