<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RoleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $roles = Role::whereNull('workspace_id')
            ->orWhere('workspace_id', $request->user()->workspace_id)
            ->with('permissions:id,key,description')
            ->orderBy('name')
            ->get(['id', 'workspace_id', 'name', 'slug', 'is_system_role']);

        return response()->json(['data' => $roles]);
    }

    public function permissions(): JsonResponse
    {
        return response()->json([
            'data' => Permission::orderBy('key')->get(['id', 'key', 'description']),
        ]);
    }
}
