<?php

use App\Http\Controllers\Api\V1\AnalyticsController;
use App\Http\Controllers\Api\V1\AiAssistantController;
use App\Http\Controllers\Api\V1\AuditLogController;
use App\Http\Controllers\Api\V1\AutomationRuleController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BusinessHoursController;
use App\Http\Controllers\Api\V1\CalendarEventController;
use App\Http\Controllers\Api\V1\CampaignController;
use App\Http\Controllers\Api\V1\ContactController;
use App\Http\Controllers\Api\V1\ConversationController;
use App\Http\Controllers\Api\V1\DashboardController;
use App\Http\Controllers\Api\V1\DealController;
use App\Http\Controllers\Api\V1\FailedJobController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\InternalNoteController;
use App\Http\Controllers\Api\V1\LabelController;
use App\Http\Controllers\Api\V1\LeadController;
use App\Http\Controllers\Api\V1\MediaController;
use App\Http\Controllers\Api\V1\MessageTemplateController;
use App\Http\Controllers\Api\V1\NotificationController;
use App\Http\Controllers\Api\V1\NotificationPreferenceController;
use App\Http\Controllers\Api\V1\PermissionController;
use App\Http\Controllers\Api\V1\ReportExportController;
use App\Http\Controllers\Api\V1\RoleController;
use App\Http\Controllers\Api\V1\SearchController;
use App\Http\Controllers\Api\V1\SlaController;
use App\Http\Controllers\Api\V1\TaskController;
use App\Http\Controllers\Api\V1\TeamController;
use App\Http\Controllers\Api\V1\UserController;
use App\Http\Controllers\Api\V1\WhatsappController;
use App\Http\Controllers\Api\V1\WorkspaceSettingController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->name('api.v1.')->group(function () {
    Route::get('/health', HealthController::class)->name('health');

    Route::prefix('auth')->name('auth.')->group(function () {
        Route::post('/login', [AuthController::class, 'login'])
            ->middleware('throttle:login')
            ->name('login');
        Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])
            ->middleware('throttle:password-reset')
            ->name('forgot-password');
        Route::post('/reset-password', [AuthController::class, 'resetPassword'])
            ->middleware('throttle:password-reset')
            ->name('reset-password');
        Route::post('/invitations/accept', [AuthController::class, 'acceptInvitation'])
            ->middleware('throttle:invitation-accept')
            ->name('invitations.accept');

        Route::middleware(['auth:sanctum', 'active'])->group(function () {
            Route::post('/logout', [AuthController::class, 'logout'])->name('logout');
            Route::get('/me', [AuthController::class, 'me'])->name('me');
            Route::patch('/me', [AuthController::class, 'updateMe'])->name('me.update');

            // Permission matrix (docs/07-permission-matrix.md) names this
            // "invitations.manage" — used here instead of a non-existent "users.create".
            Route::post('/invitations', [AuthController::class, 'invite'])
                ->middleware(['permission:invitations.manage', 'throttle:invitation-create'])
                ->name('invitations.create');
        });
    });

    Route::middleware(['auth:sanctum', 'active'])->group(function () {
        Route::get('/ai-assistant/settings', [AiAssistantController::class, 'settings'])->middleware('permission:workspace.settings.manage')->name('ai.settings');
        Route::patch('/ai-assistant/settings', [AiAssistantController::class, 'updateSettings'])->middleware('permission:workspace.settings.manage')->name('ai.settings.update');
        Route::post('/ai-assistant/test', [AiAssistantController::class, 'test'])->middleware('permission:workspace.settings.manage')->name('ai.test');
        Route::post('/conversations/{conversation}/ai-draft', [AiAssistantController::class, 'draft'])->middleware('permission:conversations.view', 'throttle:ai-draft')->name('ai.draft');
        Route::get('/users', [UserController::class, 'index'])->name('users.index');
        Route::get('/users/{user}', [UserController::class, 'show'])->name('users.show');
        Route::patch('/users/{user}', [UserController::class, 'update'])->name('users.update');

        // The matrix has no dedicated "users.suspend" permission; "users.manage" covers it.
        Route::patch('/users/{user}/suspend', [UserController::class, 'suspend'])
            ->middleware('permission:users.manage')
            ->name('users.suspend');
        Route::patch('/users/{user}/reactivate', [UserController::class, 'reactivate'])
            ->middleware('permission:users.manage')
            ->name('users.reactivate');
        Route::post('/invitations/{invitation}/resend', [UserController::class, 'resendInvitation'])
            ->middleware('permission:invitations.manage')
            ->name('invitations.resend');

        Route::prefix('teams')->name('teams.')->group(function () {
            Route::get('/', [TeamController::class, 'index'])->name('index');
            Route::post('/', [TeamController::class, 'store'])->name('store');
            Route::get('/{team}', [TeamController::class, 'show'])->name('show');
            Route::patch('/{team}', [TeamController::class, 'update'])->name('update');
            Route::delete('/{team}', [TeamController::class, 'destroy'])->name('destroy');
            Route::post('/{team}/members', [TeamController::class, 'addMember'])->name('members.add');
            Route::delete('/{team}/members/{user}', [TeamController::class, 'removeMember'])->name('members.remove');
        });

        Route::prefix('roles')->name('roles.')->group(function () {
            Route::get('/', [RoleController::class, 'index'])->name('index');
            Route::post('/', [RoleController::class, 'store'])->name('store');
            Route::get('/{role}', [RoleController::class, 'show'])->name('show');
            Route::patch('/{role}', [RoleController::class, 'update'])->name('update');
            Route::delete('/{role}', [RoleController::class, 'destroy'])->name('destroy');
        });

        Route::get('/permissions', [PermissionController::class, 'index'])->name('permissions.index');

        Route::prefix('custom-field-definitions')->name('custom-field-definitions.')->middleware('permission:workspace.settings.manage')->group(function () {
            Route::get('/', [App\Http\Controllers\Api\V1\CustomFieldDefinitionController::class, 'index'])->name('index');
            Route::post('/', [App\Http\Controllers\Api\V1\CustomFieldDefinitionController::class, 'store'])->name('store');
            Route::patch('/{id}', [App\Http\Controllers\Api\V1\CustomFieldDefinitionController::class, 'update'])->name('update');
            Route::delete('/{id}', [App\Http\Controllers\Api\V1\CustomFieldDefinitionController::class, 'destroy'])->name('destroy');
        });

        Route::prefix('whatsapp')->name('whatsapp.')->middleware('permission:whatsapp.connection.manage')->group(function () {
            Route::get('/status', [WhatsappController::class, 'status'])->name('status');
            Route::get('/health', [WhatsappController::class, 'health'])->name('health');
            Route::get('/qr', [WhatsappController::class, 'qr'])->name('qr');
            Route::post('/connect', [WhatsappController::class, 'connect'])->name('connect');
            Route::post('/disconnect', [WhatsappController::class, 'disconnect'])->name('disconnect');
            Route::post('/logout', [WhatsappController::class, 'logout'])->name('logout');
            Route::post('/reconnect', [WhatsappController::class, 'reconnect'])->name('reconnect');
            Route::post('/reset-data', [WhatsappController::class, 'resetData'])->name('reset-data');
            Route::get('/connection-history', [WhatsappController::class, 'connectionHistory'])->name('connection-history');
        });

        Route::prefix('presence')->name('presence.')->group(function () {
            Route::post('/', [ConversationController::class, 'updatePresence'])
                ->middleware('permission:conversations.view')->name('update');
            Route::get('/', [ConversationController::class, 'getPresence'])
                ->middleware('permission:conversations.view')->name('index');
        });

        Route::prefix('conversations')->name('conversations.')->group(function () {
            Route::get('/', [ConversationController::class, 'index'])
                ->middleware('permission:conversations.view')->name('index');
            Route::post('/', [ConversationController::class, 'store'])
                ->middleware('permission:conversations.reply')->name('store');
            Route::get('/{conversation}', [ConversationController::class, 'show'])
                ->middleware('permission:conversations.view')->name('show');
            Route::get('/{conversation}/messages', [ConversationController::class, 'messages'])
                ->middleware('permission:conversations.view')->name('messages.index');
            Route::get('/{conversation}/messages/search', [ConversationController::class, 'searchMessages'])
                ->middleware('permission:conversations.view')->name('messages.search');
            Route::post('/{conversation}/messages', [ConversationController::class, 'storeMessage'])
                ->middleware('permission:conversations.reply')->name('messages.store');
            Route::patch('/{conversation}/assign', [ConversationController::class, 'assign'])
                ->middleware('permission:conversations.assign')->name('assign');
            Route::patch('/{conversation}/close', [ConversationController::class, 'close'])
                ->middleware('permission:conversations.close')->name('close');
            Route::patch('/{conversation}/reopen', [ConversationController::class, 'reopen'])
                ->middleware('permission:conversations.reopen')->name('reopen');
            Route::patch('/{conversation}/priority', [ConversationController::class, 'changePriority'])
                ->middleware('permission:conversations.change_priority')->name('priority');
            Route::patch('/{conversation}/archive', [ConversationController::class, 'archive'])
                ->middleware('permission:conversations.close')->name('archive');
            Route::patch('/{conversation}/unarchive', [ConversationController::class, 'unarchive'])
                ->middleware('permission:conversations.close')->name('unarchive');
            Route::patch('/{conversation}/pin', [ConversationController::class, 'pin'])
                ->middleware('permission:conversations.view')->name('pin');
            Route::patch('/{conversation}/unpin', [ConversationController::class, 'unpin'])
                ->middleware('permission:conversations.view')->name('unpin');
            Route::patch('/{conversation}/mute', [ConversationController::class, 'mute'])
                ->middleware('permission:conversations.view')->name('mute');
            Route::patch('/{conversation}/unmute', [ConversationController::class, 'unmute'])
                ->middleware('permission:conversations.view')->name('unmute');
            Route::patch('/{conversation}/star', [ConversationController::class, 'star'])
                ->middleware('permission:conversations.view')->name('star');
            Route::patch('/{conversation}/unstar', [ConversationController::class, 'unstar'])
                ->middleware('permission:conversations.view')->name('unstar');
            Route::patch('/{conversation}/read', [ConversationController::class, 'markRead'])
                ->middleware('permission:conversations.view')->name('read');
            Route::patch('/{conversation}/unread', [ConversationController::class, 'markUnread'])
                ->middleware('permission:conversations.view')->name('unread');
            Route::post('/{conversation}/typing', [ConversationController::class, 'typing'])
                ->middleware('permission:conversations.view')->name('typing');
            Route::get('/{conversation}/assignment-history', [ConversationController::class, 'assignmentHistory'])
                ->middleware('permission:conversations.view')->name('assignment-history');
            Route::get('/{conversation}/messages/{message}/media/{media}/url', [MediaController::class, 'url'])
                ->middleware('permission:conversations.view')->name('messages.media.url');
            Route::get('/{conversation}/messages/{message}/media/{media}/content', [MediaController::class, 'content'])
                ->middleware('permission:conversations.view')->name('messages.media.content');
            Route::get('/{conversation}/messages/{message}/status-events', [ConversationController::class, 'messageStatusEvents'])
                ->middleware('permission:conversations.view')->name('messages.status-events');
            Route::get('/{conversation}/messages/{message}/reactions', [ConversationController::class, 'messageReactions'])
                ->middleware('permission:conversations.view')->name('messages.reactions');
            Route::post('/{conversation}/media', [MediaController::class, 'store'])
                ->middleware('permission:conversations.reply')->name('media.store');
            Route::post('/{conversation}/messages/{message}/reaction', [ConversationController::class, 'addReaction'])
                ->middleware('permission:conversations.view')->name('messages.reaction.add');
            Route::delete('/{conversation}/messages/{message}/reaction', [ConversationController::class, 'removeReaction'])
                ->middleware('permission:conversations.view')->name('messages.reaction.remove');
            Route::delete('/{conversation}/messages/{message}/revoke', [ConversationController::class, 'revokeMessage'])
                ->middleware('permission:conversations.reply')->name('messages.revoke');
            Route::post('/{conversation}/messages/{message}/retry', [ConversationController::class, 'retryMessage'])
                ->middleware('permission:conversations.reply')->name('messages.retry');
            Route::post('/{conversation}/messages/{message}/forward', [ConversationController::class, 'forwardMessage'])
                ->middleware('permission:conversations.reply')->name('messages.forward');
            Route::patch('/{conversation}/messages/{message}/star', [ConversationController::class, 'starMessage'])
                ->middleware('permission:conversations.view')->name('messages.star');
            Route::delete('/{conversation}/messages/{message}/delete-for-me', [ConversationController::class, 'deleteMessageForMe'])
                ->middleware('permission:conversations.reply')->name('messages.delete-for-me');
            Route::delete('/{conversation}/messages', [ConversationController::class, 'clearMessages'])
                ->middleware('permission:conversations.close')->name('messages.clear');
            Route::delete('/{conversation}', [ConversationController::class, 'deleteConversation'])
                ->middleware('permission:conversations.close')->name('destroy');
            Route::patch('/{conversation}/block', [ConversationController::class, 'block'])
                ->middleware('permission:conversations.close')->name('block');
            Route::patch('/{conversation}/unblock', [ConversationController::class, 'unblock'])
                ->middleware('permission:conversations.close')->name('unblock');
            Route::patch('/{conversation}/report', [ConversationController::class, 'report'])
                ->middleware('permission:conversations.close')->name('report');
            Route::post('/{conversation}/labels/{label}', [ConversationController::class, 'attachLabel'])
                ->middleware('permission:conversations.reply')->name('labels.attach');
            Route::delete('/{conversation}/labels/{label}', [ConversationController::class, 'detachLabel'])
                ->middleware('permission:conversations.reply')->name('labels.detach');
        });

        Route::prefix('contacts')->name('contacts.')->group(function () {
            Route::get('/', [ContactController::class, 'index'])
                ->middleware('permission:contacts.view')->name('index');
            Route::get('/export', [ContactController::class, 'export'])
                ->middleware(['permission:contacts.export', 'throttle:export'])->name('export');
            Route::post('/import', [ContactController::class, 'import'])
                ->middleware('permission:contacts.create')->name('import');
            Route::post('/merge-duplicates', [ContactController::class, 'mergeDuplicates'])
                ->middleware('permission:contacts.delete')->name('merge-duplicates');
            Route::post('/', [ContactController::class, 'store'])
                ->middleware('permission:contacts.create')->name('store');
            Route::get('/{contact}', [ContactController::class, 'show'])
                ->middleware('permission:contacts.view')->name('show');
            Route::patch('/{contact}', [ContactController::class, 'update'])
                ->name('update');
            Route::delete('/{contact}', [ContactController::class, 'destroy'])
                ->middleware('permission:contacts.delete')->name('destroy');
            Route::post('/{id}/restore', [ContactController::class, 'restore'])
                ->middleware('permission:contacts.delete')->name('restore');

            Route::post('/{contact}/labels/{label}', [ContactController::class, 'attachLabel'])
                ->middleware('permission:contacts.view')->name('labels.attach');
            Route::delete('/{contact}/labels/{label}', [ContactController::class, 'detachLabel'])
                ->middleware('permission:contacts.view')->name('labels.detach');
        });

        Route::prefix('deals')->name('deals.')->middleware('permission:deals.manage')->group(function () {
            Route::get('/', [DealController::class, 'index'])->name('index');
            Route::post('/', [DealController::class, 'store'])->name('store');
            Route::get('/pipelines', [DealController::class, 'pipelines'])->name('pipelines');
            Route::get('/{deal}', [DealController::class, 'show'])->name('show');
            Route::patch('/{deal}', [DealController::class, 'update'])->name('update');
            Route::patch('/{deal}/stage', [DealController::class, 'moveStage'])->name('stage');
            Route::post('/{deal}/won', [DealController::class, 'won'])->name('won');
            Route::post('/{deal}/lost', [DealController::class, 'lost'])->name('lost');
            Route::delete('/{deal}', [DealController::class, 'destroy'])->name('destroy');
            Route::post('/{deal}/labels/{label}', [DealController::class, 'attachLabel'])->name('labels.attach');
            Route::delete('/{deal}/labels/{label}', [DealController::class, 'detachLabel'])->name('labels.detach');
        });

        Route::prefix('leads')->name('leads.')->middleware('permission:leads.manage')->group(function () {
            Route::get('/', [LeadController::class, 'index'])->name('index');
            Route::post('/', [LeadController::class, 'store'])->name('store');
            Route::get('/{lead}', [LeadController::class, 'show'])->name('show');
            Route::patch('/{lead}', [LeadController::class, 'update'])->name('update');
            Route::delete('/{lead}', [LeadController::class, 'destroy'])->name('destroy');
            Route::post('/{lead}/convert', [LeadController::class, 'convert'])->name('convert');
            Route::post('/{lead}/labels/{label}', [LeadController::class, 'attachLabel'])->name('labels.attach');
            Route::delete('/{lead}/labels/{label}', [LeadController::class, 'detachLabel'])->name('labels.detach');
        });

        Route::prefix('tasks')->name('tasks.')->group(function () {
            Route::get('/', [TaskController::class, 'index'])->name('index');
            Route::post('/', [TaskController::class, 'store'])->name('store');
            Route::get('/{task}', [TaskController::class, 'show'])->name('show');
            Route::patch('/{task}', [TaskController::class, 'update'])->name('update');
            Route::delete('/{task}', [TaskController::class, 'destroy'])->name('destroy');
            Route::post('/{task}/complete', [TaskController::class, 'complete'])->name('complete');
            Route::post('/{task}/reopen', [TaskController::class, 'reopen'])->name('reopen');
            Route::get('/{task}/comments', [TaskController::class, 'comments'])->name('comments.index');
            Route::post('/{task}/comments', [TaskController::class, 'storeComment'])->name('comments.store');
        });

        Route::apiResource('automation-rules', AutomationRuleController::class)
            ->except(['show'])
            ->names('automation-rules');

        Route::prefix('notes')->name('notes.')->group(function () {
            Route::get('/', [InternalNoteController::class, 'index'])->name('index');
            Route::post('/', [InternalNoteController::class, 'store'])->name('store');
            Route::patch('/{internalNote}', [InternalNoteController::class, 'update'])->name('update');
            Route::delete('/{internalNote}', [InternalNoteController::class, 'destroy'])->name('destroy');
        });

        Route::prefix('calendar-events')->name('calendar-events.')->group(function () {
            Route::get('/', [CalendarEventController::class, 'index'])->name('index');
            Route::post('/', [CalendarEventController::class, 'store'])->name('store');
            Route::patch('/{calendarEvent}', [CalendarEventController::class, 'update'])->name('update');
            Route::delete('/{calendarEvent}', [CalendarEventController::class, 'destroy'])->name('destroy');
        });

        Route::prefix('labels')->name('labels.')->group(function () {
            Route::get('/', [LabelController::class, 'index'])->name('index');
            Route::post('/', [LabelController::class, 'store'])
                ->middleware('permission:labels.manage')->name('store');
            Route::patch('/{label}', [LabelController::class, 'update'])
                ->middleware('permission:labels.manage')->name('update');
            Route::delete('/{label}', [LabelController::class, 'destroy'])
                ->middleware('permission:labels.manage')->name('destroy');
        });

        Route::prefix('sla')->name('sla.')->group(function () {
            Route::get('/configs', [SlaController::class, 'index'])
                ->middleware('permission:workspace.settings.manage')->name('configs.index');
            Route::post('/configs', [SlaController::class, 'store'])
                ->middleware('permission:workspace.settings.manage')->name('configs.store');
            Route::patch('/configs/{slaConfig}', [SlaController::class, 'update'])
                ->middleware('permission:workspace.settings.manage')->name('configs.update');
            Route::delete('/configs/{slaConfig}', [SlaController::class, 'destroy'])
                ->middleware('permission:workspace.settings.manage')->name('configs.destroy');
            Route::get('/conversations/{conversation}/status', [SlaController::class, 'getStatus'])
                ->middleware('permission:conversations.view')->name('status');
        });

        Route::prefix('message-templates')->name('message-templates.')->group(function () {
            Route::get('/', [MessageTemplateController::class, 'index'])
                ->middleware('permission:templates.use')->name('index');
            Route::post('/', [MessageTemplateController::class, 'store'])
                ->middleware('permission:templates.manage')->name('store');
            Route::get('/{template}', [MessageTemplateController::class, 'show'])
                ->middleware('permission:templates.use')->name('show');
            Route::patch('/{template}', [MessageTemplateController::class, 'update'])
                ->middleware('permission:templates.manage')->name('update');
            Route::delete('/{template}', [MessageTemplateController::class, 'destroy'])
                ->middleware('permission:templates.manage')->name('destroy');
            Route::post('/preview', [MessageTemplateController::class, 'preview'])
                ->middleware('permission:templates.use')->name('preview');
        });

        // Campaigns (bulk WhatsApp messaging). Send/cancel share campaigns.send;
        // everything read-only sits behind campaigns.view.
        Route::prefix('campaigns')->name('campaigns.')->group(function () {
            Route::get('/', [CampaignController::class, 'index'])
                ->middleware('permission:campaigns.view')->name('index');
            Route::post('/preview-audience', [CampaignController::class, 'previewAudience'])
                ->middleware('permission:campaigns.view')->name('preview-audience');
            Route::post('/', [CampaignController::class, 'store'])
                ->middleware('permission:campaigns.create')->name('store');
            Route::get('/{campaign}', [CampaignController::class, 'show'])
                ->middleware('permission:campaigns.view')->name('show');
            Route::patch('/{campaign}', [CampaignController::class, 'update'])
                ->middleware('permission:campaigns.update')->name('update');
            Route::delete('/{campaign}', [CampaignController::class, 'destroy'])
                ->middleware('permission:campaigns.delete')->name('destroy');
            Route::post('/{campaign}/send', [CampaignController::class, 'send'])
                ->middleware(['permission:campaigns.send'])->name('send');
            Route::post('/{campaign}/cancel', [CampaignController::class, 'cancel'])
                ->middleware('permission:campaigns.send')->name('cancel');
            Route::get('/{campaign}/analytics', [CampaignController::class, 'analytics'])
                ->middleware('permission:campaigns.view')->name('analytics');
            Route::get('/{campaign}/messages', [CampaignController::class, 'messages'])
                ->middleware('permission:campaigns.view')->name('messages.index');
        });

        // search.global is granted to every seeded role; the SearchController itself narrows
        // per-category based on the requesting user's actual view permissions.
        Route::get('/search', [SearchController::class, 'index'])
            ->middleware(['permission:search.global', 'throttle:search'])->name('search');

        // No dedicated permission gate - a notification is always scoped to the
        // requesting user (see NotificationController), so any authenticated user may
        // read/manage their own.
        Route::prefix('notifications')->name('notifications.')->group(function () {
            Route::get('/', [NotificationController::class, 'index'])->name('index');
            Route::patch('/{notification}/read', [NotificationController::class, 'markRead'])->name('read');
            Route::post('/mark-all-read', [NotificationController::class, 'markAllRead'])->name('mark-all-read');
        });

        Route::prefix('notification-preferences')->name('notification-preferences.')->group(function () {
            Route::get('/', [NotificationPreferenceController::class, 'index'])->name('index');
            Route::patch('/', [NotificationPreferenceController::class, 'update'])->name('update');
        });

        // Phase 13/14 - Dashboard & Analytics (see docs/08-implementation-roadmap.md and
        // PROJECT_STATUS.md for why analytics.view/analytics.export exist beyond the
        // original docs/07-permission-matrix.md table).
        Route::get('/dashboard/summary', [DashboardController::class, 'summary'])
            ->middleware('permission:dashboard.view_workspace')->name('dashboard.summary');

        Route::prefix('analytics')->name('analytics.')->middleware('permission:analytics.view')->group(function () {
            Route::get('/conversation-volume', [AnalyticsController::class, 'conversationVolume'])->name('conversation-volume');
            Route::get('/response-time-trend', [AnalyticsController::class, 'responseTimeTrend'])->name('response-time-trend');
            Route::get('/won-vs-lost', [AnalyticsController::class, 'wonVsLost'])->name('won-vs-lost');
            Route::get('/agent-performance', [AnalyticsController::class, 'agentPerformance'])->name('agent-performance');
            Route::get('/task-completion-rate', [AnalyticsController::class, 'taskCompletionRate'])->name('task-completion-rate');
        });

        Route::prefix('workspace')->name('workspace.')->middleware('permission:workspace.settings.manage')->group(function () {
            Route::get('/', [WorkspaceSettingController::class, 'show'])->name('show');
            Route::match(['patch', 'post'], '/', [WorkspaceSettingController::class, 'update'])->name('update');
            Route::get('/business-hours', [BusinessHoursController::class, 'show'])
                ->name('business-hours.show');
            Route::patch('/business-hours', [BusinessHoursController::class, 'update'])
                ->name('business-hours.update');
            Route::get('/business-hours/status', [BusinessHoursController::class, 'status'])
                ->name('business-hours.status');
        });

        Route::prefix('audit-logs')->name('audit-logs.')->middleware('permission:audit_logs.view')->group(function () {
            Route::get('/', [AuditLogController::class, 'index'])->name('index');
            Route::get('/{auditLog}', [AuditLogController::class, 'show'])->name('show');
        });

        Route::prefix('reports')->name('reports.')->group(function () {
            Route::post('/export', [ReportExportController::class, 'store'])
                ->middleware(['permission:analytics.export', 'throttle:export'])->name('export.store');
            // Download is scoped to the requesting user's own notification/export (see
            // ReportExportController::download) - no separate permission gate needed beyond
            // authentication, same rationale as the notifications routes above.
            Route::get('/export/{notification}/download', [ReportExportController::class, 'download'])
                ->name('export.download');
        });

        // DLQ (Dead Letter Queue) management - Admin only
        Route::prefix('failed-jobs')->name('failed-jobs.')->middleware('permission:dlq.manage')->group(function () {
            Route::get('/', [FailedJobController::class, 'index'])->name('index');
            Route::post('/{id}/retry', [FailedJobController::class, 'retry'])->name('retry');
            Route::post('/retry-all', [FailedJobController::class, 'retryAll'])->name('retry-all');
            Route::delete('/{id}', [FailedJobController::class, 'destroy'])->name('destroy');
        });
    });
});
