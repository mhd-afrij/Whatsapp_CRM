<?php

namespace Database\Factories;

use App\Models\WhatsappAccount;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Factory for managed WhatsApp account slots. Defaults describe a fresh,
 * never-connected managed slot - exactly what WhatsappAccountService::create
 * produces - so tests opt in to other states explicitly.
 */
class WhatsappAccountFactory extends Factory
{
    /** @use HasFactory<WhatsappAccount> */
    protected $model = WhatsappAccount::class;

    public function definition(): array
    {
        return [
            'name' => 'WhatsApp '.$this->faker->unique()->company(),
            'display_name' => fn (array $attributes) => $attributes['name'],
            'provider' => WhatsappAccount::PROVIDER_BAILEYS,
            'status' => 'disconnected',
            'is_active' => false,
            'auto_reply_enabled' => false,
            'routing_mode' => 'default',
        ];
    }
}
