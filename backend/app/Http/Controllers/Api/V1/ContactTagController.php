<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ContactTag;
use Illuminate\Http\Request;

class ContactTagController extends Controller
{
    public function index(Request $request)
    {
        $tags = ContactTag::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->withCount('contacts')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return $this->success($tags);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:100',
            'color' => 'sometimes|string|max:20',
            'description' => 'nullable|string|max:500',
            'sort_order' => 'integer|min:0',
        ]);

        $tag = ContactTag::create([
            'workspace_id' => $request->user()->workspace_id,
            'name' => $validated['name'],
            'color' => $validated['color'] ?? '#22c55e',
            'description' => $validated['description'] ?? null,
            'sort_order' => $validated['sort_order'] ?? 0,
        ]);

        return $this->success($tag, 'Tag created.', [], 201);
    }

    public function update(Request $request, int $id)
    {
        $tag = ContactTag::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:100',
            'color' => 'sometimes|string|max:20',
            'description' => 'nullable|string|max:500',
            'sort_order' => 'integer|min:0',
        ]);

        $tag->update($validated);

        return $this->success($tag, 'Tag updated.');
    }

    public function destroy(Request $request, int $id)
    {
        $tag = ContactTag::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->findOrFail($id);

        $tag->delete();

        return $this->success(null, 'Tag deleted.');
    }
}