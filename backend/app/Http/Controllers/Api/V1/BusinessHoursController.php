<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\WorkspaceSetting;
use App\Services\BusinessHoursService;
use App\Support\AuditLogger;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class BusinessHoursController extends Controller
{
    use ApiResponse;

    public function __construct(private readonly BusinessHoursService $businessHoursService) {}

    /**
     * GET /api/v1/workspace/business-hours
     */
    public function show(Request $request)
    {
        $this->authorize('viewAny', WorkspaceSetting::class);

        $config = $this->businessHoursService->getBusinessHoursConfig($request->user()->workspace_id);

        return $this->success($config, 'OK');
    }

    /**
     * PATCH /api/v1/workspace/business-hours
     */
    public function update(Request $request)
    {
        $this->authorize('update', WorkspaceSetting::class);

        $validator = Validator::make($request->all(), [
            'timezone' => 'required|string|max:50',
            'days' => 'required|array',
            'days.monday.enabled' => 'required|boolean',
            'days.monday.open' => 'required|string',
            'days.monday.close' => 'required|string',
            'days.tuesday.enabled' => 'required|boolean',
            'days.tuesday.open' => 'required|string',
            'days.tuesday.close' => 'required|string',
            'days.wednesday.enabled' => 'required|boolean',
            'days.wednesday.open' => 'required|string',
            'days.wednesday.close' => 'required|string',
            'days.thursday.enabled' => 'required|boolean',
            'days.thursday.open' => 'required|string',
            'days.thursday.close' => 'required|string',
            'days.friday.enabled' => 'required|boolean',
            'days.friday.open' => 'required|string',
            'days.friday.close' => 'required|string',
            'days.saturday.enabled' => 'required|boolean',
            'days.saturday.open' => 'required|string',
            'days.saturday.close' => 'required|string',
            'days.sunday.enabled' => 'required|boolean',
            'days.sunday.open' => 'required|string',
            'days.sunday.close' => 'required|string',
        ]);

        if ($validator->fails()) {
            return $this->error('Validation failed', $validator->errors(), 422);
        }

        $this->businessHoursService->saveBusinessHoursConfig(
            $request->user()->workspace_id,
            $validator->validated()
        );

        AuditLogger::log('workspace.business_hours_updated', $request->user(), null, $validator->validated());

        return $this->success($this->businessHoursService->getBusinessHoursConfig($request->user()->workspace_id), 'Business hours updated');
    }

    /**
     * GET /api/v1/workspace/business-hours/status
     * Check if currently within business hours.
     */
    public function status(Request $request)
    {
        $this->authorize('viewAny', WorkspaceSetting::class);

        $isWithin = $this->businessHoursService->isWithinBusinessHours($request->user()->workspace_id);
        $nextOpening = $this->businessHoursService->getNextOpeningTime($request->user()->workspace_id);

        return $this->success([
            'is_within_business_hours' => $isWithin,
            'next_opening_at' => $nextOpening?->toIso8601String(),
        ], 'OK');
    }
}
