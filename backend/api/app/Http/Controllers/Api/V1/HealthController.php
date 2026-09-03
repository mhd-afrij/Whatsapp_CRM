<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Throwable;

class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $database = $this->check(fn () => DB::connection()->getPdo());
        $redis = $this->check(fn () => Redis::connection()->ping());

        $status = $database && $redis ? 'ok' : 'degraded';

        return response()->json([
            'status' => $status,
            'service' => 'crm-api',
            'database' => $database ? 'connected' : 'unavailable',
            'redis' => $redis ? 'connected' : 'unavailable',
        ], $status === 'ok' ? 200 : 503);
    }

    private function check(callable $probe): bool
    {
        try {
            $probe();

            return true;
        } catch (Throwable) {
            return false;
        }
    }
}
