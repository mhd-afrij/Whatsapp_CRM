<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LeadAssignmentRule;
use Illuminate\Http\Request;

class LeadAssignmentRuleController extends Controller
{
    public function index(Request $request)
    {
        return $this->success(
            LeadAssignmentRule::query()
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
            'priority' => 'sometimes|integer|min:0',
            'is_active' => 'boolean',
            'conditions' => 'required|array|min:1',
            'conditions.*.field' => 'required|string|max:50',
            'conditions.*.operator' => 'required|string|max:20',
            'conditions.*.value' => 'nullable',
            'actions' => 'required|array|min:1',
            'actions.*.type' => 'required|string|max:50',
            'actions.*.value' => 'nullable',
        ]);

        $rule = LeadAssignmentRule::create([
            'workspace_id' => $workspaceId,
            'name' => $validated['name'],
            'priority' => $validated['priority'] ?? 0,
            'is_active' => $validated['is_active'] ?? true,
            'conditions' => $validated['conditions'],
            'actions' => $validated['actions'],
            'sort_order' => (LeadAssignmentRule::max('sort_order') ?? -1) + 1,
        ]);

        return $this->success($rule, 'Assignment rule created.', [], 201);
    }

    public function update(Request $request, int $id)
    {
        $rule = LeadAssignmentRule::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:150',
            'priority' => 'sometimes|integer|min:0',
            'is_active' => 'boolean',
            'conditions' => 'sometimes|array|min:1',
            'conditions.*.field' => 'required_with:conditions|string|max:50',
            'conditions.*.operator' => 'required_with:conditions|string|max:20',
            'conditions.*.value' => 'nullable',
            'actions' => 'sometimes|array|min:1',
            'actions.*.type' => 'required_with:actions|string|max:50',
            'actions.*.value' => 'nullable',
        ]);

        $rule->update($validated);

        return $this->success($rule, 'Assignment rule updated.');
    }

    public function destroy(Request $request, int $id)
    {
        $rule = LeadAssignmentRule::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->findOrFail($id);

        $rule->delete();

        return $this->success(null, 'Assignment rule deleted.');
    }

    public function reorder(Request $request)
    {
        $workspaceId = $request->user()->workspace_id;
        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer',
        ]);

        foreach (array_values($validated['ids']) as $index => $ruleId) {
            LeadAssignmentRule::query()
                ->where('workspace_id', $workspaceId)
                ->where('id', $ruleId)
                ->update(['sort_order' => $index]);
        }

        return $this->success(null, 'Assignment rules reordered.');
    }
}