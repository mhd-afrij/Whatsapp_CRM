<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Repositories\ContactRepository;
use App\Traits\Auditable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContactController extends Controller
{
    use Auditable;

    public function __construct(
        private readonly ContactRepository $contacts,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $data = $this->contacts->getByWorkspace($request->user()->workspace_id);

        return response()->json(['data' => $data]);
    }

    public function store(Request $request): JsonResponse
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

        $customer = $this->contacts->create(
            $data + ['workspace_id' => $request->user()->workspace_id]
        );

        $this->auditLog(
            $request->user()->workspace_id,
            $request->user(),
            'contact.create',
            'Contact',
            $customer->id,
            null,
            $customer->toArray()
        );

        return response()->json(['data' => $customer], 201);
    }

    public function update(Request $request, Customer $customer): JsonResponse
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

        $before = $customer->toArray();
        $customer = $this->contacts->update($customer, $data);

        $this->auditLog(
            $request->user()->workspace_id,
            $request->user(),
            'contact.update',
            'Contact',
            $customer->id,
            $before,
            $customer->toArray()
        );

        return response()->json(['data' => $customer]);
    }

    public function archive(Request $request, Customer $customer): JsonResponse
    {
        abort_unless($customer->workspace_id === $request->user()->workspace_id, 404);

        $this->contacts->delete($customer);

        $this->auditLog(
            $request->user()->workspace_id,
            $request->user(),
            'contact.archive',
            'Contact',
            $customer->id
        );

        return response()->json(['data' => null, 'message' => 'Contact archived.']);
    }

    public function destroy(Request $request, Customer $customer): JsonResponse
    {
        abort_unless($customer->workspace_id === $request->user()->workspace_id, 404);

        $this->contacts->delete($customer);

        $this->auditLog(
            $request->user()->workspace_id,
            $request->user(),
            'contact.delete',
            'Contact',
            $customer->id
        );

        return response()->json(['data' => null, 'message' => 'Contact deleted.']);
    }
}
