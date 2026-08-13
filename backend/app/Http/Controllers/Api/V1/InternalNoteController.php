<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\InternalNote;
use App\Models\NoteMention;
use App\Models\User;
use App\Services\NotificationService;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/**
 * Internal notes are polymorphic-by-FK across conversation/contact/deal (see
 * docs/04-database-design.md `internal_notes` — explicit nullable FKs, not a morph
 * column). Gated on notes.create for writes; notes.manage_any lets any user
 * update/delete any note, otherwise only the author may. notes.view_private
 * additionally gates visibility of is_private=true notes for non-authors.
 */
class InternalNoteController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        $query = InternalNote::query()->with(['author', 'mentions.mentionedUser']);

        foreach (['conversation_id', 'contact_id', 'deal_id'] as $field) {
            if ($request->filled($field)) {
                $query->where($field, $request->integer($field));
            }
        }

        if ($request->filled('calendar_date')) {
            $query->whereDate('calendar_date', $request->string('calendar_date')->toString());
        }

        if (! $user->isSuperAdmin() && ! $user->hasPermission('notes.view_private')) {
            $query->where(function ($q) use ($user) {
                $q->where('is_private', false)->orWhere('author_id', $user->id);
            });
        }

        $notes = $query->orderByDesc('created_at')->get();

        return $this->success($notes, 'OK');
    }

    public function store(Request $request)
    {
        $user = $request->user();
        abort_unless($user->isSuperAdmin() || $user->hasPermission('notes.create'), 403, 'You do not have permission to create notes.');

        $validator = Validator::make($request->all(), [
            'conversation_id' => ['sometimes', 'nullable', 'integer', Rule::exists('conversations', 'id')],
            'contact_id' => ['sometimes', 'nullable', 'integer', Rule::exists('contacts', 'id')],
            'deal_id' => ['sometimes', 'nullable', 'integer', Rule::exists('deals', 'id')],
            'calendar_date' => ['sometimes', 'nullable', 'date'],
            'body' => ['required', 'string'],
            'is_private' => ['sometimes', 'boolean'],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();
        abort_if(
            empty($data['conversation_id']) && empty($data['contact_id'])
                && empty($data['deal_id']) && empty($data['calendar_date']),
            422,
            'A note must be linked to a conversation, contact, deal, or calendar date.'
        );

        $note = InternalNote::create(array_merge($data, [
            'workspace_id' => $user->workspace_id,
            'author_id' => $user->id,
            'is_private' => $data['is_private'] ?? false,
        ]));

        $this->createMentions($note, $request);

        AuditLogger::log('note.created', $user, $note, $data, $request);

        return $this->success($note->fresh(['author', 'mentions.mentionedUser']), 'Note created', null, 201);
    }

    public function update(Request $request, InternalNote $internalNote)
    {
        $user = $request->user();
        $this->authorizeMutation($user, $internalNote);

        $validator = Validator::make($request->all(), [
            'body' => ['required', 'string'],
            'is_private' => ['sometimes', 'boolean'],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();
        $before = $internalNote->only(array_keys($data));
        $internalNote->update($data);

        AuditLogger::log('note.updated', $user, $internalNote, $data, $request, $before);

        return $this->success($internalNote->fresh(['author', 'mentions.mentionedUser']), 'Note updated');
    }

    public function destroy(Request $request, InternalNote $internalNote)
    {
        $user = $request->user();
        $this->authorizeMutation($user, $internalNote);

        $internalNote->delete();

        AuditLogger::log('note.deleted', $user, $internalNote, [], $request);

        return $this->success(null, 'Note deleted');
    }

    private function authorizeMutation(User $user, InternalNote $note): void
    {
        if ($user->isSuperAdmin() || $user->hasPermission('notes.manage_any')) {
            return;
        }

        abort_unless($note->author_id === $user->id, 403, 'You may only edit or delete your own notes.');
    }

    private function createMentions(InternalNote $note, Request $request): void
    {
        if (! preg_match_all('/@([a-zA-Z0-9_.\-]+)/', $note->body, $matches)) {
            return;
        }

        $handles = array_unique($matches[1]);
        if (empty($handles)) {
            return;
        }

        $mentioned = User::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->where(function ($q) use ($handles) {
                foreach ($handles as $handle) {
                    $q->orWhere('name', 'like', str_replace(' ', '', $handle))
                        ->orWhere('email', 'like', $handle.'@%');
                }
            })
            ->get();

        foreach ($mentioned as $user) {
            NoteMention::create([
                'internal_note_id' => $note->id,
                'mentioned_user_id' => $user->id,
            ]);

            NotificationService::notify($user, 'note.mention', ['note_id' => $note->id]);
        }
    }
}
