<?php

use App\Http\Controllers\Api\V1\AuthController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1/auth')->group(function () {
    Route::post('/register', [AuthController::class, 'register'])
        ->middleware('throttle:10,1');
    Route::post('/login', [AuthController::class, 'login'])
        ->middleware('throttle:20,1');
    Route::post('/refresh', [AuthController::class, 'refresh'])
        ->middleware('throttle:60,1');
    Route::post('/password/forgot', [AuthController::class, 'forgotPassword'])
        ->middleware('throttle:5,1');
    Route::post('/password/reset', [AuthController::class, 'resetPassword'])
        ->middleware('throttle:5,1');

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('/logout', [AuthController::class, 'logout']);
        Route::get('/me', [AuthController::class, 'me']);
        Route::get('/sessions', [AuthController::class, 'sessions']);
        Route::delete('/sessions/{session}', [AuthController::class, 'destroySession']);
    });
});
