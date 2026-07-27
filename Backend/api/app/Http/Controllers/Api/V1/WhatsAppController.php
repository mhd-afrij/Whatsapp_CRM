<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\WhatsAppAccount;
use App\Models\Workspace;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WhatsAppController extends Controller
{
    private function defaultWorkspace(): Workspace
    {
        return Workspace::where('slug', config('services.whatsapp_sync.default_workspace_slug'))->firstOrFail();
    }

    public function sessionUpdate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'session' => ['required', 'string'],
            'device_name' => ['nullable', 'string'],
            'linked_at' => ['nullable', 'date'],
            'last_seen_at' => ['nullable', 'date'],
        ]);

        $workspace = $this->defaultWorkspace();

        $account = WhatsAppAccount::updateOrCreate(
            ['workspace_id' => $workspace->id],
            [
                'session_state' => $data['session'],
                'device_name' => $data['device_name'] ?? null,
                'linked_at' => $data['linked_at'] ?? null,
                'last_seen_at' => $data['last_seen_at'] ?? null,
            ],
        );

        return response()->json(['data' => $account]);
    }

    public function incomingMessage(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from' => ['required', 'string'],
            'body' => ['required', 'string'],
            'wa_message_id' => ['nullable', 'string'],
            'timestamp' => ['required', 'date'],
        ]);

        $workspace = $this->defaultWorkspace();
        $account = WhatsAppAccount::where('workspace_id', $workspace->id)->first();
        $contactPhone = preg_replace('/@.*$/', '', $data['from']);

        $conversation = Conversation::firstOrCreate(
            ['workspace_id' => $workspace->id, 'contact_phone' => $contactPhone],
            ['whatsapp_account_id' => $account?->id, 'status' => 'open'],
        );

        $message = Message::create([
            'workspace_id' => $workspace->id,
            'conversation_id' => $conversation->id,
            'direction' => 'in',
            'body' => $data['body'],
            'wa_message_id' => $data['wa_message_id'] ?? null,
            'status' => 'delivered',
            'sent_at' => $data['timestamp'],
        ]);

        $conversation->forceFill([
            'last_message_at' => $data['timestamp'],
            'unread_count' => $conversation->unread_count + 1,
        ])->save();

        return response()->json(['data' => $message], 201);
    }
}
