<?php

namespace App\Jobs;

use App\Models\Conversation;
use App\Models\Message;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SendWhatsAppMessage implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $backoff = 5;

    public function __construct(
        public readonly int $conversationId,
        public readonly string $body,
    ) {}

    public function handle(): void
    {
        $conversation = Conversation::findOrFail($this->conversationId);

        $response = Http::withHeaders([
            'x-internal-secret' => config('services.whatsapp_sync.secret'),
        ])->post(
            rtrim(config('services.whatsapp_sync.base_url'), '/').'/internal/v1/messages/send',
            ['to' => $conversation->contact_phone, 'text' => $this->body]
        );

        if (! $response->successful()) {
            Log::warning('whatsapp-sync message send failed', [
                'conversation_id' => $conversation->id,
                'status' => $response->status(),
                'body' => $response->json(),
            ]);

            throw new \RuntimeException('Failed to send WhatsApp message');
        }

        $now = now();
        Message::create([
            'workspace_id' => $conversation->workspace_id,
            'conversation_id' => $conversation->id,
            'direction' => 'out',
            'body' => $this->body,
            'wa_message_id' => $response->json('data.id'),
            'status' => 'sent',
            'sent_at' => $now,
        ]);

        $conversation->forceFill(['last_message_at' => $now])->save();
    }
}
