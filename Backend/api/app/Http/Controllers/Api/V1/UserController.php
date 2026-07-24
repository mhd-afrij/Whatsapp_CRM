<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $users = User::where('workspace_id', $request->user()->workspace_id)
            ->with('roles:id,name,slug')
            ->orderBy('name')
            ->get(['id', 'uuid', 'name', 'email', 'avatar_path', 'status', 'last_login_at']);

        return response()->json(['data' => $users]);
    }
}
