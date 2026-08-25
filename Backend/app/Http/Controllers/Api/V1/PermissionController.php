<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\Role;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;

class PermissionController extends Controller
{
    use ApiResponse;

    /**
     * Full permission catalog, grouped, for building the role/permission-matrix editor UI.
     */
    public function index(Request $request)
    {
        $this->authorize('viewAny', Role::class);

        $permissions = Permission::orderBy('group')->orderBy('name')->get(['id', 'name', 'group', 'description']);

        return $this->success($permissions->groupBy('group')->map(fn ($group) => $group->values()), 'OK');
    }
}
