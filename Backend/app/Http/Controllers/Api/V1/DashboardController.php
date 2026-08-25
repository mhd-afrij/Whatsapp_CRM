<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Deal;
use App\Models\Message;
use App\Models\Task;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Phase 13 (docs/08-implementation-roadmap.md calls this "Phase 14 - Dashboard &
 * Analytics"; the roadmap's own Phase 13 - global search/saved filters - was already built
 * in an earlier pass, see PROJECT_STATUS.md).
 *
 * Every metric here is a real Eloquent/query-builder aggregate over the workspace's actual
 * rows (BelongsToWorkspace global scope on every model queried, so no manual workspace_id
 * filtering is needed for Eloquent queries). A fresh workspace with no data returns zeros,
 * never fabricated numbers.
 */
class DashboardController extends Controller
{
    /**
     * GET /api/v1/dashboard/summary?from=&to=
     *
     * Gated on dashboard.view_workspace (route middleware) - a workspace-wide aggregate
     * view, distinct from the per-record "Own" visibility used elsewhere in the app.
     */
    public function summary(Request $request)
    {
        [$from, $to] = $this->resolveRange($request);
        $workspaceId = $request->user()->workspace_id;

        $cacheKey = "dashboard:summary:{$workspaceId}:{$from->timestamp}:{$to->timestamp}";

        $data = Cache::remember($cacheKey, 30, function () use ($from, $to) {
            $newConversations = Conversation::query()
                ->whereBetween('created_at', [$from, $to])
                ->count();

            $openConversations = Conversation::query()->where('status', 'open')->count();
            $closedConversations = Conversation::query()
                ->where('status', 'closed')
                ->whereBetween('closed_at', [$from, $to])
                ->count();
            $unassignedConversations = Conversation::query()
                ->where('status', 'open')
                ->whereNull('assigned_user_id')
                ->count();

            $responseTimes = $this->responseTimeAverages($from, $to);

            $newContacts = Contact::query()->whereBetween('created_at', [$from, $to])->count();

            $pipelineValue = (float) Deal::query()->where('status', 'open')->sum('value_amount');
            $wonDealValue = (float) Deal::query()
                ->where('status', 'won')
                ->whereBetween('closed_at', [$from, $to])
                ->sum('value_amount');
            $lostDealsCount = Deal::query()
                ->where('status', 'lost')
                ->whereBetween('closed_at', [$from, $to])
                ->count();

            $overdueTasksCount = Task::query()
                ->where('status', '!=', 'done')
                ->whereNotNull('due_at')
                ->where('due_at', '<', now())
                ->count();

            $agentWorkload = $this->agentWorkload();

            return [
                'range' => ['from' => $from->toIso8601String(), 'to' => $to->toIso8601String()],
                'conversations' => [
                    'new' => $newConversations,
                    'open' => $openConversations,
                    'closed' => $closedConversations,
                    'unassigned' => $unassignedConversations,
                ],
                'response_time' => $responseTimes,
                'contacts' => ['new' => $newContacts],
                'deals' => [
                    'pipeline_value' => $pipelineValue,
                    'won_value' => $wonDealValue,
                    'lost_count' => $lostDealsCount,
                ],
                'tasks' => ['overdue' => $overdueTasksCount],
                'agent_workload' => $agentWorkload,
            ];
        });

        return $this->success($data, 'OK');
    }

    /**
     * Response-time metrics are a best-effort approximation, not an exact SLA measurement:
     * there is no dedicated "conversation started"/"agent responded" event table, only the
     * gateway-owned `messages.sent_at` + `direction` columns. Formula used:
     *
     *  - For every conversation with at least one inbound message in range, walk its messages
     *    in chronological order. Each time an inbound message is immediately followed (later
     *    in the ordered list, no other inbound message between) by an outbound message, that
     *    gap (outbound.sent_at - inbound.sent_at) counts as one "response".
     *  - avg_first_response_minutes = average of only the FIRST such gap per conversation
     *    (i.e. time from the conversation's first inbound message to the first agent reply).
     *  - avg_response_minutes = average of ALL such gaps across all conversations (every
     *    inbound message's reply latency, not just the first).
     *  - Conversations with no reply yet, or with only inbound/only outbound messages, are
     *    excluded from both averages (no gap to measure) - this undercounts "how many
     *    conversations are still unanswered" on purpose, since that is already surfaced
     *    separately by `unassigned`/`open` counts.
     *
     * Computed in PHP over messages fetched for conversations touched in the date range
     * (not a SQL window function), matching the precedent set by
     * `SearchController::index()` choosing simplicity over a fully optimized query for a
     * feature not yet proven to need it at this data volume - documented, not silent.
     */
    private function responseTimeAverages(Carbon $from, Carbon $to): array
    {
        $conversationIds = Conversation::query()
            ->whereHas('messages', fn ($q) => $q->whereBetween('sent_at', [$from, $to]))
            ->pluck('id');

        if ($conversationIds->isEmpty()) {
            return ['avg_first_response_minutes' => null, 'avg_response_minutes' => null, 'sample_size' => 0];
        }

        $messagesByConversation = Message::query()
            ->whereIn('conversation_id', $conversationIds)
            ->whereNotNull('sent_at')
            ->orderBy('sent_at')
            ->get(['conversation_id', 'direction', 'sent_at'])
            ->groupBy('conversation_id');

        $firstResponseMinutes = [];
        $allResponseMinutes = [];

        foreach ($messagesByConversation as $messages) {
            $pendingInboundAt = null;
            $isFirst = true;

            foreach ($messages as $message) {
                if ($message->direction === 'inbound') {
                    $pendingInboundAt = $message->sent_at;
                } elseif ($message->direction === 'outbound' && $pendingInboundAt !== null) {
                    $minutes = $pendingInboundAt->diffInMinutes($message->sent_at, true);
                    $allResponseMinutes[] = $minutes;
                    if ($isFirst) {
                        $firstResponseMinutes[] = $minutes;
                        $isFirst = false;
                    }
                    $pendingInboundAt = null;
                }
            }
        }

        return [
            'avg_first_response_minutes' => count($firstResponseMinutes) > 0
                ? round(array_sum($firstResponseMinutes) / count($firstResponseMinutes), 2)
                : null,
            'avg_response_minutes' => count($allResponseMinutes) > 0
                ? round(array_sum($allResponseMinutes) / count($allResponseMinutes), 2)
                : null,
            'sample_size' => count($allResponseMinutes),
        ];
    }

    /** Open conversations + open tasks currently assigned to each workspace user. */
    private function agentWorkload(): array
    {
        $users = User::query()->where('is_active', true)->get(['id', 'name']);

        $openConversationsByUser = Conversation::query()
            ->where('status', 'open')
            ->whereNotNull('assigned_user_id')
            ->selectRaw('assigned_user_id, count(*) as cnt')
            ->groupBy('assigned_user_id')
            ->pluck('cnt', 'assigned_user_id');

        $openTasksByUser = Task::query()
            ->where('status', '!=', 'done')
            ->whereNotNull('assignee_id')
            ->selectRaw('assignee_id, count(*) as cnt')
            ->groupBy('assignee_id')
            ->pluck('cnt', 'assignee_id');

        return $users->map(fn ($user) => [
            'user_id' => $user->id,
            'name' => $user->name,
            'open_conversations' => (int) ($openConversationsByUser[$user->id] ?? 0),
            'open_tasks' => (int) ($openTasksByUser[$user->id] ?? 0),
        ])->values()->all();
    }

    /** Shared by AnalyticsController - default last 30 days, inclusive of `to`'s full day. */
    public static function resolveRangeStatic(Request $request): array
    {
        return (new self)->resolveRange($request);
    }

    private function resolveRange(Request $request): array
    {
        $to = $request->filled('to') ? Carbon::parse($request->string('to')->toString())->endOfDay() : now()->endOfDay();
        $from = $request->filled('from') ? Carbon::parse($request->string('from')->toString())->startOfDay() : $to->copy()->subDays(29)->startOfDay();

        return [$from, $to];
    }
}
