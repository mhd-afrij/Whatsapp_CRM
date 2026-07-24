<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\Customer;
use App\Models\Lead;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SearchController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'q' => ['required', 'string', 'min:2', 'max:255'],
        ]);

        $term = '%'.$data['q'].'%';
        $user = $request->user();
        $workspaceId = $user->workspace_id;
        $limit = 8;

        $customers = $user->hasPermission('customers.view')
            ? Customer::where('workspace_id', $workspaceId)
                ->where(fn ($q) => $q->where('name', 'like', $term)
                    ->orWhere('phone', 'like', $term)
                    ->orWhere('email', 'like', $term))
                ->limit($limit)
                ->get(['id', 'name', 'phone', 'email'])
            : collect();

        $leads = $user->hasPermission('leads.view')
            ? Lead::where('workspace_id', $workspaceId)
                ->where(fn ($q) => $q->where('title', 'like', $term)
                    ->orWhere('customer_name', 'like', $term))
                ->limit($limit)
                ->get(['id', 'title', 'customer_name', 'stage'])
            : collect();

        $tasks = $user->hasPermission('tasks.view')
            ? Task::where('workspace_id', $workspaceId)
                ->where('title', 'like', $term)
                ->limit($limit)
                ->get(['id', 'title', 'status', 'due_at'])
            : collect();

        $conversations = $user->hasPermission('conversations.view')
            ? Conversation::where('workspace_id', $workspaceId)
                ->where(fn ($q) => $q->where('contact_name', 'like', $term)
                    ->orWhere('contact_phone', 'like', $term))
                ->limit($limit)
                ->get(['id', 'contact_name', 'contact_phone', 'status'])
            : collect();

        return response()->json(['data' => [
            'customers' => $customers,
            'leads' => $leads,
            'tasks' => $tasks,
            'conversations' => $conversations,
        ]]);
    }
}
