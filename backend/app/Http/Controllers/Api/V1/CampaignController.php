<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Campaign;
use App\Models\CampaignMessage;
use App\Models\Contact;
use App\Models\Label;
use App\Services\CampaignService;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class CampaignController extends Controller
{
    public function __construct(private readonly CampaignService $campaigns) {}

    /**
     * GET /api/v1/campaigns
     * List workspace campaigns. Filters: status, search (name/description).
     */
    public function index(Request $request)
    {
        $this->authorize('viewAny', Campaign::class);

        $query = Campaign::query()
            ->with('creator:id,name')
            ->orderByDesc('created_at');

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }
        if ($request->filled('search')) {
            $search = str_replace(['%', '_'], ['\%', '\_'], $request->string('search'));
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%");
            });
        }

        $perPage = min(max((int) $request->integer('per_page', 50), 1), 100);
        $items = $query->paginate($perPage);

        return $this->success($items->items(), 'OK', [
            'page' => $items->currentPage(),
            'per_page' => $items->perPage(),
            'total' => $items->total(),
            'last_page' => $items->lastPage(),
        ]);
    }

    /**
     * POST /api/v1/campaigns/preview-audience
     * Resolve an audience_filter without creating/sending anything - powers the
     * wizard's audience step. Returns the total plus a small sample.
     */
    public function previewAudience(Request $request)
    {
        $this->authorize('viewAny', Campaign::class);

        $validator = Validator::make($request->all(), [
            ...$this->audienceRules(),
        ]);
        if ($validator->fails()) {
            return $this->error('Validation failed', $validator->errors(), 422);
        }

        // Preview against a detached campaign instance so the same audience
        // resolution path is exercised for both preview and real sends.
        $probe = new Campaign([
            'workspace_id' => $request->user()->workspace_id,
            'audience_filter' => $this->normalizedAudience($validator->validated()),
        ]);

        $query = $this->campaigns->audienceQuery($probe);

        return $this->success([
            'count' => (clone $query)->count(),
            'sample' => $query->limit(10)->get(['id', 'full_name', 'phone_number']),
        ], 'OK');
    }

    /**
     * POST /api/v1/campaigns
     */
    public function store(Request $request)
    {
        $this->authorize('create', Campaign::class);

        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:2000'],
            'message_template_id' => ['nullable', 'integer', Rule::exists('message_templates', 'id')->where('workspace_id', $request->user()->workspace_id)],
            'message_content' => ['required', 'string', 'max:4096'],
            'scheduled_at' => ['nullable', 'date', 'after_or_equal:now'],
            ...$this->audienceRules(),
        ]);

        if ($validator->fails()) {
            return $this->error('Validation failed', $validator->errors(), 422);
        }

        $data = $validator->validated();

        $scheduledAt = isset($data['scheduled_at']) ? \Illuminate\Support\Carbon::parse($data['scheduled_at']) : null;

        $campaign = Campaign::create([
            'workspace_id' => $request->user()->workspace_id,
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'message_template_id' => $data['message_template_id'] ?? null,
            'message_content' => $data['message_content'],
            'audience_filter' => $this->normalizedAudience($data),
            'status' => $scheduledAt ? Campaign::STATUS_SCHEDULED : Campaign::STATUS_DRAFT,
            'scheduled_at' => $scheduledAt,
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]);

        AuditLogger::log('campaign.created', $request->user(), $campaign, [
            'name' => $campaign->name,
            'status' => $campaign->status,
        ], $request);

        return $this->success($campaign, 'Campaign created', null, 201);
    }

    /**
     * GET /api/v1/campaigns/{campaign}
     */
    public function show(Request $request, Campaign $campaign)
    {
        $this->authorize('view', $campaign);

        return $this->success($campaign->load('creator:id,name'), 'OK');
    }

    /**
     * PATCH /api/v1/campaigns/{campaign} - editable only while draft/scheduled.
     */
    public function update(Request $request, Campaign $campaign)
    {
        $this->authorize('update', $campaign);

        if (! in_array($campaign->status, [Campaign::STATUS_DRAFT, Campaign::STATUS_SCHEDULED], true)) {
            return $this->error("A campaign with status '{$campaign->status}' cannot be edited.", null, 409);
        }

        $validator = Validator::make($request->all(), [
            'name' => ['sometimes', 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:2000'],
            'message_template_id' => ['nullable', 'integer', Rule::exists('message_templates', 'id')->where('workspace_id', $campaign->workspace_id)],
            'message_content' => ['sometimes', 'string', 'max:4096'],
            'scheduled_at' => ['nullable', 'date', 'after_or_equal:now'],
            ...$this->audienceRules(),
        ]);

        if ($validator->fails()) {
            return $this->error('Validation failed', $validator->errors(), 422);
        }

        $before = $campaign->only(['name', 'description', 'message_content', 'audience_filter', 'status', 'scheduled_at']);
        $data = $validator->validated();
        $payload = [];

        foreach (['name', 'description', 'message_template_id', 'message_content'] as $field) {
            if (array_key_exists($field, $data)) {
                $payload[$field] = $data[$field];
            }
        }
        if (array_key_exists('audience_filter', $data) || array_key_exists('labels', $data)) {
            $mergedFilter = array_key_exists('audience_filter', $data)
                ? $this->normalizedAudience($data)
                : ($campaign->audience_filter ?? []);
            $payload['audience_filter'] = $mergedFilter;
        }
        if (array_key_exists('scheduled_at', $data)) {
            $scheduledAt = $data['scheduled_at'] ? \Illuminate\Support\Carbon::parse($data['scheduled_at']) : null;
            $payload['scheduled_at'] = $scheduledAt;
            // Scheduling/unscheduling via edit flips between draft and scheduled.
            $payload['status'] = $scheduledAt ? Campaign::STATUS_SCHEDULED : Campaign::STATUS_DRAFT;
        }

        $campaign->fill([...$payload, 'updated_by' => $request->user()->id])->save();

        AuditLogger::log('campaign.updated', $request->user(), $campaign, $campaign->only(array_keys($before)), $request, $before);

        return $this->success($campaign->fresh(), 'Campaign updated');
    }

    /**
     * DELETE /api/v1/campaigns/{campaign} - only before sending starts.
     */
    public function destroy(Request $request, Campaign $campaign)
    {
        $this->authorize('delete', $campaign);

        if (! in_array($campaign->status, [Campaign::STATUS_DRAFT, Campaign::STATUS_SCHEDULED, Campaign::STATUS_CANCELLED], true)) {
            return $this->error("A campaign with status '{$campaign->status}' cannot be deleted.", null, 409);
        }

        AuditLogger::log('campaign.deleted', $request->user(), $campaign, ['name' => $campaign->name], $request);
        $campaign->delete();

        return $this->success(null, 'Campaign deleted');
    }

    /**
     * POST /api/v1/campaigns/{campaign}/send
     * Start sending now (or resume/re-send to not-yet-sent recipients when the
     * campaign already completed with failures). With QUEUE_CONNECTION=sync
     * (dev/test) recipients are processed inline; on redis a worker fans out.
     */
    public function send(Request $request, Campaign $campaign)
    {
        $this->authorize('send', $campaign);

        try {
            $dispatched = $this->campaigns->startSending($campaign);
        } catch (\RuntimeException $e) {
            return $this->error($e->getMessage(), null, 409);
        }

        AuditLogger::log('campaign.sent', $request->user(), $campaign, [
            'dispatched' => $dispatched,
            'total_targets' => $campaign->fresh()->total_targets,
        ], $request);

        return $this->success($campaign->fresh(), "Campaign started - {$dispatched} recipient(s) queued");
    }

    /**
     * POST /api/v1/campaigns/{campaign}/cancel
     */
    public function cancel(Request $request, Campaign $campaign)
    {
        $this->authorize('send', $campaign);

        try {
            $this->campaigns->cancel($campaign);
        } catch (\RuntimeException $e) {
            return $this->error($e->getMessage(), null, 409);
        }

        AuditLogger::log('campaign.cancelled', $request->user(), $campaign, [], $request);

        return $this->success($campaign->fresh(), 'Campaign cancelled');
    }

    /**
     * GET /api/v1/campaigns/{campaign}/analytics - status breakdown + recent failures.
     */
    public function analytics(Request $request, Campaign $campaign)
    {
        $this->authorize('view', $campaign);

        $byStatus = CampaignMessage::query()
            ->where('campaign_id', $campaign->id)
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status');

        $recentFailures = CampaignMessage::query()
            ->where('campaign_id', $campaign->id)
            ->where('status', CampaignMessage::STATUS_FAILED)
            ->with('contact:id,full_name')
            ->orderByDesc('updated_at')
            ->limit(20)
            ->get(['id', 'contact_id', 'phone_number', 'error']);

        $total = (int) $byStatus->sum();

        return $this->success([
            'totals' => [
                'targets' => $campaign->total_targets,
                'sent' => (int) ($byStatus[CampaignMessage::STATUS_SENT] ?? 0),
                'failed' => (int) ($byStatus[CampaignMessage::STATUS_FAILED] ?? 0),
                'skipped' => (int) ($byStatus[CampaignMessage::STATUS_SKIPPED] ?? 0),
                'pending' => (int) ($byStatus[CampaignMessage::STATUS_PENDING] ?? 0),
            ],
            'completion_rate' => $total > 0 ? round((int) ($byStatus[CampaignMessage::STATUS_SENT] ?? 0) / $total * 100, 1) : null,
            'recent_failures' => $recentFailures->map(fn ($row) => [
                'id' => $row->id,
                'contact_name' => $row->contact?->full_name,
                'phone_number' => $row->phone_number,
                'error' => $row->error,
            ]),
        ], 'OK');
    }

    /**
     * GET /api/v1/campaigns/{campaign}/messages?status=&search=
     * Per-recipient dispatch list.
     */
    public function messages(Request $request, Campaign $campaign)
    {
        $this->authorize('view', $campaign);

        $query = CampaignMessage::query()
            ->where('campaign_id', $campaign->id)
            ->with('contact:id,full_name');

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }
        if ($request->filled('search')) {
            $search = str_replace(['%', '_'], ['\%', '\_'], $request->string('search'));
            $query->where(function ($q) use ($search) {
                $q->where('phone_number', 'like', "%{$search}%")
                    ->orWhereHas('contact', fn ($cq) => $cq->where('full_name', 'like', "%{$search}%"));
            });
        }

        $perPage = min(max((int) $request->integer('per_page', 50), 1), 100);
        $items = $query->orderBy('id')->paginate($perPage);

        return $this->success($items->items(), 'OK', [
            'page' => $items->currentPage(),
            'per_page' => $items->perPage(),
            'total' => $items->total(),
            'last_page' => $items->lastPage(),
        ]);
    }

    /**
     * @return array<string, mixed> shared validation rules for the audience filter.
     */
    private function audienceRules(): array
    {
        return [
            'labels' => ['present', 'array', 'max:50'],
            'labels.*' => ['integer'],
            'statuses' => ['present', 'array'],
            'statuses.*' => [Rule::in([Contact::STATUS_ACTIVE, Contact::STATUS_INACTIVE])],
            'search' => ['nullable', 'string', 'max:120'],
        ];
    }

    /**
     * Normalize the flat wizard payload into the stored audience_filter shape,
     * dropping label ids that do not exist in the workspace so a stale/foreign
     * id can never silently match zero contacts or leak across workspaces.
     *
     * @param  array<string, mixed>  $data
     * @return array{labels: list<int>, statuses: list<string>, search?: string}
     */
    private function normalizedAudience(array $data): array
    {
        $workspaceId = auth()->user()?->workspace_id;
        $labelIds = array_values(array_map('intval', $data['labels'] ?? []));

        if ($labelIds && $workspaceId) {
            $valid = Label::query()->where('workspace_id', $workspaceId)->whereIn('id', $labelIds)->pluck('id');
            $labelIds = $valid->map(fn ($id) => (int) $id)->all();
        }

        $filter = [
            'labels' => $labelIds,
            'statuses' => array_values($data['statuses'] ?? []),
        ];

        if (! empty(trim((string) ($data['search'] ?? '')))) {
            $filter['search'] = trim((string) $data['search']);
        }

        return $filter;
    }
}
