<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Lead;
use App\Repositories\LeadRepository;
use App\Traits\Auditable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeadController extends Controller
{
    use Auditable;

    public function __construct(
        private readonly LeadRepository $leads,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $data = $this->leads->getByWorkspace($request->user()->workspace_id);

        return response()->json(['data' => $data]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'customer_name' => ['required', 'string', 'max:255'],
            'value' => ['nullable', 'string', 'max:255'],
            'stage' => ['required', 'string', 'max:255'],
            'agent_name' => ['nullable', 'string', 'max:255'],
            'expected_close_date' => ['nullable', 'date'],
        ]);

        $lead = $this->leads->create(
            $data + ['workspace_id' => $request->user()->workspace_id]
        );

        $this->auditLog(
            $request->user()->workspace_id,
            $request->user(),
            'lead.create',
            'Lead',
            $lead->id,
            null,
            $lead->toArray()
        );

        return response()->json(['data' => $lead], 201);
    }

    public function update(Request $request, Lead $lead): JsonResponse
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

        $before = $lead->toArray();
        $lead = $this->leads->update($lead, $data);

        $this->auditLog(
            $request->user()->workspace_id,
            $request->user(),
            'lead.update',
            'Lead',
            $lead->id,
            $before,
            $lead->toArray()
        );

        return response()->json(['data' => $lead]);
    }

    public function archive(Request $request, Lead $lead): JsonResponse
    {
        abort_unless($lead->workspace_id === $request->user()->workspace_id, 404);

        $this->leads->delete($lead);

        $this->auditLog(
            $request->user()->workspace_id,
            $request->user(),
            'lead.archive',
            'Lead',
            $lead->id
        );

        return response()->json(['data' => null, 'message' => 'Lead archived.']);
    }

    public function destroy(Request $request, Lead $lead): JsonResponse
    {
        abort_unless($lead->workspace_id === $request->user()->workspace_id, 404);

        $this->leads->delete($lead);

        $this->auditLog(
            $request->user()->workspace_id,
            $request->user(),
            'lead.delete',
            'Lead',
            $lead->id
        );

        return response()->json(['data' => null, 'message' => 'Lead deleted.']);
    }
}
