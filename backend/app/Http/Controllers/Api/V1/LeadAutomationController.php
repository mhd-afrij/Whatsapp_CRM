<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\LeadAutomation;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LeadAutomationController extends Controller
{
    private const TRIGGER_TYPES = [
        'lead_created', 'lead_assigned', 'status_changed', 'source_changed',
        'score_changed', 'becomes_qualified', 'becomes_inactive',
        'not_contacted_after', 'no_response_after', 'converted',
    ];

    public function index(Request $request)
    {
        return $this->success(
            LeadAutomation::query()
                ->where('workspace_id', $request->user()->workspace_id)
                ->latest()
                ->get()
        );
    }

    public function store(Request $request)
    {
        $workspaceId = $request->user()->workspace_id;
        $validated = $request->validate($this->rules());

        $automation = LeadAutomation::create([
            'workspace_id' => $workspaceId,
            'name' => $validated['name'],
            'trigger_type' => $validated['trigger_type'],
            'trigger_value' => $validated['trigger_value'] ?? null,
            'conditions' => $validated['conditions'] ?? null,
            'actions' => $validated['actions'],
            'is_active' => $validated['is_active'] ?? false,
        ]);

        return $this->success($automation, 'Lead automation created.', [], 201);
    }

    public function update(Request $request, int $id)
    {
        $automation = LeadAutomation::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->findOrFail($id);

        $validated = $request->validate($this->rules(true));

        $automation->update($validated);

        return $this->success($automation, 'Lead automation updated.');
    }

    public function destroy(Request $request, int $id)
    {
        $automation = LeadAutomation::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->findOrFail($id);

        $automation->delete();

        return $this->success(null, 'Lead automation deleted.');
    }

    public function enable(Request $request, int $id)
    {
        return $this->setActive($request, $id, true, 'Lead automation enabled.');
    }

    public function disable(Request $request, int $id)
    {
        return $this->setActive($request, $id, false, 'Lead automation disabled.');
    }

    private function setActive(Request $request, int $id, bool $active, string $message)
    {
        $automation = LeadAutomation::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->findOrFail($id);

        $automation->update(['is_active' => $active]);

        return $this->success($automation->fresh(), $message);
    }

    private function rules(bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        return [
            'name' => [$required, 'string', 'max:150'],
            'trigger_type' => [$required, Rule::in(self::TRIGGER_TYPES)],
            'trigger_value' => ['nullable', 'string', 'max:255'],
            'conditions' => ['nullable', 'array', 'max:20'],
            'conditions.*.field' => 'sometimes|string|max:50',
            'conditions.*.operator' => 'sometimes|string|max:20',
            'conditions.*.value' => 'nullable',
            'actions' => [$required, 'array', 'min:1', 'max:20'],
            'actions.*.type' => 'required|string|max:50',
            'actions.*.value' => 'nullable',
            'is_active' => ['sometimes', 'boolean'],
        ];
    }
}