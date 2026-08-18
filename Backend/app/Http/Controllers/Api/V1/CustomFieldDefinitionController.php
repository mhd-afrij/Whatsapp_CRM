<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CustomFieldDefinition;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CustomFieldDefinitionController extends Controller
{
    public function index(Request $request)
    {
        $entityType = $request->string('entity_type', 'contact')->toString();

        $definitions = CustomFieldDefinition::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->where('entity_type', $entityType)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return $this->success($definitions);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'entity_type' => 'required|string|max:50|in:contact,lead,deal',
            'name' => 'required|string|max:100',
            'field_type' => 'required|string|in:text,number,select,date,boolean',
            'options' => 'nullable|array',
            'options.*.label' => 'required_with:options|string|max:100',
            'options.*.value' => 'required_with:options|string|max:100',
            'is_required' => 'boolean',
            'is_active' => 'boolean',
            'sort_order' => 'integer|min:0',
        ]);

        $key = Str::slug($validated['name'], '_');

        // Ensure key is unique within workspace + entity_type
        $existingCount = CustomFieldDefinition::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->where('entity_type', $validated['entity_type'])
            ->where('key', $key)
            ->count();

        if ($existingCount > 0) {
            $key = $key . '_' . ($existingCount + 1);
        }

        $definition = CustomFieldDefinition::create([
            'workspace_id' => $request->user()->workspace_id,
            'entity_type' => $validated['entity_type'],
            'name' => $validated['name'],
            'key' => $key,
            'field_type' => $validated['field_type'],
            'options' => $validated['options'] ?? null,
            'is_required' => $validated['is_required'] ?? false,
            'is_active' => $validated['is_active'] ?? true,
            'sort_order' => $validated['sort_order'] ?? 0,
        ]);

        return $this->success($definition, 'Custom field created.', [], 201);
    }

    public function update(Request $request, int $id)
    {
        $definition = CustomFieldDefinition::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->findOrFail($id);

        $validated = $request->validate([
            'name' => 'sometimes|string|max:100',
            'field_type' => 'sometimes|string|in:text,number,select,date,boolean',
            'options' => 'nullable|array',
            'options.*.label' => 'required_with:options|string|max:100',
            'options.*.value' => 'required_with:options|string|max:100',
            'is_required' => 'boolean',
            'is_active' => 'boolean',
            'sort_order' => 'integer|min:0',
        ]);

        $definition->update($validated);

        return $this->success($definition);
    }

    public function destroy(Request $request, int $id)
    {
        $definition = CustomFieldDefinition::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->findOrFail($id);

        $definition->delete();

        return $this->success(null, 'Custom field deleted.');
    }
}
