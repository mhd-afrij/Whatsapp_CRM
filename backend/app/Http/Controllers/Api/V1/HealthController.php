<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class HealthController extends Controller
{
    /**
     * Report basic application health information.
     */
    public function __invoke(): JsonResponse
    {
        return $this->success([
            'status' => 'ok',
            'app' => config('app.name'),
            'env' => config('app.env'),
            'timestamp' => now()->toIso8601String(),
        ], 'Service is healthy');
    }
}
