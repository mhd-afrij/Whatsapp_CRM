<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\Message;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ReportController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $workspaceId = $request->user()->workspace_id;

        $totalConversations = Conversation::where('workspace_id', $workspaceId)->count();
        $openConversations = Conversation::where('workspace_id', $workspaceId)->where('status', 'open')->count();
        $closedConversations = Conversation::where('workspace_id', $workspaceId)->where('status', 'closed')->count();

        $totalMessages = Message::where('workspace_id', $workspaceId)->count();
        $incomingMessages = Message::where('workspace_id', $workspaceId)->where('direction', 'in')->count();
        $outgoingMessages = Message::where('workspace_id', $workspaceId)->where('direction', 'out')->count();

        $resolutionRate = $totalConversations > 0
            ? round(($closedConversations / $totalConversations) * 100, 1)
            : 0.0;

        return response()->json(['data' => [
            'conversations' => [
                'total' => $totalConversations,
                'open' => $openConversations,
                'closed' => $closedConversations,
                'resolution_rate' => $resolutionRate,
            ],
            'messages' => [
                'total' => $totalMessages,
                'incoming' => $incomingMessages,
                'outgoing' => $outgoingMessages,
            ],
        ]]);
    }
}
