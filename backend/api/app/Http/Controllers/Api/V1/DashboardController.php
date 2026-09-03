<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Conversation;
use App\Models\Lead;
use App\Models\Message;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

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

        $activeAgents = $conversations->where('status', 'open')->whereNotNull('assignee_id')
            ->pluck('assignee_id')->unique()->count();

        $overdueTasks = Task::where('workspace_id', $workspaceId)
            ->where('due_at', '<', now())
            ->where('status', '!=', 'completed')
            ->count();

        $leadsByStage = Lead::where('workspace_id', $workspaceId)
            ->select('stage', DB::raw('count(*) as count'))
            ->groupBy('stage')
            ->get()
            ->map(fn ($row) => ['stage' => $row->stage, 'count' => $row->count]);

        return response()->json(['data' => [
            'total_conversations' => $totalConversations,
            'open_conversations' => $openConversations,
            'unread_messages' => $unreadMessages,
            'new_contacts' => $newContacts,
            'resolution_rate' => $resolutionRate,
            'avg_response_seconds' => $avgResponseSeconds,
            'active_agents' => $activeAgents,
            'overdue_tasks' => $overdueTasks,
            'conversations_by_status' => $conversationsByStatus,
            'conversations_overview' => $overview,
            'unassigned_conversations' => $unassigned,
            'leads_by_stage' => $leadsByStage,
        ]]);
    }

    public function agentPerformance(Request $request): JsonResponse
    {
        $workspaceId = $request->user()->workspace_id;

        $conversations = Conversation::where('workspace_id', $workspaceId)
            ->whereNotNull('assignee_id')
            ->select('assignee_id', 'status', 'created_at', 'last_message_at')
            ->get();

        $agentStats = $conversations->groupBy('assignee_id')->map(function ($convos, $agentId) {
            $total = $convos->count();
            $resolved = $convos->where('status', 'closed')->count();

            return [
                'agent_id' => $agentId,
                'conversations_handled' => $total,
                'conversations_resolved' => $resolved,
                'resolution_rate' => $total > 0 ? round(($resolved / $total) * 100, 1) : 0.0,
            ];
        })->values();

        $agentIds = $agentStats->pluck('agent_id')->toArray();

        $messageCounts = Message::where('workspace_id', $workspaceId)
            ->whereIn('conversation_id', function ($query) use ($workspaceId) {
                $query->select('id')
                    ->from('conversations')
                    ->where('workspace_id', $workspaceId)
                    ->whereNotNull('assignee_id');
            })
            ->select('conversation_id', 'direction', DB::raw('count(*) as count'))
            ->groupBy('conversation_id', 'direction')
            ->get();

        $convosByAgent = Conversation::where('workspace_id', $workspaceId)
            ->whereIn('assignee_id', $agentIds)
            ->pluck('assignee_id', 'id');

        $messagesByAgent = $messageCounts->groupBy(function ($mc) use ($convosByAgent) {
            return $convosByAgent[$mc->conversation_id] ?? null;
        })->filter()->map(function ($mcs, $agentId) {
            $outgoing = $mcs->where('direction', 'out')->sum('count');
            return ['messages_sent' => (int) $outgoing];
        });

        $agentStats = $agentStats->map(function ($stat) use ($messagesByAgent) {
            $stat['messages_sent'] = $messagesByAgent[$stat['agent_id']]['messages_sent'] ?? 0;
            return $stat;
        });

        $users = \App\Models\User::whereIn('id', $agentIds)
            ->get(['id', 'name', 'email', 'avatar_path'])
            ->keyBy('id');

        $agentStats = $agentStats->map(function ($stat) use ($users) {
            $user = $users[$stat['agent_id']] ?? null;
            $stat['name'] = $user?->name ?? 'Unknown';
            $stat['email'] = $user?->email ?? '';
            $stat['avatar_path'] = $user?->avatar_path;
            return $stat;
        });

        return response()->json(['data' => $agentStats->sortByDesc('conversations_resolved')->values()]);
    }

    public function messageVolumeTimeSeries(Request $request): JsonResponse
    {
        $workspaceId = $request->user()->workspace_id;
        $period = $request->input('period', '7d');

        $days = match ($period) {
            '30d' => 30,
            '90d' => 90,
            default => 7,
        };

        $since = now()->subDays($days - 1)->startOfDay();
        $messages = Message::where('workspace_id', $workspaceId)
            ->where('sent_at', '>=', $since)
            ->get(['direction', 'sent_at']);

        $data = collect(range(0, $days - 1))->map(function (int $offset) use ($messages) {
            $day = now()->subDays($days - 1 - $offset)->startOfDay();
            $dayMessages = $messages->filter(fn ($m) => Carbon::parse($m->sent_at)->isSameDay($day));

            return [
                'date' => $day->toDateString(),
                'incoming' => $dayMessages->where('direction', 'in')->count(),
                'outgoing' => $dayMessages->where('direction', 'out')->count(),
            ];
        })->values();

        return response()->json(['data' => $data]);
    }

    public function conversionFunnel(Request $request): JsonResponse
    {
        $workspaceId = $request->user()->workspace_id;

        $stages = Lead::where('workspace_id', $workspaceId)
            ->select('stage', DB::raw('count(*) as count'), DB::raw('COALESCE(SUM(value), 0) as total_value'))
            ->groupBy('stage')
            ->get()
            ->sortBy(function ($row) {
                return array_search($row->stage, ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost']);
            })
            ->values();

        return response()->json(['data' => $stages]);
    }

    public function recentActivity(Request $request): JsonResponse
    {
        $workspaceId = $request->user()->workspace_id;

        $logs = AuditLog::where('workspace_id', $workspaceId)
            ->with('user:id,name,email')
            ->orderByDesc('created_at')
            ->limit(20)
            ->get();

        return response()->json(['data' => $logs]);
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
