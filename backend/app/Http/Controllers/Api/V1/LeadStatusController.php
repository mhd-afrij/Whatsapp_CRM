<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\LeadStatus;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class LeadStatusController extends Controller
{
    public function index(Request $request)
    {
        $workspaceId = $request->user()->workspace_id;
        LeadStatus::seedDefaults($workspaceId);

        $statuses = LeadStatus::query()
            ->where('workspace_id', $workspaceId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(function (LeadStatus $status) {
                $status->leads_count = Lead::query()
                    ->where('workspace_id', $status->workspace_id)
                    ->where('stage', $status->slug)
                    ->count();

                return $status;
            });

        return $this->success($statuses);
    }

    public function store(Request $request)
    {
        $workspaceId = $request->user()->workspace_id;
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'color' => 'sometimes|string|max:20',
            'type' => 'required|string|in:open,won,lost',
            'description' => 'sometimes|nullable|string|max:255',
            'is_default' => 'boolean',
            'is_active' => 'boolean',
        ]);

        if ($this->nameExists($workspaceId, $validated['name'])) {
            return $this->error('A lead status with this name already exists.');
        }

        $status = new LeadStatus([
            'workspace_id' => $workspaceId,
            'name' => $validated['name'],
            'slug' => $this->uniqueSlug($workspaceId, $validated['name']),
            'color' => $validated['color'] ?? '#6366f1',
            'type' => $validated['type'],
            'description' => $validated['description'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
            'is_default' => $validated['is_default'] ?? false,
            'sort_order' => (LeadStatus::max('sort_order') ?? -1) + 1,
        ]);

        if ($status->is_default) {
            LeadStatus::query()
                ->where('workspace_id', $workspaceId)
                ->where('id', '!=', $status->id)
                ->update(['is_default' => false]);
        }

        $status->save();

        return $this->success($status, 'Lead status created.', [], 201);
    }

    public function update(Request $request, int $id)
    {
        $workspaceId = $request->user()->workspace_id;
        $status = LeadStatus::query()->where('workspace_id', $workspaceId)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:100',
            'color' => 'sometimes|string|max:20',
            'type' => 'sometimes|string|in:open,won,lost',
            'description' => 'sometimes|nullable|string|max:255',
            'is_default' => 'boolean',
            'is_active' => 'boolean',
        ]);

        if (isset($validated['name']) && $this->nameExists($workspaceId, $validated['name'], $status->id)) {
            return $this->error('A lead status with this name already exists.');
        }

        if (isset($validated['name']) && $validated['name'] !== $status->name) {
            $validated['slug'] = $this->uniqueSlug($workspaceId, $validated['name'], $status->id);
        }

        if (! empty($validated['is_default'])) {
            LeadStatus::query()
                ->where('workspace_id', $workspaceId)
                ->where('id', '!=', $status->id)
                ->update(['is_default' => false]);
        }

        $status->update($validated);

        return $this->success($status, 'Lead status updated.');
    }

    public function destroy(Request $request, int $id)
    {
        $workspaceId = $request->user()->workspace_id;
        $status = LeadStatus::query()->where('workspace_id', $workspaceId)->findOrFail($id);

        $validated = $request->validate([
            'replacement_status_id' => 'required|integer|exists:lead_statuses,id',
        ]);

        if ((int) $validated['replacement_status_id'] === $status->id) {
            return $this->error('Replacement status must be different from the status being deleted.');
        }

        $replacement = LeadStatus::query()
            ->where('workspace_id', $workspaceId)
            ->findOrFail($validated['replacement_status_id']);

        Lead::query()
            ->where('workspace_id', $workspaceId)
            ->where('stage', $status->slug)
            ->update(['stage' => $replacement->slug]);

        if ($status->is_default) {
            LeadStatus::query()
                ->where('workspace_id', $workspaceId)
                ->where('id', '!=', $status->id)
                ->update(['is_default' => false]);
            $replacement->forceFill(['is_default' => true])->save();
        }

        $status->delete();

        return $this->success(null, 'Lead status deleted.');
    }

    public function reorder(Request $request)
    {
        $workspaceId = $request->user()->workspace_id;
        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer',
        ]);

        foreach (array_values($validated['ids']) as $index => $statusId) {
            LeadStatus::query()
                ->where('workspace_id', $workspaceId)
                ->where('id', $statusId)
                ->update(['sort_order' => $index]);
        }

        return $this->success(null, 'Lead statuses reordered.');
    }

    private function nameExists(int $workspaceId, string $name, ?int $ignoreId = null): bool
    {
        return LeadStatus::query()
            ->where('workspace_id', $workspaceId)
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists();
    }

    private function uniqueSlug(int $workspaceId, string $name, ?int $ignoreId = null): string
    {
        $slug = \Illuminate\Support\Str::slug($name, '_');
        $base = $slug;
        $count = 1;

        while (LeadStatus::query()
            ->where('workspace_id', $workspaceId)
            ->where('slug', $slug)
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists()) {
            $slug = $base.'-'.(++$count);
        }

        return $slug;
    }
}