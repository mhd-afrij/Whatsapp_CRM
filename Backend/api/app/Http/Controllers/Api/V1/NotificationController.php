<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $notifications = Notification::where('workspace_id', $request->user()->workspace_id)
            ->where('user_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get();

        return response()->json(['data' => $notifications]);
    }

    public function markRead(Request $request, Notification $notification): JsonResponse
    {
        abort_unless(
            $notification->workspace_id === $request->user()->workspace_id
                && $notification->user_id === $request->user()->id,
            404
        );

        $notification->forceFill(['read_at' => now()])->save();

        return response()->json(['data' => $notification]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        Notification::where('workspace_id', $request->user()->workspace_id)
            ->where('user_id', $request->user()->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json(['data' => null, 'message' => 'All notifications marked as read.']);
    }
}
