<?php

use App\Http\Controllers\Api\V1\AuditLogController;
use App\Http\Controllers\Api\V1\RoleController;
use App\Http\Controllers\Api\V1\UserController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->middleware('auth:sanctum')->group(function () {
    Route::get('/roles', [RoleController::class, 'index'])
        ->middleware('permission:roles.manage');
    Route::get('/permissions', [RoleController::class, 'permissions'])
        ->middleware('permission:roles.manage');
    Route::get('/audit-logs', [AuditLogController::class, 'index'])
        ->middleware('permission:audit.view');
    Route::get('/users', [UserController::class, 'index'])
        ->middleware('permission:users.view');
});
