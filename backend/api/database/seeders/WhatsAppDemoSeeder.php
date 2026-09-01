<?php

namespace Database\Seeders;

use App\Models\Conversation;
use App\Models\Message;
use App\Models\User;
use App\Models\WhatsAppAccount;
use App\Models\Workspace;
use Illuminate\Database\Seeder;

class WhatsAppDemoSeeder extends Seeder
{
    private const CONVERSATIONS = [
        [
            'phone' => '15550001111',
            'name' => 'Priya Sharma',
            'status' => 'open',
            'assignee_email' => 'agent@demo.test',
            'tags' => ['billing'],
            'messages' => [
                ['direction' => 'in', 'body' => 'Hi, I wanted to follow up on the quote you sent last week.', 'minutes_ago' => 130],
                ['direction' => 'out', 'body' => 'Of course! Let me pull that up for you.', 'minutes_ago' => 128],
                ['direction' => 'in', 'body' => 'Can you send the updated quote?', 'minutes_ago' => 2],
            ],
        ],
        [
            'phone' => '447911123456',
            'name' => null,
            'status' => 'closed',
            'assignee_email' => 'lead@demo.test',
            'tags' => [],
            'messages' => [
                ['direction' => 'in', 'body' => 'My last order arrived damaged.', 'minutes_ago' => 60],
                ['direction' => 'out', 'body' => 'So sorry to hear that — sending a replacement now.', 'minutes_ago' => 45],
                ['direction' => 'in', 'body' => 'Thanks, that resolves it!', 'minutes_ago' => 18],
            ],
        ],
        [
            'phone' => '14155550142',
            'name' => 'Marcus Chen',
            'status' => 'open',
            'assignee_email' => null,
            'tags' => ['lead'],
            'messages' => [
                ['direction' => 'in', 'body' => 'Following up on our call yesterday.', 'minutes_ago' => 90],
            ],
        ],
        [
            'phone' => '34611223344',
            'name' => 'Sofia Alvarez',
            'status' => 'closed',
            'assignee_email' => 'agent@demo.test',
            'tags' => ['vip'],
            'messages' => [
                ['direction' => 'out', 'body' => 'See you at 3pm for the demo.', 'minutes_ago' => 200],
                ['direction' => 'in', 'body' => 'Perfect, see you then.', 'minutes_ago' => 195],
            ],
        ],
    ];

    public function run(): void
    {
        $workspace = Workspace::where('slug', 'demo')->first();
        if (! $workspace) {
            return;
        }

        $account = WhatsAppAccount::updateOrCreate(
            ['workspace_id' => $workspace->id],
            [
                'phone_number' => '15550009999',
                'device_name' => 'Demo WhatsApp Web',
                'session_state' => 'linked',
                'linked_at' => now()->subDays(3),
                'last_seen_at' => now()->subMinutes(5),
            ],
        );

        foreach (self::CONVERSATIONS as $definition) {
            $assignee = $definition['assignee_email']
                ? User::where('workspace_id', $workspace->id)->where('email', $definition['assignee_email'])->first()
                : null;

            $lastMessageMinutesAgo = min(array_column($definition['messages'], 'minutes_ago'));

            $conversation = Conversation::updateOrCreate(
                ['workspace_id' => $workspace->id, 'contact_phone' => $definition['phone']],
                [
                    'whatsapp_account_id' => $account->id,
                    'contact_name' => $definition['name'],
                    'status' => $definition['status'],
                    'tags' => $definition['tags'],
                    'assignee_id' => $assignee?->id,
                    'unread_count' => $definition['status'] === 'open' ? 1 : 0,
                    'last_message_at' => now()->subMinutes($lastMessageMinutesAgo),
                ],
            );

            foreach ($definition['messages'] as $index => $messageDefinition) {
                $waMessageId = "demo-{$definition['phone']}-{$index}";

                Message::updateOrCreate(
                    ['workspace_id' => $workspace->id, 'wa_message_id' => $waMessageId],
                    [
                        'conversation_id' => $conversation->id,
                        'direction' => $messageDefinition['direction'],
                        'body' => $messageDefinition['body'],
                        'status' => $messageDefinition['direction'] === 'in' ? 'delivered' : 'sent',
                        'sent_at' => now()->subMinutes($messageDefinition['minutes_ago']),
                    ],
                );
            }
        }
    }
}
