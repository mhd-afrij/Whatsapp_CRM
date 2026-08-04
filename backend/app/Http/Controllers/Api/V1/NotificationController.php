<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;

/**
 * Every query here is additionally scoped to `user_id = $request->user()->id`, on top of
 * the `BelongsToWorkspace` global scope Notification already has - a notification is
 * private to the one user it was created for, never shared workspace-wide, so workspace
 * scoping alone would not be enough isolation (see NotificationTest::
 * test_user_never_sees_another_users_notifications).
 */
class NotificationController extends Controller
{
    use ApiResponse;

    /**
     * GET /api/v1/notifications?unread=1&page=&per_page=
     * Unread-first ordering (read_at IS NULL first), then most recent.
     */
    public function index(Request $request)
    {
        $query = Notification::query()->where('user_id', $request->user()->id);

        if ($request->boolean('unread')) {
            $query->whereNull('read_at');
        }

        $perPage = (int) $request->integer('per_page', 20);
        $perPage = $perPage > 0 && $perPage <= 100 ? $perPage : 20;

        $paginator = $query
            ->orderByRaw('read_at IS NOT NULL')
            ->orderByDesc('created_at')
            ->paginate($perPage);

        return $this->success($paginator->items(), 'OK', [
            'current_page' => $paginator->currentPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
            'last_page' => $paginator->lastPage(),
            'unread_count' => Notification::query()
                ->where('user_id', $request->user()->id)
                ->whereNull('read_at')
                ->count(),
        ]);
    }

    /**
     * PATCH /api/v1/notifications/{id}/read
     */
    public function markRead(Request $request, Notification $notification)
    {
        if ($notification->user_id !== $request->user()->id) {
            return $this->error('Not found.', null, 404);
        }

        if (! $notification->read_at) {
            $notification->update(['read_at' => now()]);
        }

        return $this->success($notification->fresh(), 'Notification marked read');
    }

    /**
     * POST /api/v1/notifications/mark-all-read
     */
    public function markAllRead(Request $request)
    {
        $updated = Notification::query()
            ->where('user_id', $request->user()->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return $this->success(['updated' => $updated], 'All notifications marked read');
    }
}
