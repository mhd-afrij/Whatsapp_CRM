<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\MessageMedia;
use App\Services\GatewayClient;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use RuntimeException;

/**
 * Proxies message media access to the gateway's signed-URL endpoint
 * (GatewayClient::mediaUrl). The frontend/agent never receives a raw MinIO
 * bucket URL or storage key directly - only a short-lived signed URL (or, in
 * local-disk dev mode, a path this controller streams itself) - and only
 * after this controller confirms the requesting user can view the
 * conversation the media belongs to (same `conversations.view` gate as the
 * rest of the conversation/message read surface).
 *
 * `store` (added for outbound media) uploads an agent-attached file to the
 * gateway's object storage and returns the storage key + metadata the
 * frontend then passes as `media` when dispatching the message via
 * ConversationController::storeMessage.
 */
class MediaController extends Controller
{
    use ApiResponse;

    /** Matches the gateway's MEDIA_ALLOWED_MIME_TYPES allow-list (see whatsapp-gateway/src/config/env.ts). */
    private const ALLOWED_MIME_TYPES = [
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'video/mp4', 'video/3gpp',
        'audio/ogg', 'audio/mpeg', 'audio/mp4',
        'application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    /** Matches the gateway's MEDIA_MAX_SIZE_BYTES default (25 MB). */
    private const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

    public function __construct(protected GatewayClient $gateway) {}

    /**
     * POST /api/v1/conversations/{conversation}/media
     * Validates an agent-attached file and stores it via the gateway. Returns
     * the storage key + metadata needed to attach it to an outbound message;
     * the raw bucket/storage path is never exposed to the frontend beyond
     * what it must echo back as `media.storage_path` when sending.
     */
    public function store(Request $request, Conversation $conversation)
    {
        $this->authorize('reply', $conversation);

        $validator = Validator::make($request->all(), [
            'file' => [
                'required',
                'file',
                'max:'.(int) (self::MAX_MEDIA_BYTES / 1024),
                'mimetypes:'.implode(',', self::ALLOWED_MIME_TYPES),
            ],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $file = $request->file('file');

        try {
            $result = $this->gateway->uploadMedia(
                $conversation->workspace_id,
                (string) $file->getRealPath(),
                (string) $file->getClientOriginalName(),
                (string) $file->getMimeType(),
            );
        } catch (RuntimeException $e) {
            return $this->failure($e->getMessage(), 'gateway_unreachable', 502);
        }

        return $this->success($result, 'Media uploaded', null, 201);
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
