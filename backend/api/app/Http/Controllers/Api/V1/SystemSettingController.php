<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\SystemSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SystemSettingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $workspaceId = $request->user()->workspace_id;

        $settings = SystemSetting::where('workspace_id', $workspaceId)
            ->get()
            ->mapWithKeys(fn ($s) => [$s->key => $s->cast_value]);

        return response()->json(['data' => $settings]);
    }

    public function show(Request $request, string $key): JsonResponse
    {
        $setting = SystemSetting::where('workspace_id', $request->user()->workspace_id)
            ->where('key', $key)
            ->firstOrFail();

        return response()->json(['data' => ['key' => $setting->key, 'value' => $setting->cast_value]]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'settings' => 'required|array',
            'settings.*' => 'nullable',
        ]);

        $workspaceId = $request->user()->workspace_id;

        foreach ($validated['settings'] as $key => $value) {
            SystemSetting::updateOrCreate(
                ['workspace_id' => $workspaceId, 'key' => $key],
                [
                    'value' => is_array($value) ? json_encode($value) : (string) $value,
                    'type' => match (true) {
                        is_bool($value) => 'boolean',
                        is_int($value) => 'integer',
                        is_array($value) => 'json',
                        default => 'string',
                    },
                ]
            );
        }

        return response()->json(['message' => 'Settings updated successfully.']);
    }
}
