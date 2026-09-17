<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Models\LeadSource;
use Illuminate\Http\Request;

class LeadSourceController extends Controller
{
    public function index(Request $request)
    {
        $workspaceId = $request->user()->workspace_id;
        LeadSource::seedDefaults($workspaceId);

        $sources = LeadSource::query()
            ->where('workspace_id', $workspaceId)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(function (LeadSource $source) {
                $source->leads_count = Lead::query()
                    ->where('workspace_id', $source->workspace_id)
                    ->where('source', $source->slug)
                    ->count();

                return $source;
            });

        return $this->success($sources);
    }

    public function store(Request $request)
    {
        $workspaceId = $request->user()->workspace_id;
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'color' => 'sometimes|string|max:20',
            'icon' => 'sometimes|nullable|string|max:50',
            'description' => 'sometimes|nullable|string|max:255',
            'is_default' => 'boolean',
            'is_active' => 'boolean',
        ]);

        if ($this->nameExists($workspaceId, $validated['name'])) {
            return $this->error('A lead source with this name already exists.');
        }

        $source = new LeadSource([
            'workspace_id' => $workspaceId,
            'name' => $validated['name'],
            'slug' => $this->uniqueSlug($workspaceId, $validated['name']),
            'color' => $validated['color'] ?? '#22c55e',
            'icon' => $validated['icon'] ?? null,
            'description' => $validated['description'] ?? null,
            'is_active' => $validated['is_active'] ?? true,
            'is_default' => $validated['is_default'] ?? false,
            'sort_order' => (LeadSource::max('sort_order') ?? -1) + 1,
        ]);

        if ($source->is_default) {
            LeadSource::query()
                ->where('workspace_id', $workspaceId)
                ->where('is_default', true)
                ->update(['is_default' => false]);
        }

        $source->save();

        return $this->success($source, 'Lead source created.', [], 201);
    }

    public function update(Request $request, int $id)
    {
        $workspaceId = $request->user()->workspace_id;
        $source = LeadSource::query()->where('workspace_id', $workspaceId)->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:100',
            'color' => 'sometimes|string|max:20',
            'icon' => 'sometimes|nullable|string|max:50',
            'description' => 'sometimes|nullable|string|max:255',
            'is_default' => 'boolean',
            'is_active' => 'boolean',
        ]);

        if (isset($validated['name']) && $this->nameExists($workspaceId, $validated['name'], $source->id)) {
            return $this->error('A lead source with this name already exists.');
        }

        if (isset($validated['name']) && $validated['name'] !== $source->name) {
            $validated['slug'] = $this->uniqueSlug($workspaceId, $validated['name'], $source->id);
        }

        if (! empty($validated['is_default'])) {
            LeadSource::query()
                ->where('workspace_id', $workspaceId)
                ->where('id', '!=', $source->id)
                ->update(['is_default' => false]);
        }

        $source->update($validated);

        return $this->success($source, 'Lead source updated.');
    }

    public function destroy(Request $request, int $id)
    {
        $workspaceId = $request->user()->workspace_id;
        $source = LeadSource::query()->where('workspace_id', $workspaceId)->findOrFail($id);

        Lead::query()
            ->where('workspace_id', $workspaceId)
            ->where('source', $source->slug)
            ->update(['source' => 'other', 'source_detail' => $source->slug]);

        $source->delete();

        return $this->success(null, 'Lead source deleted.');
    }

    public function reorder(Request $request)
    {
        $workspaceId = $request->user()->workspace_id;
        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer',
        ]);

        foreach (array_values($validated['ids']) as $index => $sourceId) {
            LeadSource::query()
                ->where('workspace_id', $workspaceId)
                ->where('id', $sourceId)
                ->update(['sort_order' => $index]);
        }

        return $this->success(null, 'Lead sources reordered.');
    }

    private function nameExists(int $workspaceId, string $name, ?int $ignoreId = null): bool
    {
        return LeadSource::query()
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

        while (LeadSource::query()
            ->where('workspace_id', $workspaceId)
            ->where('slug', $slug)
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists()) {
            $slug = $base.'-'.(++$count);
        }

        return $slug;
    }
}