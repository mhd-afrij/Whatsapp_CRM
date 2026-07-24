<?php

use App\Http\Controllers\Api\V1\AuditLogController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\ConversationController;
use App\Http\Controllers\Api\V1\CrmController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\RoleController;
use App\Http\Controllers\Api\V1\UserController;
use App\Http\Controllers\Api\V1\WhatsAppWebhookController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('/health', HealthController::class);

    Route::prefix('internal/whatsapp')->middleware('internal.secret')->group(function () {
        Route::post('/session', [WhatsAppWebhookController::class, 'sessionUpdate']);
        Route::post('/messages', [WhatsAppWebhookController::class, 'incomingMessage']);
    });

    Route::prefix('auth')->group(function () {
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

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('/crm/leads', [CrmController::class, 'leads'])
            ->middleware('permission:leads.view');
        Route::post('/crm/leads', [CrmController::class, 'storeLead'])
            ->middleware('permission:leads.create');
        Route::patch('/crm/leads/{lead}', [CrmController::class, 'updateLead'])
            ->middleware('permission:leads.update');
        Route::post('/crm/leads/{lead}/archive', [CrmController::class, 'archiveLead'])
            ->middleware('permission:leads.update');
        Route::delete('/crm/leads/{lead}', [CrmController::class, 'destroyLead'])
            ->middleware('permission:leads.delete');
        Route::get('/crm/customers', [CrmController::class, 'customers'])
            ->middleware('permission:customers.view');
        Route::post('/crm/customers', [CrmController::class, 'storeCustomer'])
            ->middleware('permission:customers.create');
        Route::patch('/crm/customers/{customer}', [CrmController::class, 'updateCustomer'])
            ->middleware('permission:customers.update');
        Route::post('/crm/customers/{customer}/archive', [CrmController::class, 'archiveCustomer'])
            ->middleware('permission:customers.update');
        Route::delete('/crm/customers/{customer}', [CrmController::class, 'destroyCustomer'])
            ->middleware('permission:customers.delete');
        Route::get('/crm/tasks', [CrmController::class, 'tasks'])
            ->middleware('permission:tasks.view');
        Route::post('/crm/tasks', [CrmController::class, 'storeTask'])
            ->middleware('permission:tasks.create');
        Route::patch('/crm/tasks/{task}', [CrmController::class, 'updateTask'])
            ->middleware('permission:tasks.assign');
        Route::post('/crm/tasks/{task}/archive', [CrmController::class, 'archiveTask'])
            ->middleware('permission:tasks.assign');
        Route::delete('/crm/tasks/{task}', [CrmController::class, 'destroyTask'])
            ->middleware('permission:tasks.complete');
        Route::get('/crm/calendar', [CrmController::class, 'calendar'])
            ->middleware('permission:tasks.view');
        Route::post('/crm/calendar', [CrmController::class, 'storeCalendarEvent'])
            ->middleware('permission:tasks.create');
        Route::patch('/crm/calendar/{event}', [CrmController::class, 'updateCalendarEvent'])
            ->middleware('permission:tasks.assign');
        Route::post('/crm/calendar/{event}/archive', [CrmController::class, 'archiveCalendarEvent'])
            ->middleware('permission:tasks.assign');
        Route::delete('/crm/calendar/{event}', [CrmController::class, 'destroyCalendarEvent'])
            ->middleware('permission:tasks.complete');

        Route::get('/conversations', [ConversationController::class, 'index'])
            ->middleware('permission:conversations.view');
        Route::get('/conversations/{conversation}/messages', [ConversationController::class, 'messages'])
            ->middleware('permission:conversations.view');
        Route::post('/conversations/{conversation}/messages', [ConversationController::class, 'sendMessage'])
            ->middleware('permission:messages.send');
        Route::patch('/conversations/{conversation}/assign', [ConversationController::class, 'assign'])
            ->middleware('permission:conversations.assign');
        Route::post('/conversations/{conversation}/close', [ConversationController::class, 'close'])
            ->middleware('permission:conversations.close');
        Route::patch('/conversations/{conversation}/tags', [ConversationController::class, 'updateTags'])
            ->middleware('permission:tags.manage');

        Route::get('/dashboard/stats', [DashboardController::class, 'stats'])
            ->middleware('permission:analytics.view');

        Route::get('/roles', [RoleController::class, 'index'])
            ->middleware('permission:roles.manage');
        Route::get('/permissions', [RoleController::class, 'permissions'])
            ->middleware('permission:roles.manage');
        Route::get('/audit-logs', [AuditLogController::class, 'index'])
            ->middleware('permission:audit.view');
        Route::get('/users', [UserController::class, 'index'])
            ->middleware('permission:users.view');
    });
});
