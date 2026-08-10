<?php

namespace App\Services;

use App\Models\WorkspaceSetting;
use Carbon\Carbon;

class BusinessHoursService
{
    /**
     * Check if the current time is within business hours for a workspace.
     */
    public function isWithinBusinessHours(int $workspaceId): bool
    {
        $settings = WorkspaceSetting::where('workspace_id', $workspaceId)->first();

        if (! $settings || empty($settings->business_hours)) {
            // Default: assume always within business hours
            return true;
        }

        $businessHours = $settings->business_hours;
        $timezone = $businessHours['timezone'] ?? 'UTC';
        $now = Carbon::now($timezone);
        $dayOfWeek = strtolower($now->format('l'));

        // Check if the day is enabled
        if (! isset($businessHours['days'][$dayOfWeek]) || ! $businessHours['days'][$dayOfWeek]['enabled']) {
            return false;
        }

        // Check if current time is within the day's hours
        $dayConfig = $businessHours['days'][$dayOfWeek];
        $openTime = $dayConfig['open'] ?? '09:00';
        $closeTime = $dayConfig['close'] ?? '17:00';

        $currentTime = $now->format('H:i');

        return $currentTime >= $openTime && $currentTime < $closeTime;
    }

    /**
     * Get the next business hours opening time.
     */
    public function getNextOpeningTime(int $workspaceId): ?Carbon
    {
        $settings = WorkspaceSetting::where('workspace_id', $workspaceId)->first();

        if (! $settings || empty($settings->business_hours)) {
            return null;
        }

        $businessHours = $settings->business_hours;
        $timezone = $businessHours['timezone'] ?? 'UTC';
        $now = Carbon::now($timezone);

        // Check next 7 days
        for ($i = 0; $i < 7; $i++) {
            $checkDate = $now->copy()->addDays($i);
            $dayOfWeek = strtolower($checkDate->format('l'));

            if (isset($businessHours['days'][$dayOfWeek]) && $businessHours['days'][$dayOfWeek]['enabled']) {
                $openTime = $businessHours['days'][$dayOfWeek]['open'] ?? '09:00';
                $openingTime = $checkDate->copy()->setTimeFromTimeString($openTime);

                if ($openingTime->isAfter($now)) {
                    return $openingTime;
                }
            }
        }

        return null;
    }

    /**
     * Get business hours configuration for display.
     */
    public function getBusinessHoursConfig(int $workspaceId): array
    {
        $settings = WorkspaceSetting::where('workspace_id', $workspaceId)->first();

        if (! $settings || empty($settings->business_hours)) {
            return [
                'timezone' => 'UTC',
                'days' => [
                    'monday' => ['enabled' => true, 'open' => '09:00', 'close' => '17:00'],
                    'tuesday' => ['enabled' => true, 'open' => '09:00', 'close' => '17:00'],
                    'wednesday' => ['enabled' => true, 'open' => '09:00', 'close' => '17:00'],
                    'thursday' => ['enabled' => true, 'open' => '09:00', 'close' => '17:00'],
                    'friday' => ['enabled' => true, 'open' => '09:00', 'close' => '17:00'],
                    'saturday' => ['enabled' => false, 'open' => '09:00', 'close' => '13:00'],
                    'sunday' => ['enabled' => false, 'open' => '09:00', 'close' => '17:00'],
                ],
            ];
        }

        return $settings->business_hours;
    }

    /**
     * Save business hours configuration.
     */
    public function saveBusinessHoursConfig(int $workspaceId, array $config): void
    {
        WorkspaceSetting::updateOrCreate(
            ['workspace_id' => $workspaceId],
            ['business_hours' => $config]
        );
    }
}
