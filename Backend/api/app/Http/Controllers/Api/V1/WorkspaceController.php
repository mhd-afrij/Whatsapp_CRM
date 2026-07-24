<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\WorkspaceResource;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WorkspaceController extends Controller
{
    public function __construct(private readonly AuditLogger $auditLogger) {}

    public function update(Request $request): JsonResponse
    {
        $workspace = $request->user()->workspace;

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'timezone' => ['sometimes', 'required', 'timezone'],
        ]);

        $before = ['name' => $workspace->name, 'timezone' => $workspace->timezone];

        $workspace->fill($data)->save();

        $this->auditLogger->log(
            workspaceId: $workspace->id,
            actor: $request->user(),
            action: 'workspace.updated',
            entityType: 'workspace',
            entityId: $workspace->id,
            beforeState: $before,
            afterState: ['name' => $workspace->name, 'timezone' => $workspace->timezone],
        );

        return response()->json(['data' => new WorkspaceResource($workspace)]);
    }
}
