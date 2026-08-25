<?php

namespace Database\Factories;

use App\Models\Conversation;
use App\Models\Workspace;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\DB;

/**
 * @extends Factory<Conversation>
 */
class ConversationFactory extends Factory
{
    protected $model = Conversation::class;

    public function definition(): array
    {
        $workspace = Workspace::factory();

        return [
            'workspace_id' => $workspace,
            'whatsapp_contact_id' => function (array $attributes) {
                return DB::table('whatsapp_contacts')->insertGetId([
                    'workspace_id' => $attributes['workspace_id'],
                    'wa_jid' => fake()->unique()->numerify('1###########').'@s.whatsapp.net',
                    'push_name' => fake()->name(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            },
            'status' => 'open',
            'unread_count' => 0,
            'last_message_at' => now(),
            'last_message_preview' => fake()->sentence(),
        ];
    }
}
