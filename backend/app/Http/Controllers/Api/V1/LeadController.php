<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Deal;
use App\Models\Label;
use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class LeadController extends Controller
{
    // ── Index / Show ────────────────────────────────────────────────────

    /**
     * GET /api/v1/leads
     *
     * Supports: search, stage, temperature, source, owner_user_id,
     * assigned_team_id, labels, budget_min/max, property_type,
     * quick_filter, sort, per_page, page.
     */
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Lead::class);

        $query = Lead::query()->with(['contact', 'owner', 'assignedTeam', 'labels']);

        // ── Text search (§13) ───────────────────────────────────────
        if ($request->filled('search')) {
            $query->search($request->string('search')->toString());
        }

        // ── Standard filters (§13) ──────────────────────────────────
        $this->applyFilters($query, $request);

        // ── Quick filters (§13) ─────────────────────────────────────
        $this->applyQuickFilters($query, $request);

        // ── Sorting ─────────────────────────────────────────────────
        $sortField = $request->string('sort', 'created_at')->toString();
        $sortDir = $request->boolean('sort_desc', true) ? 'desc' : 'asc';
        $allowed = ['created_at', 'updated_at', 'score', 'stage', 'temperature'];

        if (in_array($sortField, $allowed, true)) {
            $query->orderBy($sortField, $sortDir);
        } else {
            $query->orderByDesc('created_at');
        }

        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);
        $paginator = $query->paginate($perPage);

        return $this->success($paginator->items(), 'OK', [
            'page' => $paginator->currentPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
            'last_page' => $paginator->lastPage(),
        ]);
    }

    /**
     * GET /api/v1/leads/{id}
     */
    public function show(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize('view', $lead);

        $lead->load([
            'contact', 'owner', 'assignedTeam',
            'conversation', 'deals.stage', 'labels',
        ]);

        return $this->success($lead, 'OK');
    }

    // ── Create / Update / Delete ────────────────────────────────────────

    /**
     * POST /api/v1/leads
     */
    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Lead::class);

        $validator = Validator::make($request->all(), [
            'contact_id' => ['required', 'integer', Rule::exists('contacts', 'id')],
            'conversation_id' => ['nullable', 'integer', Rule::exists('conversations', 'id')],
            'source' => ['sometimes', 'string', 'max:32'],
            'source_detail' => ['nullable', 'string', 'max:255'],
            'campaign' => ['nullable', 'string', 'max:255'],
            'landing_page' => ['nullable', 'string', 'max:500'],
            'external_lead_id' => ['nullable', 'string', 'max:255'],
            'stage' => ['sometimes', Rule::in(Lead::ACTIVE_STAGES)],
            'owner_user_id' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')],
            'assigned_team_id' => ['nullable', 'integer', Rule::exists('teams', 'id')],
            'property_type' => ['nullable', 'string', 'max:100'],
            'preferred_location' => ['nullable', 'string', 'max:255'],
            'budget_min' => ['nullable', 'numeric', 'min:0'],
            'budget_max' => ['nullable', 'numeric', 'min:0'],
            'bedrooms' => ['nullable', 'integer', 'min:0', 'max:20'],
            'bathrooms' => ['nullable', 'integer', 'min:0', 'max:20'],
            'requirement_type' => ['nullable', Rule::in(['purchase', 'rental'])],
            'notes' => ['sometimes', 'nullable', 'string'],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();

        // Duplicate detection (§5) — warn if a lead with the same contact already exists.
        $existingLead = Lead::withoutGlobalScopes()
            ->where('workspace_id', $request->user()->workspace_id)
            ->where('contact_id', $data['contact_id'])
            ->exists();

        $lead = Lead::create(array_merge($data, [
            'workspace_id' => $request->user()->workspace_id,
            'source' => $data['source'] ?? 'manual',
            'stage' => $data['stage'] ?? Lead::STAGE_NEW,
            'owner_user_id' => $data['owner_user_id'] ?? $request->user()->id,
            'score' => 0,
            'temperature' => Lead::TEMP_COLD,
        ]));

        // Record activity (§19).
        LeadActivity::record(
            $lead->workspace_id,
            $lead->id,
            'lead.created',
            $request->user()->id,
            'Lead created',
        );

        AuditLogger::log('lead.created', $request->user(), $lead, $data, $request);

        return $this->success(
            $lead->fresh(['contact', 'owner', 'assignedTeam', 'labels']),
            'Lead created',
            $existingLead ? ['duplicate_warning' => 'A lead with this contact already exists.'] : null,
            201,
        );
    }

    /**
     * PATCH /api/v1/leads/{id}
     */
    public function update(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize('update', $lead);

        $validator = Validator::make($request->all(), [
            'source' => ['sometimes', 'string', 'max:32'],
            'source_detail' => ['nullable', 'string', 'max:255'],
            'campaign' => ['nullable', 'string', 'max:255'],
            'landing_page' => ['nullable', 'string', 'max:500'],
            'owner_user_id' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')],
            'assigned_team_id' => ['nullable', 'integer', Rule::exists('teams', 'id')],
            'property_type' => ['nullable', 'string', 'max:100'],
            'preferred_location' => ['nullable', 'string', 'max:255'],
            'budget_min' => ['nullable', 'numeric', 'min:0'],
            'budget_max' => ['nullable', 'numeric', 'min:0'],
            'bedrooms' => ['nullable', 'integer', 'min:0', 'max:20'],
            'bathrooms' => ['nullable', 'integer', 'min:0', 'max:20'],
            'requirement_type' => ['nullable', Rule::in(['purchase', 'rental'])],
            'notes' => ['sometimes', 'nullable', 'string'],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();
        $before = $lead->only(array_keys($data));
        $lead->update($data);

        // Record activity for significant changes.
        if (isset($data['owner_user_id']) && $data['owner_user_id'] !== $before['owner_user_id'] ?? null) {
            $newOwner = User::find($data['owner_user_id']);
            LeadActivity::record(
                $lead->workspace_id,
                $lead->id,
                'owner.changed',
                $request->user()->id,
                'Owner changed to ' . ($newOwner?->name ?? 'Unassigned'),
            );
        }

        AuditLogger::log('lead.updated', $request->user(), $lead, $data, $request, $before);

        return $this->success($lead->fresh(['contact', 'owner', 'assignedTeam', 'labels']), 'Lead updated');
    }

    /**
     * DELETE /api/v1/leads/{id}
     */
    public function destroy(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize('delete', $lead);

        $lead->delete();

        AuditLogger::log('lead.deleted', $request->user(), $lead, [], $request);

        return $this->success(null, 'Lead deleted');
    }

    // ── Stage Management (§10) ──────────────────────────────────────────

    /**
     * POST /api/v1/leads/{id}/stage
     *
     * Body: { "stage": "qualified" }
     * For "lost": also accepts { "lost_reason": "...", "lost_notes": "..." }.
     */
    public function changeStage(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize('update', $lead);

        $validator = Validator::make($request->all(), [
            'stage' => ['required', Rule::in(Lead::ACTIVE_STAGES)],
            'lost_reason' => ['required_if:stage,lost', 'nullable', Rule::in(Lead::LOST_REASONS)],
            'lost_notes' => ['nullable', 'string', 'max:2000'],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $newStage = $request->string('stage')->toString();
        $oldStage = $lead->stage;

        $update = ['stage' => $newStage];
        if ($newStage === Lead::STAGE_LOST) {
            $update['lost_reason'] = $request->string('lost_reason')->toString();
            $update['lost_notes'] = $request->string('lost_notes')->toString();
        }

        $lead->update($update);

        // Activity (§19).
        LeadActivity::record(
            $lead->workspace_id,
            $lead->id,
            'stage.changed',
            $request->user()->id,
            "Stage changed from \"{$oldStage}\" to \"{$newStage}\"",
            ['from' => $oldStage, 'to' => $newStage],
        );

        AuditLogger::log('lead.stage_changed', $request->user(), $lead, $update, $request, ['stage' => $oldStage]);

        return $this->success($lead->fresh(['contact', 'owner']), 'Stage updated');
    }

    // ── Assignment (§8) ─────────────────────────────────────────────────

    /**
     * POST /api/v1/leads/{id}/assign
     *
     * Body: { "owner_user_id": 5 } or { "assigned_team_id": 3 }
     */
    public function assign(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize('update', $lead);

        $validator = Validator::make($request->all(), [
            'owner_user_id' => ['required_without:assigned_team_id', 'nullable', 'integer', Rule::exists('users', 'id')],
            'assigned_team_id' => ['nullable', 'integer', Rule::exists('teams', 'id')],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $oldOwner = $lead->owner_user_id;
        $oldTeam = $lead->assigned_team_id;

        $lead->update($request->only('owner_user_id', 'assigned_team_id'));

        $newOwner = $lead->owner?->name ?? 'Unassigned';
        LeadActivity::record(
            $lead->workspace_id,
            $lead->id,
            'owner.changed',
            $request->user()->id,
            "Lead assigned to {$newOwner}",
            ['old_owner_id' => $oldOwner, 'new_owner_id' => $lead->owner_user_id],
        );

        AuditLogger::log('lead.assigned', $request->user(), $lead, $request->all(), $request, [
            'owner_user_id' => $oldOwner,
            'assigned_team_id' => $oldTeam,
        ]);

        return $this->success($lead->fresh(['contact', 'owner', 'assignedTeam']), 'Lead assigned');
    }

    // ── Conversion (§11) ────────────────────────────────────────────────

    /**
     * POST /api/v1/leads/{id}/convert
     *
     * Creates (or links) a Contact and a Deal, then marks the lead as converted.
     * Uses a DB transaction to prevent partial conversions (§24).
     *
     * Body (optional):
     *   { "deal_title": "...", "pipeline_stage_id": 1, "value_amount": 100000 }
     */
    public function convert(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize('update', $lead);

        if ($lead->stage === Lead::STAGE_CONVERTED) {
            return $this->error('This lead has already been converted.', null, 422);
        }

        $validator = Validator::make($request->all(), [
            'deal_title' => ['sometimes', 'string', 'max:255'],
            'pipeline_stage_id' => ['nullable', 'integer', Rule::exists('pipeline_stages', 'id')],
            'value_amount' => ['nullable', 'numeric', 'min:0'],
            'value_currency' => ['nullable', 'string', 'size:3'],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $contact = $lead->contact;
        $user = $request->user();

        try {
            $deal = DB::transaction(function () use ($lead, $contact, $request, $user) {
                // Link or create contact (§11 — contact already exists on the lead).
                // No new contact creation needed — the lead already references one.

                // Create deal.
                $dealTitle = $request->string('deal_title', "{$contact->full_name} — Lead #{$lead->id}")->toString();
                $deal = Deal::create([
                    'workspace_id' => $user->workspace_id,
                    'lead_id' => $lead->id,
                    'contact_id' => $contact->id,
                    'title' => $dealTitle,
                    'value_amount' => $request->input('value_amount'),
                    'value_currency' => $request->input('value_currency', 'USD'),
                    'pipeline_id' => $this->defaultPipelineId($user->workspace_id),
                    'pipeline_stage_id' => $request->input('pipeline_stage_id'),
                    'owner_user_id' => $lead->owner_user_id ?? $user->id,
                    'status' => 'open',
                ]);

                // Mark lead as converted.
                $lead->update([
                    'stage' => Lead::STAGE_CONVERTED,
                    'converted_at' => now(),
                ]);

                // Activity.
                LeadActivity::record(
                    $lead->workspace_id,
                    $lead->id,
                    'lead.converted',
                    $user->id,
                    "Lead converted to deal \"{$dealTitle}\"",
                    ['deal_id' => $deal->id],
                );

                return $deal;
            });
        } catch (\Throwable $e) {
            report($e);
            return $this->error('Conversion failed. No changes were made.', null, 500);
        }

        AuditLogger::log('lead.converted', $user, $lead, [
            'deal_id' => $deal->id,
        ], $request);

        return $this->success(
            $lead->fresh(['contact', 'owner', 'deals']),
            'Lead converted successfully',
            ['deal_id' => $deal->id],
        );
    }

    // ── Mark Lost (§12) ─────────────────────────────────────────────────

    /**
     * POST /api/v1/leads/{id}/lost
     *
     * Body: { "lost_reason": "not_interested", "lost_notes": "..." }
     */
    public function markLost(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize('update', $lead);

        if ($lead->stage === Lead::STAGE_LOST) {
            return $this->error('This lead is already marked as lost.', null, 422);
        }

        $validator = Validator::make($request->all(), [
            'lost_reason' => ['required', Rule::in(Lead::LOST_REASONS)],
            'lost_notes' => ['nullable', 'string', 'max:2000'],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $oldStage = $lead->stage;

        $lead->update([
            'stage' => Lead::STAGE_LOST,
            'lost_reason' => $request->string('lost_reason')->toString(),
            'lost_notes' => $request->string('lost_notes')->toString(),
        ]);

        LeadActivity::record(
            $lead->workspace_id,
            $lead->id,
            'lead.lost',
            $request->user()->id,
            "Lead marked as lost — {$request->string('lost_reason')}",
            ['from_stage' => $oldStage, 'lost_reason' => $request->string('lost_reason')],
        );

        AuditLogger::log('lead.lost', $request->user(), $lead, [
            'lost_reason' => $request->string('lost_reason'),
        ], $request, ['stage' => $oldStage]);

        return $this->success($lead->fresh(['contact', 'owner']), 'Lead marked as lost');
    }

    // ── Activities (§19) ────────────────────────────────────────────────

    /**
     * GET /api/v1/leads/{id}/activities
     */
    public function activities(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize('view', $lead);

        $perPage = min(max((int) $request->integer('per_page', 30), 1), 100);

        $activities = LeadActivity::where('lead_id', $lead->id)
            ->with('creator:id,name')
            ->orderByDesc('occurred_at')
            ->paginate($perPage);

        return $this->success($activities->items(), 'OK', [
            'page' => $activities->currentPage(),
            'per_page' => $activities->perPage(),
            'total' => $activities->total(),
            'last_page' => $activities->lastPage(),
        ]);
    }

    // ── Tasks (§9) ──────────────────────────────────────────────────────

    /**
     * GET /api/v1/leads/{id}/tasks
     */
    public function tasks(Request $request, Lead $lead): JsonResponse
    {
        $this->authorize('view', $lead);

        $tasks = $lead->tasks()
            ->with('assignee:id,name')
            ->orderByDesc('created_at')
            ->get();

        return $this->success($tasks, 'OK');
    }

    // ── Bulk Actions (§16) ──────────────────────────────────────────────

    /**
     * POST /api/v1/leads/bulk/assign
     *
     * Body: { "lead_ids": [1,2,3], "owner_user_id": 5 }
     */
    public function bulkAssign(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'lead_ids' => ['required', 'array', 'min:1', 'max:50'],
            'lead_ids.*' => ['integer', Rule::exists('leads', 'id')],
            'owner_user_id' => ['nullable', 'integer', Rule::exists('users', 'id')],
            'assigned_team_id' => ['nullable', 'integer', Rule::exists('teams', 'id')],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $ids = $request->input('lead_ids');
        $updates = array_filter($request->only('owner_user_id', 'assigned_team_id'), fn ($v) => $v !== null);

        $query = Lead::whereIn('id', $ids)->where('workspace_id', $request->user()->workspace_id);
        $query->update($updates);

        return $this->success(null, count($ids) . ' leads assigned');
    }

    /**
     * POST /api/v1/leads/bulk/stage
     *
     * Body: { "lead_ids": [1,2,3], "stage": "contacted" }
     */
    public function bulkStage(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'lead_ids' => ['required', 'array', 'min:1', 'max:50'],
            'lead_ids.*' => ['integer', Rule::exists('leads', 'id')],
            'stage' => ['required', Rule::in(Lead::ACTIVE_STAGES)],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $ids = $request->input('lead_ids');
        $stage = $request->string('stage')->toString();

        Lead::whereIn('id', $ids)
            ->where('workspace_id', $request->user()->workspace_id)
            ->update(['stage' => $stage]);

        return $this->success(null, count($ids) . ' leads moved to ' . $stage);
    }

    /**
     * POST /api/v1/leads/bulk/tag
     *
     * Body: { "lead_ids": [1,2,3], "label_ids": [4,5], "action": "attach|detach" }
     */
    public function bulkTag(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'lead_ids' => ['required', 'array', 'min:1', 'max:50'],
            'lead_ids.*' => ['integer', Rule::exists('leads', 'id')],
            'label_ids' => ['required', 'array', 'min:1'],
            'label_ids.*' => ['integer', Rule::exists('labels', 'id')],
            'action' => ['required', Rule::in(['attach', 'detach'])],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $ids = $request->input('lead_ids');
        $labelIds = $request->input('label_ids');
        $action = $request->string('action')->toString();

        $leads = Lead::whereIn('id', $ids)
            ->where('workspace_id', $request->user()->workspace_id)
            ->get();

        foreach ($leads as $lead) {
            if ($action === 'attach') {
                $lead->labels()->syncWithoutDetaching($labelIds);
            } else {
                $lead->labels()->detach($labelIds);
            }
        }

        return $this->success(null, 'Tags updated for ' . count($ids) . ' leads');
    }

    // ── Label Management ────────────────────────────────────────────────

    /**
     * POST /api/v1/leads/{lead}/labels/{label}
     */
    public function attachLabel(Request $request, Lead $lead, Label $label): JsonResponse
    {
        $this->authorize('update', $lead);

        $lead->labels()->syncWithoutDetaching([$label->id => ['created_at' => now()]]);

        return $this->success($lead->fresh(['labels']), 'Label attached');
    }

    /**
     * DELETE /api/v1/leads/{lead}/labels/{label}
     */
    public function detachLabel(Request $request, Lead $lead, Label $label): JsonResponse
    {
        $this->authorize('update', $lead);

        $lead->labels()->detach($label->id);

        return $this->success($lead->fresh(['labels']), 'Label detached');
    }

    // ── Convert from Contact / Conversation ──────────────────────────────

    /**
     * POST /api/v1/contacts/{id}/convert-to-lead
     */
    public function convertFromContact(Request $request, Contact $contact): JsonResponse
    {
        $this->authorize('create', Lead::class);

        $lead = $this->createLeadFrom($request, $contact, null);

        return $this->success($lead, 'Lead created from contact', null, 201);
    }

    /**
     * POST /api/v1/conversations/{id}/convert-to-lead
     */
    public function convertFromConversation(Request $request, Conversation $conversation): JsonResponse
    {
        $this->authorize('create', Lead::class);

        if (! $conversation->contact_id) {
            return $this->error('Conversation has no linked contact to convert.', null, 422);
        }

        $contact = Contact::query()->findOrFail($conversation->contact_id);
        $lead = $this->createLeadFrom($request, $contact, $conversation->id);

        return $this->success($lead, 'Lead created from conversation', null, 201);
    }

    // ── Private helpers ─────────────────────────────────────────────────

    private function createLeadFrom(Request $request, Contact $contact, ?int $conversationId): Lead
    {
        $lead = Lead::create([
            'workspace_id' => $request->user()->workspace_id,
            'contact_id' => $contact->id,
            'conversation_id' => $conversationId,
            'source' => $conversationId ? 'whatsapp' : 'manual',
            'stage' => Lead::STAGE_NEW,
            'owner_user_id' => $request->user()->id,
            'score' => 0,
            'temperature' => Lead::TEMP_COLD,
        ]);

        LeadActivity::record(
            $lead->workspace_id,
            $lead->id,
            'lead.created',
            $request->user()->id,
            'Lead created from ' . ($conversationId ? 'conversation' : 'contact'),
        );

        AuditLogger::log('lead.created', $request->user(), $lead, [
            'contact_id' => $contact->id,
            'conversation_id' => $conversationId,
        ], $request);

        return $lead->fresh(['contact', 'owner', 'conversation']);
    }

    private function defaultPipelineId(int $workspaceId): ?int
    {
        return Pipeline::where('workspace_id', $workspaceId)->value('id');
    }

    private function applyFilters($query, Request $request): void
    {
        if ($request->filled('stage')) {
            $query->where('stage', $request->string('stage')->toString());
        }

        if ($request->filled('temperature')) {
            $query->where('temperature', $request->string('temperature')->toString());
        }

        if ($request->filled('source')) {
            $query->where('source', $request->string('source')->toString());
        }

        if ($request->filled('owner_user_id')) {
            $query->where('owner_user_id', $request->integer('owner_user_id'));
        }

        if ($request->filled('assigned_team_id')) {
            $query->where('assigned_team_id', $request->integer('assigned_team_id'));
        }

        if ($request->filled('labels')) {
            $labelIds = array_map('intval', (array) $request->input('labels'));
            $query->whereHas('labels', fn ($q) => $q->whereIn('labels.id', $labelIds));
        }

        if ($request->filled('budget_min')) {
            $query->where('budget_max', '>=', $request->input('budget_min'));
        }

        if ($request->filled('budget_max')) {
            $query->where('budget_min', '<=', $request->input('budget_max'));
        }

        if ($request->filled('property_type')) {
            $query->where('property_type', $request->string('property_type')->toString());
        }

        if ($request->filled('bedrooms')) {
            $query->where('bedrooms', $request->integer('bedrooms'));
        }

        if ($request->filled('requirement_type')) {
            $query->where('requirement_type', $request->string('requirement_type')->toString());
        }

        if ($request->filled('created_from')) {
            $query->where('created_at', '>=', $request->input('created_from'));
        }

        if ($request->filled('created_to')) {
            $query->where('created_at', '<=', $request->input('created_to'));
        }
    }

    private function applyQuickFilters($query, Request $request): void
    {
        $quick = $request->string('quick_filter')->toString();

        if ($quick === '') {
            return;
        }

        match ($quick) {
            'my_leads' => $query->where('owner_user_id', $request->user()->id),
            'new' => $query->where('stage', Lead::STAGE_NEW),
            'hot' => $query->where('temperature', Lead::TEMP_HOT),
            'followup_today' => $query->whereHas('tasks', function ($tq) {
                $tq->where('due_at', '>=', now()->startOfDay())
                    ->where('due_at', '<=', now()->endOfDay())
                    ->where('status', 'pending');
            }),
            'overdue' => $query->whereHas('tasks', function ($tq) {
                $tq->where('due_at', '<', now())
                    ->where('status', 'pending');
            }),
            'qualified' => $query->where('stage', Lead::STAGE_QUALIFIED),
            'converted' => $query->where('stage', Lead::STAGE_CONVERTED),
            'lost' => $query->where('stage', Lead::STAGE_LOST),
            default => null,
        };
    }
}
