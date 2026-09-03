<?php

namespace App\Traits;

use Illuminate\Http\JsonResponse;

trait ApiResponse
{
    protected function successResponse(mixed $data = null, string $message = 'Success', int $status = 200): JsonResponse
    {
        return response()->json([
            'data' => $data,
            'message' => $message,
        ], $status);
    }

    protected function errorResponse(string $message, string $code, int $status, ?array $errors = null): JsonResponse
    {
        return response()->json([
            'message' => $message,
            'code' => $code,
            'errors' => $errors,
        ], $status);
    }

    protected function createdResponse(mixed $data = null, string $message = 'Created successfully'): JsonResponse
    {
        return $this->successResponse($data, $message, 201);
    }

    protected function noContentResponse(string $message = 'Deleted successfully'): JsonResponse
    {
        return response()->json([
            'data' => null,
            'message' => $message,
        ], 200);
    }
}
