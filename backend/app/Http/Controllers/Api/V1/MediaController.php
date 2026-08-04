<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Message;
use App\Models\MessageMedia;
use App\Services\GatewayClient;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use RuntimeException;

/**
 * Proxies message media access to the gateway's signed-URL endpoint
 * (GatewayClient::mediaUrl). The frontend/agent never receives a raw MinIO
 * bucket URL or storage key directly - only a short-lived signed URL (or, in
 * local-disk dev mode, a path this controller streams itself) - and only
 * after this controller confirms the requesting user can view the
 * conversation the media belongs to (same `conversations.view` gate as the
 * rest of the conversation/message read surface).
 */
class MediaController extends Controller
{
    use ApiResponse;

    public function __construct(protected GatewayClient $gateway)
    {
    }

    /**
     * GET /api/v1/conversations/{conversation}/messages/{message}/media/{media}/url
     */
    public function url(Request $request, int $conversation, Message $message, MessageMedia $media)
    {
        if ($media->message_id !== $message->id) {
            return $this->error('Media does not belong to the given message.', null, 404);
        }

        if ($message->conversation_id !== $conversation) {
            return $this->error('Message does not belong to the given conversation.', null, 404);
        }

        $conversation = $message->conversation;
        if (! $conversation || $conversation->workspace_id !== $request->user()->workspace_id) {
            return $this->error('Conversation not found.', null, 404);
        }

        try {
            $result = $this->gateway->mediaUrl($media->id, $conversation->workspace_id);
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        return $this->success($result['data'] ?? null, 'OK');
    }
}
