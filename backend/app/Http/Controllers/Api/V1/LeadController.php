<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Lead;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class LeadController extends Controller
{
    /**
     * GET /api/v1/leads
     */
    public function index(Request $request)
    {
        $this->authorize('viewAny', Lead::class);

        $query = Lead::query()->with(['contact', 'owner', 'conversation', 'labels']);

        if ($request->filled('status')) {
            $query->where('status', $request->string('status')->toString());
        }

        if ($request->filled('source')) {
            $query->where('source', $request->string('source')->toString());
        }

        if ($request->filled('owner_user_id')) {
            $query->where('owner_user_id', $request->integer('owner_user_id'));
        }

        // Multi-label filter, any-match (OR) - see ContactController::index for rationale.
        if ($request->filled('labels')) {
            $labelIds = array_map('intval', (array) $request->input('labels'));
            $query->whereHas('labels', fn ($q) => $q->whereIn('labels.id', $labelIds));
        }

        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        $paginator = $query->orderByDesc('created_at')->paginate($perPage);

        return $this->success($paginator->items(), 'OK', [
            'page' => $paginator->currentPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
            'last_page' => $paginator->lastPage(),
        ]);
    }

    /**
     * GET /api/v1/leads/{id}
     */
    public function show(Request $request, Lead $lead)
    {
        $this->authorize('view', $lead);

        $lead->load(['contact', 'owner', 'conversation', 'deals.stage', 'labels']);

        return $this->success($lead, 'OK');
    }

    /**
     * POST /api/v1/leads
     */
    public function store(Request $request)
    {
        $this->authorize('create', Lead::class);

        $validator = Validator::make($request->all(), [
            'contact_id' => ['required', 'integer', Rule::exists('contacts', 'id')],
            'conversation_id' => ['nullable', 'integer', Rule::exists('conversations', 'id')],
            'source' => ['sometimes', Rule::in(['whatsapp', 'manual', 'import', 'other'])],
            'status' => ['sometimes', Rule::in(['new', 'contacted', 'qualified', 'disqualified', 'converted'])],
            'owner_user_id' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')],
            'notes' => ['sometimes', 'nullable', 'string'],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();

        $lead = Lead::create(array_merge($data, [
            'workspace_id' => $request->user()->workspace_id,
            'source' => $data['source'] ?? 'manual',
            'status' => $data['status'] ?? 'new',
            'owner_user_id' => $data['owner_user_id'] ?? $request->user()->id,
        ]));

        AuditLogger::log('lead.created', $request->user(), $lead, $data, $request);

        return $this->success($lead->fresh(['contact', 'owner']), 'Lead created', null, 201);
    }

    /**
     * PATCH /api/v1/leads/{id}
     */
    public function update(Request $request, Lead $lead)
    {
        $this->authorize('update', $lead);

        $validator = Validator::make($request->all(), [
            'status' => ['sometimes', Rule::in(['new', 'contacted', 'qualified', 'disqualified', 'converted'])],
            'source' => ['sometimes', Rule::in(['whatsapp', 'manual', 'import', 'other'])],
            'owner_user_id' => ['sometimes', 'nullable', 'integer', Rule::exists('users', 'id')],
            'notes' => ['sometimes', 'nullable', 'string'],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();
        $before = $lead->only(array_keys($data));
        $lead->update($data);

        AuditLogger::log('lead.updated', $request->user(), $lead, $data, $request, $before);

        return $this->success($lead->fresh(['contact', 'owner']), 'Lead updated');
    }

    /**
     * DELETE /api/v1/leads/{id}
     */
    public function destroy(Request $request, Lead $lead)
    {
        $this->authorize('delete', $lead);

        $lead->delete();

        AuditLogger::log('lead.deleted', $request->user(), $lead, [], $request);

        return $this->success(null, 'Lead deleted');
    }

    /**
     * POST /api/v1/contacts/{id}/convert-to-lead
     */
    public function convertFromContact(Request $request, Contact $contact)
    {
        $this->authorize('create', Lead::class);

        $lead = $this->convert($request, $contact, null);

        return $this->success($lead, 'Lead created from contact', null, 201);
    }

    /**
     * POST /api/v1/conversations/{id}/convert-to-lead
     */
    public function convertFromConversation(Request $request, Conversation $conversation)
    {
        $this->authorize('create', Lead::class);

        if (! $conversation->contact_id) {
            return $this->error('Conversation has no linked contact to convert.', null, 422);
        }

        $contact = Contact::query()->findOrFail($conversation->contact_id);
        $lead = $this->convert($request, $contact, $conversation->id);

        return $this->success($lead, 'Lead created from conversation', null, 201);
    }

    protected function convert(Request $request, Contact $contact, ?int $conversationId): Lead
    {
        $lead = Lead::create([
            'workspace_id' => $request->user()->workspace_id,
            'contact_id' => $contact->id,
            'conversation_id' => $conversationId,
            'source' => $conversationId ? 'whatsapp' : 'manual',
            'status' => 'new',
            'owner_user_id' => $request->user()->id,
        ]);

        AuditLogger::log('lead.converted', $request->user(), $lead, [
            'contact_id' => $contact->id,
            'conversation_id' => $conversationId,
        ], $request);

        return $lead->fresh(['contact', 'owner', 'conversation']);
    }

    /**
     * POST /api/v1/leads/{lead}/labels/{label}
     */
    public function attachLabel(Request $request, Lead $lead, \App\Models\Label $label)
    {
        $this->authorize('update', $lead);

        $lead->labels()->syncWithoutDetaching([$label->id => ['created_at' => now()]]);

        return $this->success($lead->fresh(['labels']), 'Label attached');
    }

    /**
     * DELETE /api/v1/leads/{lead}/labels/{label}
     */
    public function detachLabel(Request $request, Lead $lead, \App\Models\Label $label)
    {
        $this->authorize('update', $lead);

        $lead->labels()->detach($label->id);

        return $this->success($lead->fresh(['labels']), 'Label detached');
    }
}
