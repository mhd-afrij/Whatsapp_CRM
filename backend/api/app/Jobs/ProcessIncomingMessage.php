<?php

namespace App\Jobs;

use App\Models\Conversation;
use App\Models\Message;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ProcessIncomingMessage implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $backoff = 5;

    public function __construct(
        public readonly int $workspaceId,
        public readonly string $from,
        public readonly string $body,
        public readonly ?string $waMessageId,
        public readonly string $timestamp,
    ) {}

    public function handle(): void
    {
        $contactPhone = preg_replace('/@.*$/', '', $this->from);

        $conversation = Conversation::firstOrCreate(
            ['workspace_id' => $this->workspaceId, 'contact_phone' => $contactPhone],
            ['status' => 'open'],
        );

        Message::create([
            'workspace_id' => $this->workspaceId,
            'conversation_id' => $conversation->id,
            'direction' => 'in',
            'body' => $this->body,
            'wa_message_id' => $this->waMessageId,
            'status' => 'delivered',
            'sent_at' => $this->timestamp,
        ]);

        $conversation->forceFill([
            'last_message_at' => $this->timestamp,
            'unread_count' => $conversation->unread_count + 1,
        ])->save();
    }
}
