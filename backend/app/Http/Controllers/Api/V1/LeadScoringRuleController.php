<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LeadScoringRule;
use Illuminate\Http\Request;

class LeadScoringRuleController extends Controller
{
    public function index(Request $request)
    {
        return $this->success(
            LeadScoringRule::query()
                ->where('workspace_id', $request->user()->workspace_id)
                ->orderBy('sort_order')
                ->orderBy('id')
                ->get()
        );
    }

    public function store(Request $request)
    {
        $workspaceId = $request->user()->workspace_id;
        $validated = $request->validate([
            'name' => 'required|string|max:150',
            'points' => 'required|integer|between:-1000,1000',
            'is_active' => 'boolean',
            'conditions' => 'sometimes|array',
            'conditions.*.field' => 'sometimes|string|max:50',
            'conditions.*.operator' => 'sometimes|string|max:20',
            'conditions.*.value' => 'nullable',
        ]);

        $rule = LeadScoringRule::create([
            'workspace_id' => $workspaceId,
            'name' => $validated['name'],
            'points' => $validated['points'],
            'is_active' => $validated['is_active'] ?? true,
            'conditions' => $validated['conditions'] ?? [],
            'sort_order' => (LeadScoringRule::max('sort_order') ?? -1) + 1,
        ]);

        return $this->success($rule, 'Scoring rule created.', [], 201);
    }

    public function update(Request $request, int $id)
    {
        $rule = LeadScoringRule::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:150',
            'points' => 'sometimes|integer|between:-1000,1000',
            'is_active' => 'boolean',
            'conditions' => 'sometimes|array',
        ]);

        $rule->update($validated);

        return $this->success($rule, 'Scoring rule updated.');
    }

    public function destroy(Request $request, int $id)
    {
        $rule = LeadScoringRule::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->findOrFail($id);

        $rule->delete();

        return $this->success(null, 'Scoring rule deleted.');
    }
}