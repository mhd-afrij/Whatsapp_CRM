<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Deal;
use App\Models\DealStageHistory;
use App\Models\PipelineStage;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class DealController extends Controller
{
    /**
     * GET /api/v1/deals
     */
    public function index(Request $request)
    {
        $this->authorize('viewAny', Deal::class);

        $query = Deal::query()->with(['contact', 'owner', 'pipeline', 'stage', 'labels']);

        if ($request->filled('pipeline_id')) {
            $query->where('pipeline_id', $request->integer('pipeline_id'));
        }

        if ($request->filled('pipeline_stage_id')) {
            $query->where('pipeline_stage_id', $request->integer('pipeline_stage_id'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->string('status')->toString());
        }

        if ($request->filled('owner_user_id')) {
            $query->where('owner_user_id', $request->integer('owner_user_id'));
        }

        // Multi-label filter, any-match (OR) - see ContactController::index for rationale.
        if ($request->filled('labels')) {
            $labelIds = array_map('intval', (array) $request->input('labels'));
            $query->whereHas('labels', fn ($q) => $q->whereIn('labels.id', $labelIds));
        }

        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        $paginator = $query->orderByDesc('created_at')->paginate($perPage);

        return $this->success($paginator->items(), 'OK', [
            'page' => $paginator->currentPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
            'last_page' => $paginator->lastPage(),
        ]);
    }

    /**
     * GET /api/v1/deals/{id}
     */
    public function show(Request $request, Deal $deal)
    {
        $this->authorize('view', $deal);

        $deal->load(['contact', 'owner', 'pipeline', 'stage', 'lead', 'stageHistory.fromStage', 'stageHistory.toStage', 'stageHistory.movedBy', 'labels']);

        return $this->success($deal, 'OK');
    }

    /**
     * POST /api/v1/deals
     */
    public function store(Request $request)
    {
        $this->authorize('create', Deal::class);

        $validator = Validator::make($request->all(), [
            'contact_id' => ['required', 'integer', Rule::exists('contacts', 'id')],
            'lead_id' => ['sometimes', 'nullable', 'integer', Rule::exists('leads', 'id')],
            'pipeline_id' => ['required', 'integer', Rule::exists('pipelines', 'id')],
            'pipeline_stage_id' => ['required', 'integer', Rule::exists('pipeline_stages', 'id')],
            'title' => ['required', 'string', 'max:255'],
            'value_amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'value_currency' => ['sometimes', 'string', 'size:3'],
            'probability_percent' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:100'],
            'owner_user_id' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')],
            'expected_close_date' => ['sometimes', 'nullable', 'date'],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();

        $stage = PipelineStage::query()->findOrFail($data['pipeline_stage_id']);
        abort_if($stage->pipeline_id !== (int) $data['pipeline_id'], 422, 'Stage does not belong to the given pipeline.');

        $deal = Deal::create(array_merge($data, [
            'workspace_id' => $request->user()->workspace_id,
            'value_currency' => $data['value_currency'] ?? 'USD',
            'owner_user_id' => $data['owner_user_id'] ?? $request->user()->id,
            'status' => 'open',
        ]));

        DealStageHistory::create([
            'deal_id' => $deal->id,
            'from_stage_id' => null,
            'to_stage_id' => $stage->id,
            'moved_by' => $request->user()->id,
            'moved_at' => now(),
        ]);

        AuditLogger::log('deal.created', $request->user(), $deal, $data, $request);

        return $this->success($deal->fresh(['contact', 'owner', 'pipeline', 'stage']), 'Deal created', null, 201);
    }

    /**
     * PATCH /api/v1/deals/{id}
     */
    public function update(Request $request, Deal $deal)
    {
        $this->authorize('update', $deal);

        $validator = Validator::make($request->all(), [
            'title' => ['sometimes', 'string', 'max:255'],
            'value_amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'value_currency' => ['sometimes', 'string', 'size:3'],
            'probability_percent' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:100'],
            'owner_user_id' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')],
            'expected_close_date' => ['sometimes', 'nullable', 'date'],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();
        $before = $deal->only(array_keys($data));
        $deal->update($data);

        AuditLogger::log('deal.updated', $request->user(), $deal, $data, $request, $before);

        return $this->success($deal->fresh(['contact', 'owner', 'pipeline', 'stage']), 'Deal updated');
    }

    /**
     * PATCH /api/v1/deals/{id}/stage — move between stages, writes deal_stage_history.
     */
    public function moveStage(Request $request, Deal $deal)
    {
        $this->authorize('update', $deal);

        $validator = Validator::make($request->all(), [
            'pipeline_stage_id' => ['required', 'integer', Rule::exists('pipeline_stages', 'id')],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        if ($deal->status !== 'open') {
            return $this->error('Cannot move a deal that is already closed (won/lost).', null, 422);
        }

        $newStage = PipelineStage::query()->findOrFail($request->integer('pipeline_stage_id'));
        abort_if($newStage->pipeline_id !== $deal->pipeline_id, 422, 'Stage does not belong to this deal\'s pipeline.');

        $fromStageId = $deal->pipeline_stage_id;

        if ($fromStageId === $newStage->id) {
            return $this->success($deal->fresh(['contact', 'owner', 'pipeline', 'stage']), 'Deal already in this stage');
        }

        $deal->update(['pipeline_stage_id' => $newStage->id]);

        DealStageHistory::create([
            'deal_id' => $deal->id,
            'from_stage_id' => $fromStageId,
            'to_stage_id' => $newStage->id,
            'moved_by' => $request->user()->id,
            'moved_at' => now(),
        ]);

        AuditLogger::log('deal.stage_moved', $request->user(), $deal, [
            'from_stage_id' => $fromStageId,
            'to_stage_id' => $newStage->id,
        ], $request);

        return $this->success($deal->fresh(['contact', 'owner', 'pipeline', 'stage']), 'Deal moved to new stage');
    }

    /**
     * POST /api/v1/deals/{id}/won
     */
    public function won(Request $request, Deal $deal)
    {
        $this->authorize('update', $deal);

        if ($deal->status !== 'open') {
            return $this->error('Deal is already closed.', null, 422);
        }

        $deal->update([
            'status' => 'won',
            'probability_percent' => 100,
            'closed_at' => now(),
        ]);

        AuditLogger::log('deal.won', $request->user(), $deal, [], $request);

        return $this->success($deal->fresh(['contact', 'owner', 'pipeline', 'stage']), 'Deal marked as won');
    }

    /**
     * POST /api/v1/deals/{id}/lost
     */
    public function lost(Request $request, Deal $deal)
    {
        $this->authorize('update', $deal);

        $validator = Validator::make($request->all(), [
            'lost_reason' => ['required', 'string', 'max:255'],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        if ($deal->status !== 'open') {
            return $this->error('Deal is already closed.', null, 422);
        }

        $deal->update([
            'status' => 'lost',
            'probability_percent' => 0,
            'lost_reason' => $request->string('lost_reason')->toString(),
            'closed_at' => now(),
        ]);

        AuditLogger::log('deal.lost', $request->user(), $deal, ['lost_reason' => $deal->lost_reason], $request);

        return $this->success($deal->fresh(['contact', 'owner', 'pipeline', 'stage']), 'Deal marked as lost');
    }

    /**
     * DELETE /api/v1/deals/{id}
     */
    public function destroy(Request $request, Deal $deal)
    {
        $this->authorize('delete', $deal);

        $deal->delete();

        AuditLogger::log('deal.deleted', $request->user(), $deal, [], $request);

        return $this->success(null, 'Deal deleted');
    }

    /**
     * POST /api/v1/deals/{deal}/labels/{label}
     */
    public function attachLabel(Request $request, Deal $deal, \App\Models\Label $label)
    {
        $this->authorize('update', $deal);

        $deal->labels()->syncWithoutDetaching([$label->id => ['created_at' => now()]]);

        return $this->success($deal->fresh(['labels']), 'Label attached');
    }

    /**
     * DELETE /api/v1/deals/{deal}/labels/{label}
     */
    public function detachLabel(Request $request, Deal $deal, \App\Models\Label $label)
    {
        $this->authorize('update', $deal);

        $deal->labels()->detach($label->id);

        return $this->success($deal->fresh(['labels']), 'Label detached');
    }
}
