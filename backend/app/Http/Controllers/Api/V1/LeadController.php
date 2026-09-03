<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Deal;
use App\Models\Lead;
use App\Models\LeadActivity;
use App\Models\Label;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Support\AuditLogger;
use Illuminate\Database\DatabaseManager;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class LeadController extends Controller
{
    public function index(Request $request)
    {
        $this->authorize('viewAny', Lead::class);
        $query = Lead::query()->with(['contact', 'owner', 'assignedTeam', 'labels', 'deals']);
        foreach (['stage', 'temperature', 'source', 'owner_user_id', 'assigned_team_id'] as $field) {
            if ($request->filled($field)) $query->where($field, $request->input($field));
        }
        if ($request->filled('search')) {
            $term = '%'.$request->string('search')->toString().'%';
            $query->where(fn ($q) => $q->where('notes', 'like', $term)->orWhereHas('contact', fn ($c) => $c->where('full_name', 'like', $term)->orWhere('phone_number', 'like', $term)->orWhere('email', 'like', $term)));
        }
        if ($request->filled('labels')) {
            $query->whereHas('labels', fn ($q) => $q->whereIn('labels.id', array_map('intval', (array) $request->input('labels'))));
        }
        $paginator = $query->orderByDesc('created_at')->paginate(min(max($request->integer('per_page', 15), 1), 100));
        return $this->success($paginator->items(), 'OK', ['page' => $paginator->currentPage(), 'per_page' => $paginator->perPage(), 'total' => $paginator->total(), 'last_page' => $paginator->lastPage()]);
    }

    public function show(Request $request, Lead $lead)
    {
        $this->authorize('view', $lead);
        return $this->success($lead->load(['contact', 'conversation', 'owner', 'assignedTeam', 'labels', 'activities.creator', 'deals']), 'OK');
    }

    public function store(Request $request)
    {
        $this->authorize('create', Lead::class);
        $validator = Validator::make($request->all(), $this->rules());
        if ($validator->fails()) return $this->error('The given data was invalid.', $validator->errors());
        $data = $validator->validated();
        $workspaceId = $request->user()->workspace_id;
        $contact = Contact::query()->findOrFail($data['contact_id']);
        if ($contact->workspace_id !== $workspaceId) abort(404);
        if (! empty($data['conversation_id'])) {
            $conversation = Conversation::query()->findOrFail($data['conversation_id']);
            if ($conversation->workspace_id !== $workspaceId) abort(404);
        }
        $lead = Lead::create(array_merge($data, ['workspace_id' => $workspaceId, 'owner_user_id' => $data['owner_user_id'] ?? $request->user()->id]));
        $this->activity($lead, 'lead.created', 'Lead created', $request->user()->id);
        AuditLogger::log('lead.created', $request->user(), $lead, $data, $request);
        return $this->success($lead->fresh(['contact', 'owner', 'labels']), 'Lead created', null, 201);
    }

    public function update(Request $request, Lead $lead)
    {
        $this->authorize('update', $lead);
        $validator = Validator::make($request->all(), $this->rules(true));
        if ($validator->fails()) return $this->error('The given data was invalid.', $validator->errors());
        $data = $validator->validated(); $before = $lead->only(array_keys($data));
        $lead->update($data);
        $this->activity($lead, 'lead.updated', 'Lead updated', $request->user()->id, ['before' => $before, 'changes' => $data]);
        AuditLogger::log('lead.updated', $request->user(), $lead, $data, $request, $before);
        return $this->success($lead->fresh(['contact', 'owner', 'assignedTeam', 'labels']), 'Lead updated');
    }

    public function destroy(Request $request, Lead $lead)
    {
        $this->authorize('delete', $lead); $lead->delete();
        AuditLogger::log('lead.deleted', $request->user(), $lead, [], $request);
        return $this->success(null, 'Lead deleted');
    }

    public function convert(Request $request, Lead $lead)
    {
        $this->authorize('update', $lead);
        $validator = Validator::make($request->all(), ['pipeline_id' => ['required', 'integer'], 'pipeline_stage_id' => ['required', 'integer'], 'title' => ['required', 'string', 'max:255'], 'value_amount' => ['nullable', 'numeric', 'min:0'], 'value_currency' => ['nullable', 'string', 'size:3'], 'expected_close_date' => ['nullable', 'date']]);
        if ($validator->fails()) return $this->error('The given data was invalid.', $validator->errors());
        if ($lead->stage === 'converted') return $this->error('Lead is already converted.', null, 422);
        $pipeline = Pipeline::query()->findOrFail($request->integer('pipeline_id'));
        $stage = PipelineStage::query()->findOrFail($request->integer('pipeline_stage_id'));
        if ($pipeline->workspace_id !== $lead->workspace_id || $stage->pipeline_id !== $pipeline->id) return $this->error('Pipeline or stage does not belong to this workspace.', null, 422);
        $data = $validator->validated();
        $deal = app(DatabaseManager::class)->transaction(function () use ($lead, $pipeline, $stage, $data, $request) {
            $deal = Deal::create(['workspace_id' => $lead->workspace_id, 'lead_id' => $lead->id, 'contact_id' => $lead->contact_id, 'pipeline_id' => $pipeline->id, 'pipeline_stage_id' => $stage->id, 'title' => $data['title'], 'value_amount' => $data['value_amount'] ?? null, 'value_currency' => $data['value_currency'] ?? 'USD', 'owner_user_id' => $lead->owner_user_id ?? $request->user()->id, 'expected_close_date' => $data['expected_close_date'] ?? null, 'status' => 'open']);
            $lead->update(['stage' => 'converted', 'converted_at' => now()]);
            $this->activity($lead, 'lead.converted', 'Lead converted to deal', $request->user()->id, ['deal_id' => $deal->id]);
            AuditLogger::log('lead.converted', $request->user(), $lead, ['deal_id' => $deal->id], $request);
            return $deal;
        });
        return $this->success(['lead' => $lead->fresh(['contact', 'deals']), 'deal' => $deal->load(['contact', 'pipeline', 'stage', 'owner'])], 'Lead converted', null, 201);
    }

    public function attachLabel(Request $request, Lead $lead, Label $label)
    {
        $this->authorize('update', $lead); if ($label->workspace_id !== $lead->workspace_id) abort(404);
        $lead->labels()->syncWithoutDetaching([$label->id]); return $this->success($lead->fresh('labels'), 'Label attached');
    }

    public function detachLabel(Request $request, Lead $lead, Label $label)
    {
        $this->authorize('update', $lead); $lead->labels()->detach($label->id); return $this->success($lead->fresh('labels'), 'Label detached');
    }

    private function activity(Lead $lead, string $type, string $description, int $userId, array $metadata = []): void
    {
        LeadActivity::create(['workspace_id' => $lead->workspace_id, 'lead_id' => $lead->id, 'created_by' => $userId, 'activity_type' => $type, 'description' => $description, 'metadata' => $metadata, 'occurred_at' => now()]);
    }

    private function rules(bool $update = false): array
    {
        $required = $update ? 'sometimes' : 'required';
        return ['contact_id' => [$required, 'integer'], 'conversation_id' => ['sometimes', 'nullable', 'integer'], 'source' => ['sometimes', 'string', 'max:32'], 'source_detail' => ['sometimes', 'nullable', 'string', 'max:255'], 'campaign' => ['sometimes', 'nullable', 'string', 'max:255'], 'landing_page' => ['sometimes', 'nullable', 'url', 'max:2048'], 'external_lead_id' => ['sometimes', 'nullable', 'string', 'max:255'], 'stage' => ['sometimes', 'string', 'max:32'], 'score' => ['sometimes', 'integer', 'min:0', 'max:1000'], 'temperature' => ['sometimes', Rule::in(['cold', 'warm', 'hot'])], 'property_type' => ['sometimes', 'nullable', 'string', 'max:255'], 'preferred_location' => ['sometimes', 'nullable', 'string', 'max:255'], 'budget_min' => ['sometimes', 'nullable', 'numeric', 'min:0'], 'budget_max' => ['sometimes', 'nullable', 'numeric', 'min:0', 'gte:budget_min'], 'bedrooms' => ['sometimes', 'nullable', 'integer', 'min:0'], 'bathrooms' => ['sometimes', 'nullable', 'integer', 'min:0'], 'requirement_type' => ['sometimes', 'nullable', Rule::in(['purchase', 'rental'])], 'owner_user_id' => ['sometimes', 'nullable', 'integer'], 'assigned_team_id' => ['sometimes', 'nullable', 'integer'], 'notes' => ['sometimes', 'nullable', 'string'], 'lost_reason' => ['sometimes', 'nullable', 'string', 'max:255'], 'lost_notes' => ['sometimes', 'nullable', 'string']];
    }
}
