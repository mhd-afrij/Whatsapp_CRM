<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CalendarEvent;
use App\Models\Lead;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class CalendarEventController extends Controller
{
    public function index(Request $request)
    {
        $this->authorize('viewAny', CalendarEvent::class);
        $query = CalendarEvent::query()->with(['lead.contact', 'creator'])->orderBy('starts_at');

        if ($request->filled('date')) {
            $query->whereDate('starts_at', $request->string('date')->toString());
        } else {
            if ($request->filled('start')) {
                $query->where('starts_at', '>=', $request->string('start')->toString());
            }
            if ($request->filled('end')) {
                $query->where('starts_at', '<=', $request->string('end')->toString());
            }
        }

        return $this->success($query->get(), 'OK');
    }

    public function store(Request $request)
    {
        $this->authorize('create', CalendarEvent::class);
        $validator = Validator::make($request->all(), [
            'title' => ['required', 'string', 'max:255'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['sometimes', 'nullable', 'date', 'after_or_equal:starts_at'],
            'location' => ['sometimes', 'nullable', 'string', 'max:255'],
            'kind' => ['sometimes', Rule::in(['follow_up', 'call', 'meeting', 'reminder', 'other'])],
            'lead_id' => ['sometimes', 'nullable', 'integer', Rule::exists('leads', 'id')],
            'reminder_at' => ['sometimes', 'nullable', 'date'],
        ]);
        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();
        $this->assertLeadBelongsToWorkspace($data['lead_id'] ?? null, $request->user()->workspace_id);
        $event = CalendarEvent::create(array_merge($data, [
            'workspace_id' => $request->user()->workspace_id,
            'created_by' => $request->user()->id,
            'kind' => $data['kind'] ?? 'follow_up',
        ]));
        AuditLogger::log('calendar_event.created', $request->user(), $event, $data, $request);

        return $this->success($event->load(['lead.contact', 'creator']), 'Calendar event created', null, 201);
    }

    public function update(Request $request, CalendarEvent $calendarEvent)
    {
        $this->authorize('update', $calendarEvent);
        $validator = Validator::make($request->all(), [
            'title' => ['sometimes', 'string', 'max:255'],
            'starts_at' => ['sometimes', 'required', 'date'],
            'ends_at' => ['sometimes', 'nullable', 'date', 'after_or_equal:starts_at'],
            'location' => ['sometimes', 'nullable', 'string', 'max:255'],
            'kind' => ['sometimes', Rule::in(['follow_up', 'call', 'meeting', 'reminder', 'other'])],
            'lead_id' => ['sometimes', 'nullable', 'integer', Rule::exists('leads', 'id')],
            'reminder_at' => ['sometimes', 'nullable', 'date'],
        ]);
        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();
        $this->assertLeadBelongsToWorkspace($data['lead_id'] ?? null, $calendarEvent->workspace_id);
        if (array_key_exists('reminder_at', $data)) {
            $data['reminder_sent_at'] = null;
        }
        $before = $calendarEvent->only(array_keys($data));
        $calendarEvent->update($data);
        AuditLogger::log('calendar_event.updated', $request->user(), $calendarEvent, $data, $request, $before);

        return $this->success($calendarEvent->load(['lead.contact', 'creator']), 'Calendar event updated');
    }

    public function complete(Request $request, CalendarEvent $calendarEvent)
    {
        $this->authorize('update', $calendarEvent);
        $calendarEvent->update(['completed_at' => now()]);
        AuditLogger::log('calendar_event.completed', $request->user(), $calendarEvent, [], $request);
        return $this->success($calendarEvent->fresh(['lead.contact', 'creator']), 'Calendar event completed');
    }

    public function reopen(Request $request, CalendarEvent $calendarEvent)
    {
        $this->authorize('update', $calendarEvent);
        $calendarEvent->update(['completed_at' => null]);
        AuditLogger::log('calendar_event.reopened', $request->user(), $calendarEvent, [], $request);
        return $this->success($calendarEvent->fresh(['lead.contact', 'creator']), 'Calendar event reopened');
    }

    public function destroy(Request $request, CalendarEvent $calendarEvent)
    {
        $this->authorize('delete', $calendarEvent);
        $calendarEvent->delete();
        AuditLogger::log('calendar_event.deleted', $request->user(), $calendarEvent, [], $request);
        return $this->success(null, 'Calendar event deleted');
    }

    private function assertLeadBelongsToWorkspace(?int $leadId, int $workspaceId): void
    {
        if ($leadId !== null && ! Lead::query()->whereKey($leadId)->where('workspace_id', $workspaceId)->exists()) {
            abort(404);
        }
    }
}