<?php

use App\Http\Controllers\Api\V1\AuditLogController;
use App\Http\Controllers\Api\V1\RoleController;
use App\Http\Controllers\Api\V1\UserController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->middleware('auth:sanctum')->group(function () {
    // Users
    Route::get('/users', [UserController::class, 'index'])
        ->middleware('permission:users.view');
    Route::post('/users', [UserController::class, 'store'])
        ->middleware('permission:users.invite');
    Route::get('/users/{id}', [UserController::class, 'show'])
        ->middleware('permission:users.view');
    Route::get('/users/{id}/permissions', [UserController::class, 'permissions'])
        ->middleware('permission:users.view');
    Route::put('/users/{id}', [UserController::class, 'update'])
        ->middleware('permission:users.update');
    Route::put('/users/{id}/permissions', [UserController::class, 'syncPermissions'])
        ->middleware('permission:users.update');
    Route::patch('/users/{id}/status', [UserController::class, 'updateStatus'])
        ->middleware('permission:users.update');
    Route::post('/users/{id}/reset-password', [UserController::class, 'resetPassword'])
        ->middleware('permission:users.update');
    Route::post('/users/{id}/resend-invite', [UserController::class, 'resendInvite'])
        ->middleware('permission:users.invite');
    Route::delete('/users/{id}', [UserController::class, 'destroy'])
        ->middleware('permission:users.delete');
    Route::post('/users/{id}/avatar', [UserController::class, 'avatar'])
        ->middleware('permission:users.update');

    // Roles
    Route::get('/roles', [RoleController::class, 'index'])
        ->middleware('permission:roles.manage');
    Route::get('/permissions', [RoleController::class, 'permissions'])
        ->middleware('permission:roles.manage');
    Route::post('/roles', [RoleController::class, 'store'])
        ->middleware('permission:roles.manage');
    Route::get('/roles/{id}', [RoleController::class, 'show'])
        ->middleware('permission:roles.manage');
    Route::put('/roles/{id}', [RoleController::class, 'update'])
        ->middleware('permission:roles.manage');
    Route::put('/roles/{id}/permissions', [RoleController::class, 'syncPermissions'])
        ->middleware('permission:roles.manage');
    Route::delete('/roles/{id}', [RoleController::class, 'destroy'])
        ->middleware('permission:roles.manage');

    // Audit Logs
    Route::get('/audit-logs', [AuditLogController::class, 'index'])
        ->middleware('permission:audit.view');
});
