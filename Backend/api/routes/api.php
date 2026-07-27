<?php

use App\Http\Controllers\Api\V1\ContactController;
use App\Http\Controllers\Api\V1\ConversationController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\LeadController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\TaskController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::get('/health', HealthController::class);

    Route::middleware('auth:sanctum')->group(function () {
        // Conversations
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

        // Dashboard
        Route::get('/dashboard/stats', [DashboardController::class, 'stats'])
            ->middleware('permission:analytics.view');

        // Reports
        Route::get('/reports', [ReportController::class, 'index'])
            ->middleware('permission:analytics.view');

        // Contacts
        Route::get('/crm/contacts', [ContactController::class, 'index'])
            ->middleware('permission:customers.view');
        Route::post('/crm/contacts', [ContactController::class, 'store'])
            ->middleware('permission:customers.create');
        Route::patch('/crm/contacts/{customer}', [ContactController::class, 'update'])
            ->middleware('permission:customers.update');
        Route::post('/crm/contacts/{customer}/archive', [ContactController::class, 'archive'])
            ->middleware('permission:customers.update');
        Route::delete('/crm/contacts/{customer}', [ContactController::class, 'destroy'])
            ->middleware('permission:customers.delete');

        // Leads
        Route::get('/crm/leads', [LeadController::class, 'index'])
            ->middleware('permission:leads.view');
        Route::post('/crm/leads', [LeadController::class, 'store'])
            ->middleware('permission:leads.create');
        Route::patch('/crm/leads/{lead}', [LeadController::class, 'update'])
            ->middleware('permission:leads.update');
        Route::post('/crm/leads/{lead}/archive', [LeadController::class, 'archive'])
            ->middleware('permission:leads.update');
        Route::delete('/crm/leads/{lead}', [LeadController::class, 'destroy'])
            ->middleware('permission:leads.delete');

        // Tasks
        Route::get('/crm/tasks', [TaskController::class, 'index'])
            ->middleware('permission:tasks.view');
        Route::post('/crm/tasks', [TaskController::class, 'store'])
            ->middleware('permission:tasks.create');
        Route::patch('/crm/tasks/{task}', [TaskController::class, 'update'])
            ->middleware('permission:tasks.assign');
        Route::post('/crm/tasks/{task}/archive', [TaskController::class, 'archive'])
            ->middleware('permission:tasks.assign');
        Route::delete('/crm/tasks/{task}', [TaskController::class, 'destroy'])
            ->middleware('permission:tasks.complete');

        // Calendar
        Route::get('/crm/calendar', [TaskController::class, 'calendar'])
            ->middleware('permission:tasks.view');
        Route::post('/crm/calendar', [TaskController::class, 'storeCalendarEvent'])
            ->middleware('permission:tasks.create');
        Route::patch('/crm/calendar/{event}', [TaskController::class, 'updateCalendarEvent'])
            ->middleware('permission:tasks.assign');
        Route::post('/crm/calendar/{event}/archive', [TaskController::class, 'archiveCalendarEvent'])
            ->middleware('permission:tasks.assign');
        Route::delete('/crm/calendar/{event}', [TaskController::class, 'destroyCalendarEvent'])
            ->middleware('permission:tasks.complete');
    });
});
