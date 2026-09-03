<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class PipelineController extends Controller
{
    /**
     * GET /api/v1/pipelines
     */
    public function index(Request $request)
    {
        $pipelines = Pipeline::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->with('stages')
            ->orderByDesc('is_default')
            ->orderBy('name')
            ->get();

        return $this->success($pipelines, 'OK');
    }

    /**
     * GET /api/v1/pipelines/{id}
     */
    public function show(Request $request, Pipeline $pipeline)
    {
        $this->assertWorkspace($request, $pipeline);
        $pipeline->load('stages');

        return $this->success($pipeline, 'OK');
    }

    /**
     * POST /api/v1/pipelines
     */
    public function store(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:150',
            'is_default' => 'sometimes|boolean',
            'stages' => 'sometimes|array',
            'stages.*.name' => 'required_with:stages|string|max:100',
            'stages.*.probability_percent' => 'nullable|integer|min:0|max:100',
            'stages.*.is_won_stage' => 'sometimes|boolean',
            'stages.*.is_lost_stage' => 'sometimes|boolean',
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();
        $workspaceId = $request->user()->workspace_id;

        $pipeline = Pipeline::create([
            'workspace_id' => $workspaceId,
            'name' => $data['name'],
            'is_default' => $data['is_default'] ?? false,
        ]);

        if ($pipeline->is_default) {
            Pipeline::query()->where('workspace_id', $workspaceId)->where('id', '!=', $pipeline->id)->update(['is_default' => false]);
        }

        $stages = $data['stages'] ?? [
            ['name' => 'New'], ['name' => 'Contacted'], ['name' => 'Qualified'],
            ['name' => 'Proposal'], ['name' => 'Negotiation'],
            ['name' => 'Won', 'is_won_stage' => true],
            ['name' => 'Lost', 'is_lost_stage' => true],
        ];

        foreach ($stages as $i => $stage) {
            $pipeline->stages()->create(array_merge($stage, ['position' => $i + 1]));
        }

        AuditLogger::log('pipeline.created', $request->user(), $pipeline, $data, $request);

        return $this->success($pipeline->fresh('stages'), 'Pipeline created', null, 201);
    }

    /**
     * PATCH /api/v1/pipelines/{id}
     */
    public function update(Request $request, Pipeline $pipeline)
    {
        $this->assertWorkspace($request, $pipeline);

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|string|max:150',
            'is_default' => 'sometimes|boolean',
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();
        $before = $pipeline->only(array_keys($data));
        $pipeline->update($data);

        if (! empty($data['is_default'])) {
            Pipeline::query()->where('workspace_id', $pipeline->workspace_id)->where('id', '!=', $pipeline->id)->update(['is_default' => false]);
        }

        AuditLogger::log('pipeline.updated', $request->user(), $pipeline, $data, $request, $before);

        return $this->success($pipeline->fresh('stages'), 'Pipeline updated');
    }

    /**
     * DELETE /api/v1/pipelines/{id}
     */
    public function destroy(Request $request, Pipeline $pipeline)
    {
        $this->assertWorkspace($request, $pipeline);

        if ($pipeline->deals()->exists()) {
            return $this->error('Cannot delete a pipeline that has deals. Move or delete its deals first.', null, 422);
        }

        $pipeline->stages()->delete();
        $pipeline->delete();

        AuditLogger::log('pipeline.deleted', $request->user(), $pipeline, [], $request);

        return $this->success(null, 'Pipeline deleted');
    }

    /**
     * GET /api/v1/pipelines/{id}/board
     * Stages with their (open) deals grouped, stage totals, and overall pipeline total.
     */
    public function board(Request $request, Pipeline $pipeline)
    {
        $this->assertWorkspace($request, $pipeline);

        $pipeline->load(['stages' => function ($q) {
            $q->orderBy('position')->with(['deals' => function ($dq) {
                $dq->where('status', 'open')->with(['contact', 'owner'])->orderByDesc('created_at');
            }]);
        }]);

        $stages = $pipeline->stages->map(function (PipelineStage $stage) {
            $total = $stage->deals->sum('value_amount');

            return [
                'id' => $stage->id,
                'name' => $stage->name,
                'position' => $stage->position,
                'probability_percent' => $stage->probability_percent,
                'is_won_stage' => $stage->is_won_stage,
                'is_lost_stage' => $stage->is_lost_stage,
                'deal_count' => $stage->deals->count(),
                'total_value' => (float) $total,
                'deals' => $stage->deals->values(),
            ];
        });

        return $this->success([
            'pipeline' => $pipeline->only(['id', 'name', 'is_default']),
            'stages' => $stages,
            'overall_total' => (float) $stages->sum('total_value'),
        ], 'OK');
    }

    /**
     * POST /api/v1/pipelines/{id}/stages
     */
    public function storeStage(Request $request, Pipeline $pipeline)
    {
        $this->assertWorkspace($request, $pipeline);

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:100',
            'position' => 'sometimes|integer|min:1',
            'probability_percent' => 'nullable|integer|min:0|max:100',
            'is_won_stage' => 'sometimes|boolean',
            'is_lost_stage' => 'sometimes|boolean',
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();
        $data['position'] = $data['position'] ?? ($pipeline->stages()->max('position') + 1);

        $stage = $pipeline->stages()->create($data);

        AuditLogger::log('pipeline_stage.created', $request->user(), $stage, $data, $request);

        return $this->success($stage, 'Stage created', null, 201);
    }

    /**
     * PATCH /api/v1/pipelines/{pipeline}/stages/{stage}
     */
    public function updateStage(Request $request, Pipeline $pipeline, PipelineStage $stage)
    {
        $this->assertWorkspace($request, $pipeline);
        if ($stage->pipeline_id !== $pipeline->id) {
            return $this->error('Stage does not belong to this pipeline.', null, 404);
        }

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|string|max:100',
            'position' => 'sometimes|integer|min:1',
            'probability_percent' => 'nullable|integer|min:0|max:100',
            'is_won_stage' => 'sometimes|boolean',
            'is_lost_stage' => 'sometimes|boolean',
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();
        $before = $stage->only(array_keys($data));
        $stage->update($data);

        AuditLogger::log('pipeline_stage.updated', $request->user(), $stage, $data, $request, $before);

        return $this->success($stage->fresh(), 'Stage updated');
    }

    /**
     * DELETE /api/v1/pipelines/{pipeline}/stages/{stage}
     */
    public function destroyStage(Request $request, Pipeline $pipeline, PipelineStage $stage)
    {
        $this->assertWorkspace($request, $pipeline);
        if ($stage->pipeline_id !== $pipeline->id) {
            return $this->error('Stage does not belong to this pipeline.', null, 404);
        }

        if ($stage->deals()->exists()) {
            return $this->error('Cannot delete a stage that has deals. Move its deals first.', null, 422);
        }

        $stage->delete();

        AuditLogger::log('pipeline_stage.deleted', $request->user(), $stage, [], $request);

        return $this->success(null, 'Stage deleted');
    }

    protected function assertWorkspace(Request $request, Pipeline $pipeline): void
    {
        abort_if($pipeline->workspace_id !== $request->user()->workspace_id, 404);
    }
}
