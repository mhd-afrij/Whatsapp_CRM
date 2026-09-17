<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CalendarEvent;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class CalendarEventController extends Controller
{
    /**
     * GET /api/v1/calendar-events
     *
     * Filters: date=YYYY-MM-DD (single day), or start=/end= (inclusive ISO
     * datetimes) for a range.
     */
    public function index(Request $request)
    {
        $this->authorize('viewAny', CalendarEvent::class);

        $query = CalendarEvent::query()->orderBy('starts_at');

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
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'is_all_day' => ['sometimes', 'boolean'],
            'kind' => ['sometimes', Rule::in(['follow_up', 'call', 'meeting', 'reminder', 'other'])],
            'contact_id' => ['sometimes', 'nullable', 'integer', Rule::exists('contacts', 'id')->where('workspace_id', $request->user()->workspace_id)],
            'lead_id' => ['sometimes', 'nullable', 'integer', Rule::exists('leads', 'id')->where('workspace_id', $request->user()->workspace_id)],
            'deal_id' => ['sometimes', 'nullable', 'integer', Rule::exists('deals', 'id')->where('workspace_id', $request->user()->workspace_id)],
            'reminder_minutes' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:10080'],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();

        $event = CalendarEvent::create(array_merge($data, [
            'workspace_id' => $request->user()->workspace_id,
            'kind' => $data['kind'] ?? 'follow_up',
        ]));

        AuditLogger::log('calendar_event.created', $request->user(), $event, $data, $request);

        return $this->success($event, 'Calendar event created', null, 201);
    }

    public function update(Request $request, CalendarEvent $calendarEvent)
    {
        $this->authorize('update', $calendarEvent);

        $validator = Validator::make($request->all(), [
            'title' => ['sometimes', 'string', 'max:255'],
            'starts_at' => ['sometimes', 'required', 'date'],
            'ends_at' => ['sometimes', 'nullable', 'date', 'after_or_equal:starts_at'],
            'location' => ['sometimes', 'nullable', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'is_all_day' => ['sometimes', 'boolean'],
            'kind' => ['sometimes', Rule::in(['follow_up', 'call', 'meeting', 'reminder', 'other'])],
            'contact_id' => ['sometimes', 'nullable', 'integer', Rule::exists('contacts', 'id')->where('workspace_id', $request->user()->workspace_id)],
            'lead_id' => ['sometimes', 'nullable', 'integer', Rule::exists('leads', 'id')->where('workspace_id', $request->user()->workspace_id)],
            'deal_id' => ['sometimes', 'nullable', 'integer', Rule::exists('deals', 'id')->where('workspace_id', $request->user()->workspace_id)],
            'reminder_minutes' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:10080'],
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $data = $validator->validated();
        $before = $calendarEvent->only(array_keys($data));
        $calendarEvent->update($data);

        AuditLogger::log('calendar_event.updated', $request->user(), $calendarEvent, $data, $request, $before);

        return $this->success($calendarEvent, 'Calendar event updated');
    }

    public function destroy(Request $request, CalendarEvent $calendarEvent)
    {
        $this->authorize('delete', $calendarEvent);

        $calendarEvent->delete();

        AuditLogger::log('calendar_event.deleted', $request->user(), $calendarEvent, [], $request);

        return $this->success(null, 'Calendar event deleted');
    }
}
