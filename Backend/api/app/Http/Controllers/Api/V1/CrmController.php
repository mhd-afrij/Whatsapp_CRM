<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CalendarEvent;
use App\Models\Customer;
use App\Models\Lead;
use App\Models\Task;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class CrmController extends Controller
{
    public function leads(Request $request): JsonResponse
    {
        return response()->json([
            'data' => Lead::where('workspace_id', $request->user()->workspace_id)
                ->orderByDesc('created_at')
                ->get(),
        ]);
    }

    public function storeLead(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'customer_name' => ['required', 'string', 'max:255'],
            'value' => ['nullable', 'string', 'max:255'],
            'stage' => ['required', 'string', 'max:255'],
            'agent_name' => ['nullable', 'string', 'max:255'],
            'expected_close_date' => ['nullable', 'date'],
        ]);

        $lead = Lead::create($data + ['workspace_id' => $request->user()->workspace_id]);

        return response()->json(['data' => $lead], 201);
    }

    public function updateLead(Request $request, Lead $lead): JsonResponse
    {
        abort_unless($lead->workspace_id === $request->user()->workspace_id, 404);

        $data = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'customer_name' => ['sometimes', 'required', 'string', 'max:255'],
            'value' => ['nullable', 'string', 'max:255'],
            'stage' => ['sometimes', 'required', 'string', 'max:255'],
            'agent_name' => ['nullable', 'string', 'max:255'],
            'expected_close_date' => ['nullable', 'date'],
        ]);

        $lead->fill($data)->save();

        return response()->json(['data' => $lead]);
    }

    public function archiveLead(Request $request, Lead $lead): JsonResponse
    {
        abort_unless($lead->workspace_id === $request->user()->workspace_id, 404);
        $lead->delete();

        return response()->json(['data' => null, 'message' => 'Lead archived.']);
    }

    public function destroyLead(Request $request, Lead $lead): JsonResponse
    {
        abort_unless($lead->workspace_id === $request->user()->workspace_id, 404);
        $lead->forceDelete();

        return response()->json(['data' => null, 'message' => 'Lead deleted.']);
    }

    public function customers(Request $request): JsonResponse
    {
        return response()->json([
            'data' => Customer::where('workspace_id', $request->user()->workspace_id)
                ->orderBy('name')
                ->get(),
        ]);
    }

    public function storeCustomer(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
            'stage' => ['required', 'string', 'max:255'],
            'agent_name' => ['nullable', 'string', 'max:255'],
            'last_contact_at' => ['nullable', 'date'],
        ]);

        $customer = Customer::create($data + ['workspace_id' => $request->user()->workspace_id]);

        return response()->json(['data' => $customer], 201);
    }

    public function updateCustomer(Request $request, Customer $customer): JsonResponse
    {
        abort_unless($customer->workspace_id === $request->user()->workspace_id, 404);

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'company' => ['nullable', 'string', 'max:255'],
            'stage' => ['sometimes', 'required', 'string', 'max:255'],
            'agent_name' => ['nullable', 'string', 'max:255'],
            'last_contact_at' => ['nullable', 'date'],
        ]);

        $customer->fill($data)->save();

        return response()->json(['data' => $customer]);
    }

    public function archiveCustomer(Request $request, Customer $customer): JsonResponse
    {
        abort_unless($customer->workspace_id === $request->user()->workspace_id, 404);
        $customer->delete();

        return response()->json(['data' => null, 'message' => 'Customer archived.']);
    }

    public function destroyCustomer(Request $request, Customer $customer): JsonResponse
    {
        abort_unless($customer->workspace_id === $request->user()->workspace_id, 404);
        $customer->forceDelete();

        return response()->json(['data' => null, 'message' => 'Customer deleted.']);
    }

    public function tasks(Request $request): JsonResponse
    {
        return response()->json([
            'data' => Task::where('workspace_id', $request->user()->workspace_id)
                ->with('assignee:id,name,email')
                ->orderByRaw("FIELD(status, 'open', 'completed', 'cancelled')")
                ->orderByDesc('priority')
                ->get(),
        ]);
    }

    public function storeTask(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'due_at' => ['nullable', 'date'],
            'priority' => ['required', 'in:low,normal,high,urgent'],
            'status' => ['required', 'in:open,completed,cancelled'],
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $task = Task::create($data + ['workspace_id' => $request->user()->workspace_id]);

        return response()->json(['data' => $task], 201);
    }

    public function updateTask(Request $request, Task $task): JsonResponse
    {
        abort_unless($task->workspace_id === $request->user()->workspace_id, 404);

        $data = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'due_at' => ['nullable', 'date'],
            'priority' => ['sometimes', 'required', 'in:low,normal,high,urgent'],
            'status' => ['sometimes', 'required', 'in:open,completed,cancelled'],
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $task->fill($data)->save();

        return response()->json(['data' => $task]);
    }

    public function archiveTask(Request $request, Task $task): JsonResponse
    {
        abort_unless($task->workspace_id === $request->user()->workspace_id, 404);
        $task->delete();

        return response()->json(['data' => null, 'message' => 'Task archived.']);
    }

    public function destroyTask(Request $request, Task $task): JsonResponse
    {
        abort_unless($task->workspace_id === $request->user()->workspace_id, 404);
        $task->forceDelete();

        return response()->json(['data' => null, 'message' => 'Task deleted.']);
    }

    public function calendar(Request $request): JsonResponse
    {
        return response()->json([
            'data' => CalendarEvent::where('workspace_id', $request->user()->workspace_id)
                ->orderBy('starts_at')
                ->get(),
        ]);
    }

    public function storeCalendarEvent(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['nullable', 'date'],
            'location' => ['nullable', 'string', 'max:255'],
            'kind' => ['required', 'string', 'max:255'],
        ]);

        $event = CalendarEvent::create($data + ['workspace_id' => $request->user()->workspace_id]);

        return response()->json(['data' => $event], 201);
    }

    public function updateCalendarEvent(Request $request, CalendarEvent $event): JsonResponse
    {
        abort_unless($event->workspace_id === $request->user()->workspace_id, 404);

        $data = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'starts_at' => ['sometimes', 'required', 'date'],
            'ends_at' => ['nullable', 'date'],
            'location' => ['nullable', 'string', 'max:255'],
            'kind' => ['sometimes', 'required', 'string', 'max:255'],
        ]);

        $event->fill($data)->save();

        return response()->json(['data' => $event]);
    }

    public function archiveCalendarEvent(Request $request, CalendarEvent $event): JsonResponse
    {
        abort_unless($event->workspace_id === $request->user()->workspace_id, 404);
        $event->delete();

        return response()->json(['data' => null, 'message' => 'Calendar event archived.']);
    }

    public function destroyCalendarEvent(Request $request, CalendarEvent $event): JsonResponse
    {
        abort_unless($event->workspace_id === $request->user()->workspace_id, 404);
        $event->forceDelete();

        return response()->json(['data' => null, 'message' => 'Calendar event deleted.']);
    }
}
