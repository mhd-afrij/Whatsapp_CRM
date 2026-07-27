<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Lead;
use App\Models\Message;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $workspaceId = $request->user()->workspace_id;
        $query = $this->dateRange($request);

        $totalConversations = $query->forModel(Conversation::class, $workspaceId)->count();
        $openConversations = $query->forModel(Conversation::class, $workspaceId)->where('status', 'open')->count();
        $closedConversations = $query->forModel(Conversation::class, $workspaceId)->where('status', 'closed')->count();

        $totalMessages = $query->forModel(Message::class, $workspaceId)->count();
        $incomingMessages = $query->forModel(Message::class, $workspaceId)->where('direction', 'in')->count();
        $outgoingMessages = $query->forModel(Message::class, $workspaceId)->where('direction', 'out')->count();

        $resolutionRate = $totalConversations > 0
            ? round(($closedConversations / $totalConversations) * 100, 1)
            : 0.0;

        $totalLeads = $query->forModel(Lead::class, $workspaceId)->count();
        $wonLeads = $query->forModel(Lead::class, $workspaceId)->where('stage', 'won')->count();

        $totalContacts = $query->forModel(Contact::class, $workspaceId)->count();

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
            'leads' => [
                'total' => $totalLeads,
                'won' => $wonLeads,
                'win_rate' => $totalLeads > 0 ? round(($wonLeads / $totalLeads) * 100, 1) : 0.0,
            ],
            'contacts' => [
                'total' => $totalContacts,
            ],
        ]]);
    }

    public function agentReport(Request $request): JsonResponse
    {
        $workspaceId = $request->user()->workspace_id;

        $conversations = Conversation::where('workspace_id', $workspaceId)
            ->whereNotNull('assignee_id')
            ->get(['id', 'assignee_id', 'status']);

        $convosByAgent = $conversations->groupBy('assignee_id');
        $convIdsByAgent = $conversations->groupBy('assignee_id')->map->pluck('id');

        $messageStats = Message::where('workspace_id', $workspaceId)
            ->select('conversation_id', 'direction', DB::raw('count(*) as count'))
            ->groupBy('conversation_id', 'direction')
            ->get()
            ->groupBy('conversation_id');

        $taskStats = Task::where('workspace_id', $workspaceId)
            ->whereNotNull('assignee_id')
            ->select('assignee_id', 'status', DB::raw('count(*) as count'))
            ->groupBy('assignee_id', 'status')
            ->get()
            ->groupBy('assignee_id');

        $agentIds = $convosByAgent->keys()->merge($taskStats->keys())->unique()->values();

        $users = \App\Models\User::whereIn('id', $agentIds)
            ->get(['id', 'name', 'email', 'avatar_path'])
            ->keyBy('id');

        $data = $agentIds->map(function ($agentId) use ($convosByAgent, $convIdsByAgent, $messageStats, $taskStats, $users) {
            $user = $users[$agentId] ?? null;
            $convIds = $convIdsByAgent[$agentId] ?? collect();
            $agentConvos = $convosByAgent[$agentId] ?? collect();

            $totalMessages = 0;
            foreach ($convIds as $convId) {
                $convMessages = $messageStats[$convId] ?? collect();
                $totalMessages += $convMessages->sum('count');
            }

            $outgoingMessages = 0;
            foreach ($convIds as $convId) {
                $convMessages = $messageStats[$convId] ?? collect();
                $outMsg = $convMessages->firstWhere('direction', 'out');
                $outgoingMessages += $outMsg ? $outMsg->count : 0;
            }

            $tasks = $taskStats[$agentId] ?? collect();
            $tasksCompleted = $tasks->where('status', 'completed')->sum('count');
            $tasksTotal = $tasks->sum('count');

            $resolved = $agentConvos->where('status', 'closed')->count();

            return [
                'agent_id' => $agentId,
                'name' => $user?->name ?? 'Unknown',
                'email' => $user?->email ?? '',
                'conversations_handled' => $agentConvos->count(),
                'conversations_resolved' => $resolved,
                'messages_sent' => $outgoingMessages,
                'total_messages' => $totalMessages,
                'tasks_completed' => $tasksCompleted,
                'tasks_total' => $tasksTotal,
            ];
        })->sortByDesc('conversations_resolved')->values();

        return response()->json(['data' => $data]);
    }

    public function contactGrowth(Request $request): JsonResponse
    {
        $workspaceId = $request->user()->workspace_id;

        $from = $request->input('from') ? Carbon::parse($request->input('from')) : now()->subDays(30);
        $to = $request->input('to') ? Carbon::parse($request->input('to')) : now();

        $contacts = Contact::where('workspace_id', $workspaceId)
            ->where('created_at', '>=', $from->startOfDay())
            ->where('created_at', '<=', $to->endOfDay())
            ->select(DB::raw('DATE(created_at) as date'), DB::raw('count(*) as count'))
            ->groupBy('date')
            ->orderBy('date')
            ->get();

        $total = Contact::where('workspace_id', $workspaceId)->count();

        return response()->json([
            'data' => [
                'daily' => $contacts,
                'total' => $total,
            ],
        ]);
    }

    public function leadConversion(Request $request): JsonResponse
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

        $total = $stages->sum('count');
        $won = $stages->firstWhere('stage', 'won')?->count ?? 0;
        $lost = $stages->firstWhere('stage', 'lost')?->count ?? 0;
        $active = $total - $won - $lost;

        return response()->json([
            'data' => [
                'stages' => $stages,
                'summary' => [
                    'total' => $total,
                    'active' => $active,
                    'won' => $won,
                    'lost' => $lost,
                    'win_rate' => $total > 0 ? round(($won / $total) * 100, 1) : 0.0,
                ],
            ],
        ]);
    }

    public function messageAnalytics(Request $request): JsonResponse
    {
        $workspaceId = $request->user()->workspace_id;

        $from = $request->input('from') ? Carbon::parse($request->input('from')) : now()->subDays(30);
        $to = $request->input('to') ? Carbon::parse($request->input('to')) : now();

        $messages = Message::where('workspace_id', $workspaceId)
            ->where('sent_at', '>=', $from->startOfDay())
            ->where('sent_at', '<=', $to->endOfDay())
            ->get(['direction', 'sent_at']);

        $byHour = collect(range(0, 23))->map(function ($hour) use ($messages) {
            $count = $messages->filter(fn ($m) => Carbon::parse($m->sent_at)->hour === $hour)->count();
            return ['hour' => $hour, 'count' => $count];
        });

        $byDayOfWeek = collect(range(0, 6))->map(function ($day) use ($messages) {
            $count = $messages->filter(fn ($m) => Carbon::parse($m->sent_at)->dayOfWeek === $day)->count();
            return ['day' => Carbon::DAY_NAMES[$day], 'count' => $count];
        });

        $incoming = $messages->where('direction', 'in')->count();
        $outgoing = $messages->where('direction', 'out')->count();

        return response()->json([
            'data' => [
                'by_hour' => $byHour,
                'by_day_of_week' => $byDayOfWeek,
                'incoming' => $incoming,
                'outgoing' => $outgoing,
                'total' => $incoming + $outgoing,
            ],
        ]);
    }

    public function export(Request $request): StreamedResponse
    {
        $workspaceId = $request->user()->workspace_id;
        $type = $request->input('type', 'agents');

        $filename = "report_{$type}_" . now()->format('Y-m-d') . '.csv';

        $headers = [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => "attachment; filename=\"{$filename}\"",
        ];

        return response()->stream(function () use ($workspaceId, $type) {
            $handle = fopen('php://output', 'w');

            match ($type) {
                'agents' => $this->exportAgents($handle, $workspaceId),
                'contacts' => $this->exportContacts($handle, $workspaceId),
                'leads' => $this->exportLeads($handle, $workspaceId),
                'messages' => $this->exportMessages($handle, $workspaceId),
                default => fputcsv($handle, ['Invalid report type']),
            };

            fclose($handle);
        }, 200, $headers);
    }

    private function exportAgents($handle, int $workspaceId): void
    {
        fputcsv($handle, ['Agent', 'Email', 'Conversations', 'Resolved', 'Messages Sent']);

        $conversations = \App\Models\Conversation::where('workspace_id', $workspaceId)
            ->whereNotNull('assignee_id')
            ->get(['assignee_id', 'status']);

        $grouped = $conversations->groupBy('assignee_id');
        $users = \App\Models\User::whereIn('id', $grouped->keys())->get(['id', 'name', 'email'])->keyBy('id');

        foreach ($grouped as $agentId => $convos) {
            $user = $users[$agentId];
            fputcsv($handle, [
                $user->name,
                $user->email,
                $convos->count(),
                $convos->where('status', 'closed')->count(),
                '—',
            ]);
        }
    }

    private function exportContacts($handle, int $workspaceId): void
    {
        fputcsv($handle, ['Name', 'Phone', 'Email', 'Company', 'Stage', 'Last Contact']);

        Contact::where('workspace_id', $workspaceId)
            ->orderBy('name')
            ->each(function ($contact) use ($handle) {
                fputcsv($handle, [
                    $contact->name,
                    $contact->phone,
                    $contact->email,
                    $contact->company,
                    $contact->stage,
                    $contact->last_contact_at?->format('Y-m-d H:i'),
                ]);
            });
    }

    private function exportLeads($handle, int $workspaceId): void
    {
        fputcsv($handle, ['Title', 'Customer', 'Value', 'Stage', 'Agent', 'Expected Close']);

        Lead::where('workspace_id', $workspaceId)
            ->orderBy('created_at', 'desc')
            ->each(function ($lead) use ($handle) {
                fputcsv($handle, [
                    $lead->title,
                    $lead->customer_name,
                    $lead->value,
                    $lead->stage,
                    $lead->agent_name,
                    $lead->expected_close_date?->format('Y-m-d'),
                ]);
            });
    }

    private function exportMessages($handle, int $workspaceId): void
    {
        fputcsv($handle, ['Direction', 'Body', 'Sent At']);

        Message::where('workspace_id', $workspaceId)
            ->orderBy('sent_at', 'desc')
            ->limit(10000)
            ->each(function ($msg) use ($handle) {
                fputcsv($handle, [
                    $msg->direction,
                    $msg->body,
                    $msg->sent_at?->format('Y-m-d H:i:s'),
                ]);
            });
    }

    private function dateRange(Request $request): object
    {
        $from = $request->input('from');
        $to = $request->input('to');

        return new class($from, $to) {
            public function __construct(
                private readonly ?string $from,
                private readonly ?string $to,
            ) {}

            public function forModel(string $modelClass, int $workspaceId): \Illuminate\Database\Eloquent\Builder
            {
                $query = $modelClass::where('workspace_id', $workspaceId);

                if ($this->from) {
                    $query->where('created_at', '>=', Carbon::parse($this->from)->startOfDay());
                }
                if ($this->to) {
                    $query->where('created_at', '<=', Carbon::parse($this->to)->endOfDay());
                }

                return $query;
            }
        };
    }
}
