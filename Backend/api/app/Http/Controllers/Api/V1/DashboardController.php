<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\Message;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class DashboardController extends Controller
{
    public function stats(Request $request): JsonResponse
    {
        $workspaceId = $request->user()->workspace_id;

        $conversations = Conversation::where('workspace_id', $workspaceId)->get([
            'id', 'status', 'assignee_id', 'unread_count', 'contact_name', 'contact_phone', 'created_at', 'last_message_at',
        ]);

        $totalConversations = $conversations->count();
        $openConversations = $conversations->where('status', 'open')->count();
        $closedConversations = $conversations->where('status', 'closed')->count();
        $unreadMessages = (int) $conversations->sum('unread_count');
        $newContacts = $conversations->where('created_at', '>=', now()->subDays(7))->count();
        $resolutionRate = $totalConversations > 0
            ? round(($closedConversations / $totalConversations) * 100, 1)
            : 0.0;

        $conversationsByStatus = $conversations->groupBy('status')
            ->map(fn ($group, $status) => ['status' => $status, 'count' => $group->count()])
            ->values();

        $since = now()->subDays(6)->startOfDay();
        $messages = Message::where('workspace_id', $workspaceId)
            ->where('sent_at', '>=', $since)
            ->get(['direction', 'sent_at']);

        $overview = collect(range(0, 6))->map(function (int $offset) use ($messages) {
            $day = now()->subDays(6 - $offset)->startOfDay();
            $dayMessages = $messages->filter(fn ($m) => Carbon::parse($m->sent_at)->isSameDay($day));

            return [
                'date' => $day->toDateString(),
                'incoming' => $dayMessages->where('direction', 'in')->count(),
                'outgoing' => $dayMessages->where('direction', 'out')->count(),
            ];
        })->values();

        $avgResponseSeconds = $this->averageResponseSeconds($workspaceId);

        $unassigned = $conversations->where('status', 'open')->whereNull('assignee_id')
            ->sortByDesc('last_message_at')
            ->take(5)
            ->values()
            ->map(fn ($c) => [
                'id' => $c->id,
                'contact_name' => $c->contact_name,
                'contact_phone' => $c->contact_phone,
                'last_message_at' => optional($c->last_message_at)->toIso8601String(),
            ]);

        return response()->json(['data' => [
            'total_conversations' => $totalConversations,
            'open_conversations' => $openConversations,
            'unread_messages' => $unreadMessages,
            'new_contacts' => $newContacts,
            'resolution_rate' => $resolutionRate,
            'avg_response_seconds' => $avgResponseSeconds,
            'conversations_by_status' => $conversationsByStatus,
            'conversations_overview' => $overview,
            'unassigned_conversations' => $unassigned,
        ]]);
    }

    private function averageResponseSeconds(int $workspaceId): ?int
    {
        $messages = Message::where('workspace_id', $workspaceId)
            ->orderBy('conversation_id')
            ->orderBy('sent_at')
            ->get(['conversation_id', 'direction', 'sent_at']);

        $samples = [];
        $pendingInboundAt = [];

        foreach ($messages as $message) {
            $conversationId = $message->conversation_id;

            if ($message->direction === 'in') {
                $pendingInboundAt[$conversationId] ??= Carbon::parse($message->sent_at);
                continue;
            }

            if (isset($pendingInboundAt[$conversationId])) {
                $samples[] = Carbon::parse($message->sent_at)->diffInSeconds($pendingInboundAt[$conversationId]);
                unset($pendingInboundAt[$conversationId]);
            }
        }

        if (empty($samples)) {
            return null;
        }

        return (int) round(array_sum($samples) / count($samples));
    }
}
