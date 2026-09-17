<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\RoutingRule;
use Illuminate\Http\Request;

use function is_array;

class RoutingRuleController extends Controller
{
    public function index(Request $request)
    {
        $rules = RoutingRule::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->orderByDesc('priority')
            ->get();

        return $this->success($rules);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:150',
            'is_active' => 'boolean',
            'priority' => 'integer|min:0',
            'conditions' => 'sometimes|array',
            'conditions.*.key' => 'required_with:conditions|string|max:50',
            'conditions.*.operator' => 'required_with:conditions|string|max:20',
            'conditions.*.value' => 'nullable',
            'actions' => 'sometimes|array',
            'actions.*.type' => 'required_with:actions|string|max:50',
            'actions.*.value' => 'nullable',
        ]);

        $rule = RoutingRule::create([
            'workspace_id' => $request->user()->workspace_id,
            'name' => $validated['name'],
            'is_active' => $validated['is_active'] ?? true,
            'priority' => $validated['priority'] ?? 0,
            'conditions' => is_array($validated['conditions'] ?? null) ? $validated['conditions'] : null,
            'actions' => is_array($validated['actions'] ?? null) ? $validated['actions'] : null,
        ]);

        return $this->success($rule, 'Routing rule created.', [], 201);
    }

    public function update(Request $request, int $id)
    {
        $rule = RoutingRule::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:150',
            'is_active' => 'boolean',
            'priority' => 'integer|min:0',
            'conditions' => 'sometimes|array',
            'actions' => 'sometimes|array',
        ]);

        $rule->update($validated);

        return $this->success($rule, 'Routing rule updated.');
    }

    public function destroy(Request $request, int $id)
    {
        $rule = RoutingRule::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->findOrFail($id);

        $rule->delete();

        return $this->success(null, 'Routing rule deleted.');
    }
}