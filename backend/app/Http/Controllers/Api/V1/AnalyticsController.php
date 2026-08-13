<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\Deal;
use App\Models\Lead;
use App\Models\Message;
use App\Models\Task;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Chart-data endpoints backing the frontend dashboard's Recharts panels. Gated on
 * analytics.view (see PermissionSeeder/RolePermissionSeeder for why this permission was
 * added beyond the original docs/07-permission-matrix.md table). Every series is a real
 * aggregate query; an empty/fresh workspace returns empty arrays, not sample data.
 *
 * Shared filters (all optional, all endpoints): from, to (date range, default last 30
 * days, same resolution as DashboardController), agent_user_id, status.
 */
class AnalyticsController extends Controller
{
    /** GET /api/v1/analytics/conversation-volume - new conversations per day in range. */
    public function conversationVolume(Request $request)
    {
        [$from, $to] = $this->range($request);

        return $this->cached($request, 'conversation-volume', $from, $to, function () use ($from, $to) {
            $counts = Conversation::query()
                ->whereBetween('created_at', [$from, $to])
                ->selectRaw('DATE(created_at) as day, count(*) as cnt')
                ->groupBy('day')
                ->pluck('cnt', 'day');

            return $this->fillDaily($from, $to, $counts);
        });
    }

    /** GET /api/v1/analytics/response-time-trend - avg response minutes per day (see DashboardController for the formula). */
    public function responseTimeTrend(Request $request)
    {
        [$from, $to] = $this->range($request);

        return $this->cached($request, 'response-time-trend', $from, $to, function () use ($from, $to) {
            $conversationIds = Conversation::query()
                ->whereHas('messages', fn ($q) => $q->whereBetween('sent_at', [$from, $to]))
                ->pluck('id');

            $byDay = [];

            if ($conversationIds->isNotEmpty()) {
                $grouped = Message::query()
                    ->whereIn('conversation_id', $conversationIds)
                    ->whereNotNull('sent_at')
                    ->orderBy('sent_at')
                    ->get(['conversation_id', 'direction', 'sent_at'])
                    ->groupBy('conversation_id');

                foreach ($grouped as $messages) {
                    $pendingInboundAt = null;
                    foreach ($messages as $message) {
                        if ($message->direction === 'inbound') {
                            $pendingInboundAt = $message->sent_at;
                        } elseif ($message->direction === 'outbound' && $pendingInboundAt !== null) {
                            $day = $message->sent_at->toDateString();
                            $byDay[$day][] = $pendingInboundAt->diffInMinutes($message->sent_at, true);
                            $pendingInboundAt = null;
                        }
                    }
                }
            }

            $series = [];
            foreach (CarbonPeriod::create($from, '1 day', $to) as $date) {
                $day = $date->toDateString();
                $values = $byDay[$day] ?? [];
                $series[] = [
                    'date' => $day,
                    'avg_response_minutes' => count($values) > 0 ? round(array_sum($values) / count($values), 2) : null,
                ];
            }

            return $series;
        });
    }

    /** GET /api/v1/analytics/lead-funnel - count of leads per status in range. */
    public function leadFunnel(Request $request)
    {
        [$from, $to] = $this->range($request);

        return $this->cached($request, 'lead-funnel', $from, $to, function () use ($from, $to, $request) {
            $query = Lead::query()->whereBetween('created_at', [$from, $to]);
            $this->applyOwner($query, $request, 'owner_user_id');

            $counts = $query->selectRaw('status, count(*) as cnt')->groupBy('status')->pluck('cnt', 'status');

            $statuses = ['new', 'contacted', 'qualified', 'disqualified', 'converted'];

            return collect($statuses)->map(fn ($status) => [
                'status' => $status,
                'count' => (int) ($counts[$status] ?? 0),
            ])->values()->all();
        });
    }

    /** GET /api/v1/analytics/pipeline-stage-distribution - open deal count+value per stage. */
    public function pipelineStageDistribution(Request $request)
    {
        [$from, $to] = $this->range($request);

        return $this->cached($request, 'pipeline-stage-distribution', $from, $to, function () use ($request) {
            $query = Deal::query()->with('stage')->where('status', 'open');
            $this->applyOwner($query, $request, 'owner_user_id');

            if ($request->filled('pipeline_id')) {
                $query->where('pipeline_id', $request->integer('pipeline_id'));
            }

            $deals = $query->get(['pipeline_stage_id', 'value_amount']);

            return $deals->groupBy('pipeline_stage_id')->map(function ($group) {
                $stage = $group->first()->stage;

                return [
                    'stage_id' => $stage?->id,
                    'stage_name' => $stage?->name ?? 'Unknown',
                    'count' => $group->count(),
                    'value' => (float) $group->sum('value_amount'),
                ];
            })->values()->all();
        });
    }

    /** GET /api/v1/analytics/won-vs-lost - won/lost deal counts+value per day in range. */
    public function wonVsLost(Request $request)
    {
        [$from, $to] = $this->range($request);

        return $this->cached($request, 'won-vs-lost', $from, $to, function () use ($from, $to, $request) {
            $query = Deal::query()
                ->whereIn('status', ['won', 'lost'])
                ->whereBetween('closed_at', [$from, $to]);
            $this->applyOwner($query, $request, 'owner_user_id');

            $rows = $query->selectRaw('DATE(closed_at) as day, status, count(*) as cnt, sum(value_amount) as val')
                ->groupBy('day', 'status')
                ->get();

            $byDay = [];
            foreach ($rows as $row) {
                $byDay[$row->day][$row->status] = ['count' => (int) $row->cnt, 'value' => (float) $row->val];
            }

            $series = [];
            foreach (CarbonPeriod::create($from, '1 day', $to) as $date) {
                $day = $date->toDateString();
                $series[] = [
                    'date' => $day,
                    'won_count' => $byDay[$day]['won']['count'] ?? 0,
                    'won_value' => $byDay[$day]['won']['value'] ?? 0.0,
                    'lost_count' => $byDay[$day]['lost']['count'] ?? 0,
                    'lost_value' => $byDay[$day]['lost']['value'] ?? 0.0,
                ];
            }

            return $series;
        });
    }

    /** GET /api/v1/analytics/agent-performance - conversations closed + tasks completed per agent, in range. */
    public function agentPerformance(Request $request)
    {
        [$from, $to] = $this->range($request);

        return $this->cached($request, 'agent-performance', $from, $to, function () use ($from, $to, $request) {
            $conversationQuery = Conversation::query()
                ->where('status', 'closed')
                ->whereBetween('closed_at', [$from, $to])
                ->whereNotNull('assigned_user_id');
            if ($request->filled('agent_user_id')) {
                $conversationQuery->where('assigned_user_id', $request->integer('agent_user_id'));
            }
            $conversationsHandled = $conversationQuery
                ->selectRaw('assigned_user_id as user_id, count(*) as cnt')
                ->groupBy('assigned_user_id')
                ->pluck('cnt', 'user_id');

            $taskQuery = Task::query()
                ->where('status', 'done')
                ->whereBetween('completed_at', [$from, $to])
                ->whereNotNull('assignee_id');
            if ($request->filled('agent_user_id')) {
                $taskQuery->where('assignee_id', $request->integer('agent_user_id'));
            }
            $tasksCompleted = $taskQuery
                ->selectRaw('assignee_id as user_id, count(*) as cnt')
                ->groupBy('assignee_id')
                ->pluck('cnt', 'user_id');

            $userIds = collect($conversationsHandled->keys())->merge($tasksCompleted->keys())->unique();

            return User::query()->whereIn('id', $userIds)->get(['id', 'name'])->map(fn ($user) => [
                'user_id' => $user->id,
                'name' => $user->name,
                'conversations_handled' => (int) ($conversationsHandled[$user->id] ?? 0),
                'tasks_completed' => (int) ($tasksCompleted[$user->id] ?? 0),
            ])->values()->all();
        });
    }

    /** GET /api/v1/analytics/task-completion-rate - completed vs total tasks due in range. */
    public function taskCompletionRate(Request $request)
    {
        [$from, $to] = $this->range($request);

        return $this->cached($request, 'task-completion-rate', $from, $to, function () use ($from, $to, $request) {
            $query = Task::query()->whereBetween('created_at', [$from, $to]);
            if ($request->filled('agent_user_id')) {
                $query->where('assignee_id', $request->integer('agent_user_id'));
            }

            $total = (clone $query)->count();
            $completed = (clone $query)->where('status', 'done')->count();

            return [
                'total' => $total,
                'completed' => $completed,
                'rate_percent' => $total > 0 ? round(($completed / $total) * 100, 2) : 0.0,
            ];
        });
    }

    private function range(Request $request): array
    {
        $to = $request->filled('to') ? Carbon::parse($request->string('to')->toString())->endOfDay() : now()->endOfDay();
        $from = $request->filled('from') ? Carbon::parse($request->string('from')->toString())->startOfDay() : $to->copy()->subDays(29)->startOfDay();

        return [$from, $to];
    }

    private function applyOwner($query, Request $request, string $column): void
    {
        if ($request->filled('agent_user_id')) {
            $query->where($column, $request->integer('agent_user_id'));
        }
    }

    private function fillDaily(Carbon $from, Carbon $to, $counts): array
    {
        $series = [];
        foreach (CarbonPeriod::create($from, '1 day', $to) as $date) {
            $day = $date->toDateString();
            $series[] = ['date' => $day, 'count' => (int) ($counts[$day] ?? 0)];
        }

        return $series;
    }

    private function cached(Request $request, string $name, Carbon $from, Carbon $to, \Closure $resolver)
    {
        $workspaceId = $request->user()->workspace_id;
        $key = "analytics:{$name}:{$workspaceId}:".md5($request->getQueryString() ?? '').":{$from->timestamp}:{$to->timestamp}";

        $data = Cache::remember($key, 30, $resolver);

        return $this->success($data, 'OK');
    }
}
