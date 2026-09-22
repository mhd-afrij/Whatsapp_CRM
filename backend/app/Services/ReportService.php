<?php

namespace App\Services;

use App\Models\AnalyticsSetting;
use App\Models\Conversation;
use App\Models\Deal;
use App\Models\Message;
use App\Models\Task;
use App\Models\User;
use Carbon\Carbon;
use Carbon\CarbonPeriod;
use Illuminate\Database\Eloquent\Builder;

/**
 * Unified analytics engine behind the Reports module (GET /reports/overview and
 * the report export jobs). One snapshot() call resolves EVERY panel on the Reports
 * dashboard - KPI strip, weekly revenue, deal outcomes, task completion, response
 * speed, agent leaderboard and the paginated daily table - from real aggregate
 * queries over the workspace's data, so a fresh/empty workspace returns zeros and
 * empty series, never fabricated numbers.
 *
 * Definitions (consistent with DashboardController/AnalyticsController where they
 * share a metric):
 *  - conversations: rows created in the period (created_at).
 *  - won/lost: deals closed (closed_at) in the period with status won/lost.
 *  - win_rate:     won / (won + lost) as a percentage over the period.
 *  - avg_response: mean FIRST response gap per conversation (inbound message ->
 *    next outbound message, both within the period) - the FRT definition used by
 *    the dashboard's "first reply speed" metric, distinct from the all-gaps
 *    estimate AnalyticsController::responseTimeTrend exposes on the legacy
 *    endpoints (which are untouched).
 *  - response buckets: each conversation with inbound activity in the period is
 *    bucketed by its first-response time (<5m / 5-15m / 15-60m / >1h) or counted
 *    as "No reply yet" when it received inbound but the agent never replied.
 *  - tasks: created in the period; completed = status done; overdue = not done
 *    with due_at < now.
 *  - leaderboard rows are limited to agents with actual activity in the period
 *    (matching the legacy AnalyticsController::agentPerformance behaviour).
 *
 * Filtering:
 *  - whatsapp_account_id scopes conversation-driven sections directly and
 *    deal/task sections via their contact/conversation linkage (a deal is
 *    attributed to an account when any conversation for its contact ran on that
 *    account; a deal whose contact has NO conversation is excluded when an
 *    account filter is set - strict, unambiguous attribution over approximation).
 *  - agent scoping follows the report visibility claim (reports.view_all_agents).
 *    When the requesting user cannot view all agents, every agent-scoped
 *    series is forced to the user themself.
 *  - report preferences include_weekends (excludes Sat/Sun from the daily table
 *    in the workspace's analytics timezone) and compare_previous (defaults the
 *    period-over-period comparison on).
 */
class ReportService
{
    /** Response buckets (seconds) - labels match the frontend's response-speed panel. */
    public const RESPONSE_BUCKETS = [
        'fast' => ['max_minutes' => 5, 'label' => 'Under 5 min'],
        'normal' => ['max_minutes' => 15, 'label' => '5 – 15 min'],
        'slow' => ['max_minutes' => 60, 'label' => '15 – 60 min'],
        'at_risk' => ['max_minutes' => INF, 'label' => 'Over 1 hour'],
    ];

    public const DAILY_PER_PAGE = 7;

    /**
     * Full overview envelope for the authenticated user (claim-aware).
     *
     * @param  User  $user  authenticated user (workspace + visibility claim)
     * @param  array  $filters  range|from|to|agent_user_id|whatsapp_account_id|compare|page
     */
    public function overview(User $user, array $filters = []): array
    {
        $settings = $this->settingsFor($user->workspace_id);
        $preferences = $this->preferencesFor($settings);

        if (! $settings->analytics_enabled) {
            return [
                'tracked' => false,
                'unavailable_reason' => 'analytics_disabled',
            ];
        }

        $claim = $user->isSuperAdmin() || $user->hasPermission('reports.view_all_agents') ? 'ALL' : 'OWN';

        // OWN claims force the report to the user themself; they may not filter by
        // another agent (the request filter is overwritten, never leaked).
        $agentUserId = $claim === 'OWN'
            ? $user->id
            : (isset($filters['agent_user_id']) ? (int) $filters['agent_user_id'] : null);

        $accountId = isset($filters['whatsapp_account_id']) && $filters['whatsapp_account_id'] !== ''
            ? (int) $filters['whatsapp_account_id']
            : null;

        [$from, $to] = $this->resolvePeriod($filters);
        $compare = array_key_exists('compare', $filters) ? (bool) $filters['compare'] : (bool) ($preferences['compare_previous'] ?? true);

        $current = $this->snapshot($from, $to, $user->workspace_id, $agentUserId, $accountId, $settings, true);

        $comparisonPeriod = null;
        $previous = null;
        if ($compare) {
            $prev = $this->previousWindow($from, $to);
            // Subtract one day from the current start so the previous window length
            // matches the current one exactly (e.g. 30d -> 30 rows).
            $comparisonPeriod = [
                'from' => $prev['from']->toDateString(),
                'to' => $prev['to']->toDateString(),
            ];
            $previous = $this->snapshot($prev['from'], $prev['to'], $user->workspace_id, $agentUserId, $accountId, $settings, false);

            // An all-zero previous window means "nothing to compare against" - surface
            // previous/change as null instead of a misleading 0 / -100%.
            if ($this->snapshotIsEmpty($previous)) {
                $previous = null;
            }
        }

        return [
            'tracked' => true,
            'claim' => $claim,
            'range' => $filters['range'] ?? $this->rangeFor($settings),
            'period' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'timezone' => $settings->timezone,
            ],
            'comparison_period' => $comparisonPeriod,
            'metrics' => $this->metrics($current, $previous),
            'weekly_revenue' => $this->weeklyRevenue($current['deals_by_day'], $settings),
            'deal_outcomes' => $current['deal_outcomes'],
            'task_completion' => $current['tasks'],
            'response_speed' => $current['response_speed'],
            'leaderboard' => $current['leaderboard'],
            'daily_breakdown' => $this->paginatedDaily($current['daily_series'], $preferences, $settings->timezone, isset($filters['page']) ? (int) $filters['page'] : 1),
        ];
    }

    // ── Envelope assembly ───────────────────────────────────────────────────

    /**
     * Data needed by the export jobs (daily_metrics / agent_summary / full_pdf).
     * Same claim + period resolution as overview(), but the daily series is the
     * FULL unfiltered-of-pagination list and the workspace currency/timezone are
     * attached for the PDF report. Returns the raw snapshot, not paginated.
     */
    public function exportData(User $user, array $filters = []): array
    {
        $settings = $this->settingsFor($user->workspace_id);
        $preferences = $this->preferencesFor($settings);

        $claim = $user->isSuperAdmin() || $user->hasPermission('reports.view_all_agents') ? 'ALL' : 'OWN';
        $agentUserId = $claim === 'OWN' ? $user->id : (isset($filters['agent_user_id']) ? (int) $filters['agent_user_id'] : null);
        $accountId = isset($filters['whatsapp_account_id']) && $filters['whatsapp_account_id'] !== '' ? (int) $filters['whatsapp_account_id'] : null;
        [$from, $to] = $this->resolvePeriod($filters);
        $compare = array_key_exists('compare', $filters) ? (bool) $filters['compare'] : (bool) ($preferences['compare_previous'] ?? true);

        $current = $this->snapshot($from, $to, $user->workspace_id, $agentUserId, $accountId, $settings, true);

        $previous = null;
        if ($compare) {
            $prev = $this->previousWindow($from, $to);
            $previous = $this->snapshot($prev['from'], $prev['to'], $user->workspace_id, $agentUserId, $accountId, $settings, false);

            if ($this->snapshotIsEmpty($previous)) {
                $previous = null;
            }
        }

        return [
            'claim' => $claim,
            'range' => $filters['range'] ?? $this->rangeFor($settings),
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString(), 'timezone' => $settings->timezone],
            'metrics' => $this->metrics($current, $previous),
            'weekly_revenue' => $this->weeklyRevenue($current['deals_by_day'], $settings),
            'deal_outcomes' => $current['deal_outcomes'],
            'task_completion' => $current['tasks'],
            'response_speed' => $current['response_speed'],
            'leaderboard' => $current['leaderboard'],
            'daily_series' => $this->excludeWeekends($current['daily_series'], $preferences, $settings->timezone),
            'settings' => [
                'currency' => $settings->currency,
                'timezone' => $settings->timezone,
                'date_format' => $settings->date_format,
                'week_starts_on_monday' => $settings->week_starts_on_monday,
            ],
        ];
    }

    // ── Envelope assembly ───────────────────────────────────────────────────

    /** True when a snapshot carries no tracked activity at all (empty comparison window). */
    private function snapshotIsEmpty(array $snapshot): bool
    {
        return $snapshot['conversations'] == 0
            && $snapshot['won_count'] == 0
            && $snapshot['lost_count'] == 0
            && ($snapshot['tasks']['total'] ?? 0) == 0
            && $snapshot['avg_response_minutes'] === null;
    }

    private function metrics(array $current, ?array $previous): array
    {
        $prev = fn (string $key) => $previous[$key] ?? null;

        return [
            'conversations' => $this->metric($current['conversations'], $prev('conversations'), false),
            'won_value' => $this->metric($current['won_value'], $prev('won_value'), false),
            'won_count' => $this->countMetric($current['won_count'], $prev('won_count'), false),
            'lost_value' => $this->metric($current['lost_value'], $prev('lost_value'), true),
            'lost_count' => $this->countMetric($current['lost_count'], $prev('lost_count'), true),
            'win_rate' => $this->rateMetric($current['win_rate'], $prev('win_rate')),
            'avg_response_minutes' => $this->metric($current['avg_response_minutes'], $prev('avg_response_minutes'), true),
            'task_completion_rate' => $this->rateMetric($current['tasks']['rate_percent'], $prev('tasks')['rate_percent'] ?? null),
        ];
    }

    /** Count metric: keeps integer types end-to-end (value/previous stay int, change is a percent). */
    private function countMetric(int $current, mixed $previous, bool $lowerIsBetter): array
    {
        return [
            'value' => $current,
            'previous' => is_numeric($previous) ? (int) $previous : null,
            'lower_is_better' => $lowerIsBetter,
            'change' => $this->percentChange((float) $current, is_numeric($previous) ? (float) $previous : null),
        ];
    }

    /** Percent metric: change = ((cur-prev)/prev)*100. Null previous/null current -> null. */
    private function metric(?float $current, ?float $previous, bool $lowerIsBetter): array
    {
        return [
            'value' => $current,
            'previous' => $previous,
            'lower_is_better' => $lowerIsBetter,
            'change' => $this->percentChange($current, $previous),
        ];
    }

    /** Rate metric (win rate / task completion): change is a PERCENTAGE-POINT delta. */
    private function rateMetric(?float $current, ?float $previous): array
    {
        return [
            'value' => $current,
            'previous' => $previous,
            'lower_is_better' => false,
            'change' => $current !== null && $previous !== null ? round($current - $previous, 2) : null,
        ];
    }

    private function percentChange(?float $current, ?float $previous): ?float
    {
        if ($current === null || $previous === null || $previous == 0.0) {
            return null;
        }

        return round((($current - $previous) / $previous) * 100, 2);
    }

    private function dealOutcomes(int $wonCount, float $wonValue, int $lostCount, float $lostValue, int $openCount, float $openValue): array
    {
        $total = $wonCount + $lostCount + $openCount;

        // pct is each slice's share of CLOSED deals only (won / (won + lost)), keeping it
        // consistent with the win_rate KPI; the open slice carries no percentage.
        $closedPct = fn (int $count) => ($wonCount + $lostCount) > 0 ? round(($count / ($wonCount + $lostCount)) * 100, 1) : 0.0;
        $zeroPct = fn () => 0.0;

        return [
            'total' => $total,
            'won' => ['count' => $wonCount, 'value' => $wonValue, 'pct' => $closedPct($wonCount)],
            'lost' => ['count' => $lostCount, 'value' => $lostValue, 'pct' => $closedPct($lostCount)],
            'open' => ['count' => $openCount, 'value' => $openValue, 'pct' => $zeroPct()],
        ];
    }

    // ── Full period snapshot ───────────────────────────────────────────────

    /**
     * Aggregate every section for one period. $full=false skips the expensive
     * ledgers (deals_by_day, response distribution, leaderboard) and is used for the
     * previous-period comparison, which only needs the KPI numbers.
     *
     * @return array<string, mixed>
     */
    private function snapshot(Carbon $from, Carbon $to, int $workspaceId, ?int $agentUserId, ?int $accountId, AnalyticsSetting $settings, bool $full): array
    {
        $dealData = $this->dealData($from, $to, $workspaceId, $agentUserId, $accountId);
        $wonValue = 0.0;
        $lostValue = 0.0;
        $wonCount = 0;
        $lostCount = 0;
        foreach ($dealData['by_day'] as $day) {
            $wonValue += (float) ($day['won']['value'] ?? 0);
            $lostValue += (float) ($day['lost']['value'] ?? 0);
            $wonCount += (int) ($day['won']['count'] ?? 0);
            $lostCount += (int) ($day['lost']['count'] ?? 0);
        }

        $conversations = Conversation::query()
            ->whereBetween('created_at', [$from, $to])
            ->when($agentUserId, fn (Builder $q) => $q->where('assigned_user_id', $agentUserId))
            ->when($accountId, fn (Builder $q) => $q->where('whatsapp_account_id', $accountId))
            ->count();

        $tasks = $this->taskStats($from, $to, $workspaceId, $agentUserId, $accountId);

        $response = null;
        if ($full) {
            $response = $this->responseWalk($from, $to, $workspaceId, $agentUserId, $accountId);
        }

        $snapshot = [
            'conversations' => (float) $conversations,
            'won_value' => round($wonValue, 2),
            'won_count' => $wonCount,
            'lost_value' => round($lostValue, 2),
            'lost_count' => $lostCount,
            'win_rate' => $wonCount + $lostCount > 0 ? round(($wonCount / ($wonCount + $lostCount)) * 100, 2) : null,
            'avg_response_minutes' => $response ? $response['avg_response_minutes'] : null,
            'tasks' => $tasks,
            'deals_by_day' => $full ? $dealData['by_day'] : [],
            'deal_outcomes' => $this->dealOutcomes($wonCount, $wonValue, $lostCount, $lostValue, $dealData['open']['count'], $dealData['open']['value']),
            'response_speed' => $full ? $this->responseSpeed($response) : null,
            'leaderboard' => $full ? $this->leaderboard($from, $to, $workspaceId, $agentUserId, $accountId, $response) : [],
            'daily_series' => $full ? $this->dailySeries($from, $to, $workspaceId, $agentUserId, $accountId, $dealData, $response) : [],
        ];

        return $snapshot;
    }

    // ── Deals (won/lost by day + open snapshot) ────────────────────────────

    /**
     * @return array{by_day: array<string, array{won: array{count:int,value:float}, lost: array{count:int,value:float}}>, open: array{count:int,value:float,pct:float}}
     */
    private function dealData(Carbon $from, Carbon $to, int $workspaceId, ?int $agentUserId, ?int $accountId): array
    {
        $query = Deal::query()
            ->whereIn('status', ['won', 'lost'])
            ->whereBetween('closed_at', [$from, $to]);
        $this->scopeAgent($query, $agentUserId, 'owner_user_id');
        $this->scopeAccountToDeal($query, $workspaceId, $accountId);

        $byDay = [];
        foreach ($query->selectRaw('DATE(closed_at) as day, status, count(*) as cnt, sum(value_amount) as val')->groupBy('day', 'status')->get() as $row) {
            $byDay[$row->day][$row->status] = ['count' => (int) $row->cnt, 'value' => (float) $row->val];
        }

        // Current open pipeline (snapshot, not period-scoped) - the donut's third slice.
        $openQuery = Deal::query()->where('status', 'open');
        $this->scopeAgent($openQuery, $agentUserId, 'owner_user_id');
        $this->scopeAccountToDeal($openQuery, $workspaceId, $accountId);
        $openCount = (clone $openQuery)->count();
        $openValue = (float) (clone $openQuery)->sum('value_amount');

        return [
            'by_day' => $byDay,
            'open' => ['count' => $openCount, 'value' => round($openValue, 2), 'pct' => 0.0],
        ];
    }

    private function scopeAccountToDeal(Builder $query, int $workspaceId, ?int $accountId): void
    {
        if ($accountId === null) {
            return;
        }

        // Attribution: a deal belongs to an account when any conversation for its
        // contact ran on that account. Deals whose contact has no conversation are
        // excluded (unambiguous rather than guessed).
        $query->whereExists(function ($q) use ($workspaceId, $accountId) {
            $q->selectRaw('1')
                ->from('conversations')
                ->whereColumn('conversations.contact_id', 'deals.contact_id')
                ->where('conversations.workspace_id', $workspaceId)
                ->where('conversations.whatsapp_account_id', $accountId)
                ->whereNotNull('conversations.contact_id');
        });
    }

    private function scopeAgent(Builder $query, ?int $agentUserId, string $column): void
    {
        if ($agentUserId !== null) {
            $query->where($column, $agentUserId);
        }
    }

    // ── Tasks ──────────────────────────────────────────────────────────────

    private function taskStats(Carbon $from, Carbon $to, int $workspaceId, ?int $agentUserId, ?int $accountId): array
    {
        $query = Task::query()->whereBetween('created_at', [$from, $to]);
        $this->scopeAgent($query, $agentUserId, 'assignee_id');
        $this->scopeAccountToTask($query, $workspaceId, $accountId);

        $total = (clone $query)->count();
        $completed = (clone $query)->where('status', 'done')->count();
        $overdue = (clone $query)
            ->where('status', '!=', 'done')
            ->whereNotNull('due_at')
            ->where('due_at', '<', now())
            ->count();

        return [
            'total' => $total,
            'completed' => $completed,
            'pending' => max(0, $total - $completed),
            'overdue' => $overdue,
            'rate_percent' => $total > 0 ? round(($completed / $total) * 100, 2) : 0.0,
        ];
    }

    private function scopeAccountToTask(Builder $query, int $workspaceId, ?int $accountId): void
    {
        if ($accountId === null) {
            return;
        }

        $query->whereExists(function ($q) use ($workspaceId, $accountId) {
            $q->selectRaw('1')
                ->from('conversations')
                ->whereColumn('conversations.id', 'tasks.conversation_id')
                ->where('conversations.workspace_id', $workspaceId)
                ->where('conversations.whatsapp_account_id', $accountId)
                ->whereNotNull('tasks.conversation_id');
        });
    }

    // ── Response-time walk ─────────────────────────────────────────────────

    /**
     * Walk every conversation with inbound+outbound activity in the period and
     * record its FIRST response gap (inbound sent_at -> next outbound sent_at,
     * both within the period). One gap per conversation, which is the "first reply
     * speed" definition - see the class docblock.
     *
     * @return array{samples: array<int, float>, avg_response_minutes: ?float, buckets: array<string, int>, no_reply_count: int, by_agent: array<int, array<int, float>>, by_day: array<string, array<int, float>>}
     */
    private function responseWalk(Carbon $from, Carbon $to, int $workspaceId, ?int $agentUserId, ?int $accountId): array
    {
        $conversations = Conversation::query()
            ->select(['id', 'assigned_user_id'])
            ->when($agentUserId, fn (Builder $q) => $q->where('assigned_user_id', $agentUserId))
            ->when($accountId, fn (Builder $q) => $q->where('whatsapp_account_id', $accountId))
            ->whereHas('messages', fn (Builder $q) => $q->whereBetween('sent_at', [$from, $to]))
            ->get()
            ->keyBy('id');

        $samples = [];
        $buckets = ['fast' => 0, 'normal' => 0, 'slow' => 0, 'at_risk' => 0];
        $byAgent = [];
        $byDay = [];
        $noReplyCount = 0;

        if ($conversations->isEmpty()) {
            return [
                'samples' => $samples,
                'avg_response_minutes' => null,
                'buckets' => $buckets,
                'no_reply_count' => 0,
                'by_agent' => $byAgent,
                'by_day' => $byDay,
            ];
        }

        $perConversation = Message::query()
            ->whereIn('conversation_id', $conversations->keys())
            ->whereBetween('sent_at', [$from, $to])
            ->whereNotNull('sent_at')
            ->orderBy('sent_at')
            ->get(['conversation_id', 'direction', 'sent_at'])
            ->groupBy('conversation_id');

        foreach ($perConversation as $conversationId => $messages) {
            $hasInbound = false;
            $hasOutbound = false;
            $pendingInboundAt = null; // earliest unanswered inbound
            $recorded = false;

            foreach ($messages as $message) {
                if ($message->direction === 'inbound') {
                    $hasInbound = true;
                    if ($pendingInboundAt === null) {
                        $pendingInboundAt = $message->sent_at;
                    }
                } elseif ($message->direction === 'outbound') {
                    $hasOutbound = true;
                    if ($pendingInboundAt !== null && ! $recorded) {
                        $minutes = (float) $pendingInboundAt->diffInMinutes($message->sent_at, true);
                        $samples[] = $minutes;
                        $this->bucketResponse($buckets, $minutes);
                        $byDay[$message->sent_at->toDateString()][] = $minutes;

                        $assignedUser = $conversations->get($conversationId)?->assigned_user_id;
                        if ($assignedUser !== null) {
                            $byAgent[$assignedUser][] = $minutes;
                        }

                        $recorded = true;
                        $pendingInboundAt = null;
                    }
                }
            }

            if ($hasInbound && ! $hasOutbound) {
                $noReplyCount++;
            }
        }

        return [
            'samples' => $samples,
            'avg_response_minutes' => count($samples) > 0 ? round(array_sum($samples) / count($samples), 2) : null,
            'buckets' => $buckets,
            'no_reply_count' => $noReplyCount,
            'by_agent' => $byAgent,
            'by_day' => $byDay,
        ];
    }

    private function bucketResponse(array &$buckets, float $minutes): void
    {
        foreach (self::RESPONSE_BUCKETS as $key => $bucket) {
            if ($minutes < $bucket['max_minutes']) {
                $buckets[$key]++;

                return;
            }
        }
        $buckets['at_risk']++;
    }

    private function responseSpeed(array $response): array
    {
        $total = count($response['samples']) + (int) $response['no_reply_count'];

        $buckets = [];
        foreach (self::RESPONSE_BUCKETS as $key => $bucket) {
            $count = (int) $response['buckets'][$key];
            $buckets[] = [
                'key' => $key,
                'label' => $bucket['label'],
                'count' => $count,
                'percentage' => $total > 0 ? round(($count / $total) * 100, 1) : 0.0,
            ];
        }
        $buckets[] = [
            'key' => 'no_reply',
            'label' => 'No reply yet',
            'count' => (int) $response['no_reply_count'],
            'percentage' => $total > 0 ? round(($response['no_reply_count'] / $total) * 100, 1) : 0.0,
        ];

        return [
            'avg_response_minutes' => $response['avg_response_minutes'],
            'sample_size' => count($response['samples']),
            'no_reply_count' => (int) $response['no_reply_count'],
            'buckets' => $buckets,
        ];
    }

    // ── Leaderboard ─────────────────────────────────────────────────────────

    private function leaderboard(Carbon $from, Carbon $to, int $workspaceId, ?int $agentUserId, ?int $accountId, array $response): array
    {
        $conversations = Conversation::query()
            ->where('status', 'closed')
            ->whereBetween('closed_at', [$from, $to])
            ->whereNotNull('assigned_user_id')
            ->when($agentUserId, fn (Builder $q) => $q->where('assigned_user_id', $agentUserId))
            ->when($accountId, fn (Builder $q) => $q->where('whatsapp_account_id', $accountId))
            ->selectRaw('assigned_user_id as user_id, count(*) as cnt')
            ->groupBy('assigned_user_id')
            ->pluck('cnt', 'user_id');

        $tasks = Task::query()
            ->where('status', 'done')
            ->whereBetween('completed_at', [$from, $to])
            ->whereNotNull('assignee_id')
            ->when($agentUserId, fn (Builder $q) => $q->where('assignee_id', $agentUserId))
            ->when($accountId, fn (Builder $q) => $q->whereExists(function ($q) use ($workspaceId, $accountId) {
                $q->selectRaw('1')->from('conversations')
                    ->whereColumn('conversations.id', 'tasks.conversation_id')
                    ->where('conversations.workspace_id', $workspaceId)
                    ->where('conversations.whatsapp_account_id', $accountId)
                    ->whereNotNull('tasks.conversation_id');
            }))
            ->selectRaw('assignee_id as user_id, count(*) as cnt')
            ->groupBy('assignee_id')
            ->pluck('cnt', 'user_id');

        $deals = Deal::query()
            ->where('status', 'won')
            ->whereBetween('closed_at', [$from, $to])
            ->whereNotNull('owner_user_id')
            ->when($agentUserId, fn (Builder $q) => $q->where('owner_user_id', $agentUserId))
            ->when($accountId, fn (Builder $q) => $q->whereExists($this->accountDealExists($workspaceId, $accountId)))
            ->selectRaw('owner_user_id as user_id, count(*) as cnt, sum(value_amount) as val')
            ->groupBy('owner_user_id')
            ->get()
            ->keyBy('user_id');

        $userIds = collect($conversations->keys())
            ->merge($tasks->keys())
            ->merge($deals->keys())
            ->merge(array_keys($response['by_agent']))
            ->unique();

        return User::query()->whereIn('id', $userIds)->get(['id', 'name'])
            ->map(function ($user) use ($conversations, $tasks, $deals, $response) {
                $wonValue = (float) ($deals[$user->id]->val ?? 0);
                $agentMinutes = $response['by_agent'][$user->id] ?? [];

                return [
                    'agent_id' => $user->id,
                    'name' => $user->name,
                    'conversations' => (int) ($conversations[$user->id] ?? 0),
                    'tasks' => (int) ($tasks[$user->id] ?? 0),
                    'deals_won' => (int) ($deals[$user->id]->cnt ?? 0),
                    'won_value' => round($wonValue, 2),
                    'avg_response_minutes' => count($agentMinutes) > 0 ? round(array_sum($agentMinutes) / count($agentMinutes), 2) : null,
                ];
            })
            ->sortByDesc([
                ['conversations', 'desc'],
                ['deals_won', 'desc'],
                ['tasks', 'desc'],
            ])
            ->values()
            ->all();
    }

    private function accountDealExists(int $workspaceId, int $accountId): \Closure
    {
        return function ($q) use ($workspaceId, $accountId) {
            $q->selectRaw('1')->from('conversations')
                ->whereColumn('conversations.contact_id', 'deals.contact_id')
                ->where('conversations.workspace_id', $workspaceId)
                ->where('conversations.whatsapp_account_id', $accountId)
                ->whereNotNull('conversations.contact_id');
        };
    }

    // ── Daily series / weekly revenue ───────────────────────────────────────

    private function dailySeries(Carbon $from, Carbon $to, int $workspaceId, ?int $agentUserId, ?int $accountId, array $dealData, array $response): array
    {
        $conversationByDay = Conversation::query()
            ->whereBetween('created_at', [$from, $to])
            ->when($agentUserId, fn (Builder $q) => $q->where('assigned_user_id', $agentUserId))
            ->when($accountId, fn (Builder $q) => $q->where('whatsapp_account_id', $accountId))
            ->selectRaw('DATE(created_at) as day, count(*) as cnt')
            ->groupBy('day')
            ->pluck('cnt', 'day');

        $series = [];
        foreach (CarbonPeriod::create($from, '1 day', $to) as $date) {
            $day = $date->toDateString();
            $dealDay = $dealData['by_day'][$day] ?? [];
            $responseMinutes = $response['by_day'][$day] ?? [];

            $series[] = [
                'date' => $day,
                'conversations' => (int) ($conversationByDay[$day] ?? 0),
                'avg_response_minutes' => count($responseMinutes) > 0 ? round(array_sum($responseMinutes) / count($responseMinutes), 2) : null,
                'won_count' => (int) ($dealDay['won']['count'] ?? 0),
                'won_value' => (float) ($dealDay['won']['value'] ?? 0),
                'lost_count' => (int) ($dealDay['lost']['count'] ?? 0),
                'lost_value' => (float) ($dealDay['lost']['value'] ?? 0),
            ];
        }

        return $series;
    }

    private function weeklyRevenue(array $byDay, AnalyticsSetting $settings): array
    {
        $weeks = [];
        foreach ($byDay as $day => $counts) {
            $date = Carbon::parse($day);
            $weekStart = $settings->week_starts_on_monday ? $date->startOfWeek(Carbon::MONDAY) : $date->startOfWeek(Carbon::SUNDAY);
            $key = $weekStart->toDateString();
            $weeks[$key] ??= ['week_start' => $key, 'won' => 0.0, 'lost' => 0.0];
            $weeks[$key]['won'] += (float) ($counts['won']['value'] ?? 0);
            $weeks[$key]['lost'] += (float) ($counts['lost']['value'] ?? 0);
        }

        $result = array_values($weeks);
        usort($result, fn ($a, $b) => $a['week_start'] <=> $b['week_start']);

        return array_map(fn ($row) => ['week_start' => $row['week_start'], 'won' => round($row['won'], 2), 'lost' => round($row['lost'], 2)], $result);
    }

    private function paginatedDaily(array $series, array $preferences, string $timezone, int $page): array
    {
        $series = $this->excludeWeekends($series, $preferences, $timezone);

        $perPage = self::DAILY_PER_PAGE;
        $total = count($series);
        $totalPages = $total > 0 ? (int) ceil($total / $perPage) : 1;
        $page = max(1, min($page, $totalPages));

        $data = array_slice($series, ($page - 1) * $perPage, $perPage);

        return [
            'data' => $data,
            'page' => $page,
            'per_page' => $perPage,
            'total_pages' => $totalPages,
            'total' => $total,
        ];
    }

    /**
     * Drop weekend rows (Sat/Sun, in the workspace's analytics timezone) when the
     * include_weekends preference is off. Used by both the paginated daily table and
     * the export jobs.
     */
    public function excludeWeekends(array $series, array $preferences, string $timezone): array
    {
        if ($preferences['include_weekends'] ?? true) {
            return $series;
        }

        return array_values(array_filter($series, function ($row) use ($timezone) {
            return ! in_array(Carbon::parse($row['date'])->setTimezone($timezone)->dayOfWeek, [Carbon::SATURDAY, Carbon::SUNDAY], true);
        }));
    }

    // ── Settings / period resolution ────────────────────────────────────────

    public function settingsFor(int $workspaceId): AnalyticsSetting
    {
        return AnalyticsSetting::query()->firstOrCreate(
            ['workspace_id' => $workspaceId],
            array_merge(
                ['workspace_id' => $workspaceId],
                AnalyticsSetting::recommendedDefaults()
            )
        );
    }

    public function preferencesFor(AnalyticsSetting $settings): array
    {
        return array_merge(
            AnalyticsSetting::reportPreferenceDefaults(),
            $settings->report_preferences ?? []
        );
    }

    /**
     * @return array{0: Carbon, 1: Carbon}
     */
    private function resolvePeriod(array $filters): array
    {
        $range = $filters['range'] ?? null;

        if ($range === 'custom' && isset($filters['from'], $filters['to'])) {
            $from = Carbon::parse($filters['from'])->startOfDay();
            $to = Carbon::parse($filters['to'])->endOfDay();
        } else {
            $days = match ($range) {
                '7d' => 7,
                '90d' => 90,
                default => 30,
            };
            $to = now()->endOfDay();
            $from = $to->copy()->subDays($days - 1)->startOfDay();
        }

        return [$from, $to];
    }

    private function rangeFor(AnalyticsSetting $settings): string
    {
        return match ($settings->default_period) {
            'last_7_days' => '7d',
            'last_90_days' => '90d',
            default => '30d',
        };
    }

    /**
     * @return array{from: Carbon, to: Carbon}
     */
    private function previousWindow(Carbon $from, Carbon $to): array
    {
        $lengthDays = (int) $from->diffInDays($to) + 1;
        $prevTo = $from->copy()->subDay();
        $prevFrom = $prevTo->copy()->subDays($lengthDays - 1);

        return ['from' => $prevFrom, 'to' => $prevTo];
    }
}
