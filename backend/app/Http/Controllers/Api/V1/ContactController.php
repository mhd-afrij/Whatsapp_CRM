<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\ContactActivity;
use App\Models\Label;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ContactController extends Controller
{
    /**
     * GET /api/v1/contacts
     * Search (name/email/phone/company), filters (owner_user_id, has_conversation),
     * sort (sort=field, direction=asc|desc), pagination.
     */
    public function index(Request $request)
    {
        $this->authorize('viewAny', Contact::class);

        $query = Contact::query()->with(['owner', 'whatsappContact', 'labels']);

        if ($request->filled('search')) {
            $search = $request->string('search')->toString();
            $query->where(function ($q) use ($search) {
                $q->where('full_name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone_number', 'like', "%{$search}%")
                    ->orWhere('company', 'like', "%{$search}%");
            });
        }

        if ($request->filled('owner_user_id')) {
            $query->where('owner_user_id', $request->integer('owner_user_id'));
        }

        if ($request->boolean('archived')) {
            $query->onlyTrashed();
        }

        // Multi-label filter: any-match (OR) semantics - the more common CRM convention
        // ("show me contacts tagged VIP or Hot Lead"), not requiring all labels to match.
        if ($request->filled('labels')) {
            $labelIds = array_map('intval', (array) $request->input('labels'));
            $query->whereHas('labels', fn ($q) => $q->whereIn('labels.id', $labelIds));
        }

        $sort = $request->string('sort', 'created_at')->toString();
        $direction = $request->string('direction', 'desc')->toString() === 'asc' ? 'asc' : 'desc';
        $allowedSorts = ['full_name', 'email', 'company', 'created_at', 'updated_at'];
        if (! in_array($sort, $allowedSorts, true)) {
            $sort = 'created_at';
        }

        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        $paginator = $query->orderBy($sort, $direction)->orderByDesc('id')->paginate($perPage);

        return $this->success($paginator->items(), 'OK', [
            'page' => $paginator->currentPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
            'last_page' => $paginator->lastPage(),
        ]);
    }

    /**
     * GET /api/v1/contacts/{id}
     * Includes conversation history, activity timeline, and linked leads/deals
     * (empty arrays if those modules haven't shipped an API yet - never fabricated).
     */
    public function show(Request $request, Contact $contact)
    {
        $this->authorize('view', $contact);

        $contact->load([
            'owner',
            'whatsappContact',
            'labels',
            'conversations' => fn ($q) => $q->orderByDesc('last_message_at')->limit(20),
            'activities' => fn ($q) => $q->orderByDesc('occurred_at')->limit(50),
            'leads',
            'deals',
        ]);

        return $this->success($contact, 'OK');
    }

    /**
     * POST /api/v1/contacts
     * Flags (does not block) duplicate phone numbers within the workspace.
     */
    public function store(Request $request)
    {
        $this->authorize('create', Contact::class);

        $validator = Validator::make($request->all(), $this->rules());

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();
        $workspaceId = $request->user()->workspace_id;

        $duplicate = $this->findDuplicate($workspaceId, $data['phone_number'] ?? null);

        $contact = Contact::create(array_merge($data, [
            'workspace_id' => $workspaceId,
            'owner_user_id' => $data['owner_user_id'] ?? $request->user()->id,
        ]));

        $this->logActivity($contact, 'other', 'Contact created', $request->user()->id);
        AuditLogger::log('contact.created', $request->user(), $contact, $data, $request);

        return $this->success([
            'contact' => $contact->fresh(['owner', 'whatsappContact', 'labels']),
            'duplicate_of' => $duplicate?->only(['id', 'full_name', 'phone_number']),
        ], $duplicate ? 'Contact created (possible duplicate detected)' : 'Contact created', null, 201);
    }

    /**
     * PATCH /api/v1/contacts/{id}
     * CRM-enrichment fields only - whatsapp_contact_id linkage and any gateway-owned
     * WhatsApp profile data (held on whatsapp_contacts) are never written here.
     */
    public function update(Request $request, Contact $contact)
    {
        $this->authorize('update', $contact);

        $validator = Validator::make($request->all(), $this->rules($contact->id));

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();
        $before = $contact->only(array_keys($data));
        $contact->update($data);

        $this->logActivity($contact, 'other', 'Contact updated', $request->user()->id);
        AuditLogger::log('contact.updated', $request->user(), $contact, $data, $request, $before);

        return $this->success($contact->fresh(['owner', 'whatsappContact', 'labels']), 'Contact updated');
    }

    /**
     * DELETE /api/v1/contacts/{id} - soft delete (archive).
     */
    public function destroy(Request $request, Contact $contact)
    {
        $this->authorize('delete', $contact);

        $contact->delete();

        $this->logActivity($contact, 'other', 'Contact archived', $request->user()->id);
        AuditLogger::log('contact.archived', $request->user(), $contact, [], $request);

        return $this->success(null, 'Contact archived');
    }

    /**
     * POST /api/v1/contacts/{id}/restore
     */
    public function restore(Request $request, int $id)
    {
        $contact = Contact::withTrashed()->findOrFail($id);
        $this->authorize('delete', $contact);

        $contact->restore();

        $this->logActivity($contact, 'other', 'Contact restored', $request->user()->id);
        AuditLogger::log('contact.restored', $request->user(), $contact, [], $request);

        return $this->success($contact->fresh(), 'Contact restored');
    }

    /**
     * POST /api/v1/contacts/import
     * CSV columns: full_name,email,company,job_title,phone_number.
     * Returns a per-row validation report; duplicates are flagged, not silently
     * created or rejected - the caller decides via the report.
     */
    public function import(Request $request)
    {
        $this->authorize('create', Contact::class);

        $validator = Validator::make($request->all(), [
            'file' => 'required|file|mimes:csv,txt|max:5120',
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $path = $request->file('file')->getRealPath();
        $handle = fopen($path, 'r');
        $header = fgetcsv($handle);
        $header = array_map(fn ($h) => strtolower(trim((string) $h)), $header ?: []);

        $allowed = ['full_name', 'email', 'company', 'job_title', 'phone_number'];
        $workspaceId = $request->user()->workspace_id;

        $report = ['created' => [], 'failed' => [], 'duplicates' => []];
        $rowNumber = 1;

        while (($row = fgetcsv($handle)) !== false) {
            $rowNumber++;
            $rowData = [];
            foreach ($header as $i => $col) {
                if (in_array($col, $allowed, true)) {
                    $rowData[$col] = isset($row[$i]) ? trim((string) $row[$i]) : null;
                }
            }

            $rowValidator = Validator::make($rowData, [
                'full_name' => 'nullable|string|max:255',
                'email' => 'nullable|email|max:255',
                'company' => 'nullable|string|max:255',
                'job_title' => 'nullable|string|max:150',
                'phone_number' => 'nullable|string|max:32',
            ]);

            if ($rowValidator->fails()) {
                $report['failed'][] = [
                    'row' => $rowNumber,
                    'data' => $rowData,
                    'errors' => $rowValidator->errors()->all(),
                ];

                continue;
            }

            $data = $rowValidator->validated();

            if (empty($data['full_name']) && empty($data['phone_number']) && empty($data['email'])) {
                $report['failed'][] = [
                    'row' => $rowNumber,
                    'data' => $rowData,
                    'errors' => ['Row has no name, email, or phone number.'],
                ];

                continue;
            }

            $duplicate = $this->findDuplicate($workspaceId, $data['phone_number'] ?? null);

            $contact = Contact::create(array_merge($data, [
                'workspace_id' => $workspaceId,
                'owner_user_id' => $request->user()->id,
            ]));

            $this->logActivity($contact, 'other', 'Contact imported', $request->user()->id);

            if ($duplicate) {
                $report['duplicates'][] = [
                    'row' => $rowNumber,
                    'contact_id' => $contact->id,
                    'duplicate_of_contact_id' => $duplicate->id,
                    'phone_number' => $data['phone_number'] ?? null,
                ];
            }

            $report['created'][] = ['row' => $rowNumber, 'contact_id' => $contact->id];
        }

        fclose($handle);

        AuditLogger::log('contact.imported', $request->user(), null, [
            'created' => count($report['created']),
            'failed' => count($report['failed']),
            'duplicates' => count($report['duplicates']),
        ], $request);

        return $this->success($report, sprintf(
            'Import complete: %d created (%d flagged as possible duplicates), %d failed.',
            count($report['created']),
            count($report['duplicates']),
            count($report['failed'])
        ));
    }

    /**
     * GET /api/v1/contacts/export - streams a CSV of the workspace's contacts.
     */
    public function export(Request $request): StreamedResponse
    {
        $this->authorize('export', Contact::class);

        $workspaceId = $request->user()->workspace_id;
        $columns = ['id', 'full_name', 'email', 'company', 'job_title', 'phone_number', 'owner_user_id', 'created_at'];

        $response = new StreamedResponse(function () use ($workspaceId, $columns) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, $columns);

            Contact::query()->where('workspace_id', $workspaceId)
                ->orderBy('id')
                ->chunk(500, function ($contacts) use ($handle, $columns) {
                    foreach ($contacts as $contact) {
                        fputcsv($handle, array_map(fn ($c) => $contact->{$c}, $columns));
                    }
                });

            fclose($handle);
        });

        $response->headers->set('Content-Type', 'text/csv');
        $response->headers->set('Content-Disposition', 'attachment; filename="contacts.csv"');

        return $response;
    }

    protected function rules(?int $ignoreId = null): array
    {
        return [
            'full_name' => 'sometimes|nullable|string|max:255',
            'email' => 'sometimes|nullable|email|max:255',
            'company' => 'sometimes|nullable|string|max:255',
            'job_title' => 'sometimes|nullable|string|max:150',
            'phone_number' => 'sometimes|nullable|string|max:32',
            'custom_fields' => 'sometimes|nullable|array',
            'owner_user_id' => [
                'sometimes', 'nullable', 'integer',
                Rule::exists('users', 'id'),
            ],
        ];
    }

    protected function findDuplicate(int $workspaceId, ?string $phoneNumber): ?Contact
    {
        if (! $phoneNumber) {
            return null;
        }

        return Contact::query()
            ->where('workspace_id', $workspaceId)
            ->where('phone_number', $phoneNumber)
            ->first();
    }

    protected function logActivity(Contact $contact, string $type, string $description, ?int $userId): void
    {
        ContactActivity::create([
            'workspace_id' => $contact->workspace_id,
            'contact_id' => $contact->id,
            'activity_type' => $type,
            'description' => $description,
            'occurred_at' => now(),
            'created_by' => $userId,
        ]);
    }

    /**
     * POST /api/v1/contacts/{contact}/labels/{label}
     */
    public function attachLabel(Request $request, Contact $contact, Label $label)
    {
        $this->authorize('update', $contact);

        $contact->labels()->syncWithoutDetaching([$label->id => ['created_at' => now()]]);

        return $this->success($contact->fresh(['labels']), 'Label attached');
    }

    /**
     * DELETE /api/v1/contacts/{contact}/labels/{label}
     */
    public function detachLabel(Request $request, Contact $contact, Label $label)
    {
        $this->authorize('update', $contact);

        $contact->labels()->detach($label->id);

        return $this->success($contact->fresh(['labels']), 'Label detached');
    }
}
