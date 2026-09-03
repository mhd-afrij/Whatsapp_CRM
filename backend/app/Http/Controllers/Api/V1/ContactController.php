<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\ContactActivity;
use App\Models\Label;
use App\Services\ContactDeduplicator;
use App\Services\GatewayClient;
use App\Support\AuditLogger;
use App\Support\PhoneNumber;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use RuntimeException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ContactController extends Controller
{
    /**
     * GET /api/v1/contacts
     * Search (name/email/phone/company, phone matched on the normalized key too),
     * filters (status, source, country, whatsapp connected/unavailable,
     * recently_contacted, owner_user_id, labels, archived), sort and pagination.
     */
    public function index(Request $request)
    {
        $this->authorize('viewAny', Contact::class);

        $query = Contact::query()
            ->with(['owner', 'whatsappContact', 'labels'])
            ->selectRaw('contacts.*, '.$this->lastActivitySubquery().' AS last_activity_at');

        if ($request->filled('search')) {
            $query->search($request->string('search')->toString());
        }

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }

        if ($request->filled('source')) {
            $query->where('source', $request->string('source'));
        }

        if ($request->filled('country')) {
            $query->where('country', $request->string('country'));
        }

        $whatsapp = $request->string('whatsapp')->toString();
        if ($whatsapp === 'connected') {
            $query->whatsappConnected();
        } elseif ($whatsapp === 'unavailable') {
            $query->whatsappUnavailable();
        }

        if ($request->boolean('recently_contacted')) {
            $since = now()->subDays((int) $request->integer('recently_contacted_days', 7));
            $query->where(function ($q) use ($since) {
                $q->where('last_contacted_at', '>=', $since)
                    ->orWhereHas('conversations', fn ($c) => $c->where('last_message_at', '>=', $since))
                    ->orWhereHas('whatsappContact.conversations', fn ($c) => $c->where('last_message_at', '>=', $since));
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
        $allowedSorts = ['full_name', 'email', 'company', 'created_at', 'updated_at', 'last_contacted_at', 'status'];
        if (! in_array($sort, $allowedSorts, true)) {
            $sort = 'created_at';
        }

        $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);

        $paginator = $query->orderBy($sort, $direction)->orderByDesc('id')->paginate($perPage);

        foreach ($paginator->items() as $contact) {
            $contact->last_contacted_at = $this->bestLastContactedAt($contact);
        }

        return $this->success($paginator->items(), 'OK', [
            'page' => $paginator->currentPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
            'last_page' => $paginator->lastPage(),
        ]);
    }

    /**
     * GET /api/v1/contacts/{id}
     * Includes conversation history, activity timeline, and linked deals.
     * Trashed (archived) contacts resolve too - the recreate/restore flow must
     * be able to view an archived contact before restoring it, so the lookup
     * uses withTrashed() + an explicit workspace check instead of route model
     * binding (which would 404 on soft-deleted rows).
     */
    public function show(Request $request, int $id)
    {
        $contact = Contact::withTrashed()
            ->selectRaw('contacts.*, '.$this->lastActivitySubquery().' AS last_activity_at')
            ->findOrFail($id);
        $this->authorize('view', $contact);

        $contact->load([
            'owner',
            'whatsappContact',
            'labels',
            'conversations' => fn ($q) => $q->orderByDesc('last_message_at')->limit(20),
            'activities' => fn ($q) => $q->orderByDesc('occurred_at')->limit(50),
            'deals',
            'leads',
        ]);

        $contact->last_contacted_at = $this->bestLastContactedAt($contact);

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
            'status' => $data['status'] ?? Contact::STATUS_ACTIVE,
            'source' => $data['source'] ?? Contact::SOURCE_MANUAL,
            'last_contacted_at' => $data['last_contacted_at'] ?? now(),
        ]));

        $this->logActivity($contact, 'other', 'Contact created', $request->user()->id);
        AuditLogger::log('contact.created', $request->user(), $contact, $data, $request);
        $this->relayContactEvent('contact.created', $contact);

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
        $this->relayContactEvent('contact.updated', $contact);

        return $this->success($contact->fresh(['owner', 'whatsappContact', 'labels']), 'Contact updated');
    }

    /**
     * DELETE /api/v1/contacts/{id} - soft delete (archive). Conversation and
     * message history is preserved (they reference whatsapp_contacts, not the
     * CRM contact); the audit log records the archive.
     */
    public function destroy(Request $request, Contact $contact)
    {
        $this->authorize('delete', $contact);

        $contact->delete();

        $this->logActivity($contact, 'other', 'Contact archived', $request->user()->id);
        AuditLogger::log('contact.archived', $request->user(), $contact, [], $request);
        $this->relayContactEvent('contact.deleted', $contact);

        return $this->success(null, 'Contact archived');
    }

    /**
     * POST /api/v1/contacts/{id}/restore
     * Recreates an archived (soft-deleted) contact. If a contact with the same
     * normalized phone number is already active in the workspace, both are kept
     * (the caller decides how to merge) - matching the duplicate-flagging (not
     * blocking) policy used on create.
     */
    public function restore(Request $request, int $id)
    {
        $contact = Contact::withTrashed()->findOrFail($id);
        $this->authorize('delete', $contact);

        $contact->restore();

        $this->logActivity($contact, 'other', 'Contact restored', $request->user()->id);
        AuditLogger::log('contact.restored', $request->user(), $contact, [], $request);
        $this->relayContactEvent('contact.updated', $contact);

        return $this->success($contact->fresh(), 'Contact restored');
    }

    /**
     * POST /api/v1/contacts/merge-duplicates
     * Merges duplicate contacts (same workspace + normalized phone number) that
     * were left behind before phone-based dedup was enforced on the WhatsApp
     * path: keeps the manually-saved row, re-points every linked record, and
     * deletes the rest. Pass { dry_run: true } to preview without changing
     * anything (gated on contacts.delete - it is a destructive maintenance op).
     */
    public function mergeDuplicates(Request $request, ContactDeduplicator $deduplicator)
    {
        $dryRun = $request->boolean('dry_run');
        $report = $deduplicator->mergeDuplicates($request->user()->workspace_id, $dryRun);

        AuditLogger::log(
            $dryRun ? 'contacts.merge_duplicates_preview' : 'contacts.merge_duplicates',
            $request->user(),
            null,
            ['groups' => $report['groups'], 'merged' => $report['merged'], 'deleted' => $report['deleted']],
            $request
        );

        return $this->success($report, $dryRun ? 'Duplicate contacts preview' : 'Duplicate contacts merged');
    }

    /**
     * POST /api/v1/contacts/import
     * CSV columns: full_name,email,company,job_title,phone_number,address,city,
     * country,timezone,status,source.
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

        $allowed = ['full_name', 'email', 'company', 'job_title', 'phone_number', 'address', 'city', 'country', 'timezone', 'status', 'source'];
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

            $rowValidator = Validator::make($rowData, $this->rules());

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
                'status' => $data['status'] ?? Contact::STATUS_ACTIVE,
                'source' => $data['source'] ?? Contact::SOURCE_IMPORT,
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
        $columns = ['id', 'full_name', 'email', 'company', 'job_title', 'phone_number', 'address', 'city', 'country', 'timezone', 'status', 'source', 'owner_user_id', 'last_contacted_at', 'created_at'];

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
            'address' => 'sometimes|nullable|string|max:255',
            'city' => 'sometimes|nullable|string|max:100',
            'country' => 'sometimes|nullable|string|max:100',
            'timezone' => ['sometimes', 'nullable', 'string', 'max:64', 'timezone'],
            'status' => ['sometimes', 'nullable', Rule::in([Contact::STATUS_ACTIVE, Contact::STATUS_INACTIVE])],
            'priority' => ['sometimes', 'nullable', Rule::in([Contact::PRIORITY_LOW, Contact::PRIORITY_NORMAL, Contact::PRIORITY_HIGH, Contact::PRIORITY_URGENT])],
            'source' => ['sometimes', 'nullable', 'string', 'max:30'],
            'custom_fields' => 'sometimes|nullable|array',
            'owner_user_id' => [
                'sometimes', 'nullable', 'integer',
                Rule::exists('users', 'id'),
            ],
        ];
    }

    /**
     * Finds a duplicate within the workspace using the normalized phone number
     * (spec §4), falling back to the raw value for legacy rows that predate
     * normalization. Null when the phone is empty or no match exists.
     */
    protected function findDuplicate(int $workspaceId, ?string $phoneNumber): ?Contact
    {
        if (! $phoneNumber || ! preg_match('/\d/', $phoneNumber)) {
            return null;
        }

        $normalized = PhoneNumber::normalize($phoneNumber);

        return Contact::query()
            ->where('workspace_id', $workspaceId)
            ->where(fn ($q) => $q
                ->where('normalized_phone_number', $normalized)
                ->orWhere('phone_number', $phoneNumber))
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
     * Best-effort relay of contact CRUD events to the gateway's Socket.IO layer
     * so open contact lists/details update in realtime (spec §17). A gateway
     * outage must never fail the mutation - it is already committed by the time
     * this runs - so failures are logged, not thrown.
     */
    protected function relayContactEvent(string $event, Contact $contact): void
    {
        try {
            app(GatewayClient::class)->emitEvent($event, $contact->workspace_id, null, [
                'contact_id' => $contact->id,
            ]);
        } catch (RuntimeException $e) {
            Log::warning('Failed to relay contact event to gateway', [
                'event' => $event,
                'contact_id' => $contact->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Subquery that derives the freshest conversation activity for a contact,
     * covering both linking paths: conversations.contact_id and
     * conversations.whatsapp_contact_id -> whatsapp_contacts.contact_id. Used
     * by index() and show() so "last contacted" reflects gateway-created
     * WhatsApp threads even before any backend write bumps the stored column.
     */
    protected function lastActivitySubquery(): string
    {
        return '(SELECT MAX(conv.last_message_at) FROM conversations conv WHERE conv.workspace_id = contacts.workspace_id AND (conv.contact_id = contacts.id OR conv.whatsapp_contact_id IN (SELECT wc.id FROM whatsapp_contacts wc WHERE wc.contact_id = contacts.id)))';
    }

    /**
     * The effective "last contacted" for display: the freshest of the stored
     * column and the derived max conversation activity (so gateway-created
     * WhatsApp threads count even before any backend write bumps the column).
     */
    protected function bestLastContactedAt(Contact $contact): ?Carbon
    {
        $stored = $contact->last_contacted_at?->getTimestamp() ?? 0;
        $derived = $contact->getAttribute('last_activity_at')
            ? (int) strtotime((string) $contact->getAttribute('last_activity_at'))
            : 0;

        $best = max($stored, $derived);

        return $best > 0 ? Carbon::createFromTimestampUTC($best) : $contact->last_contacted_at;
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
