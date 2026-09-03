<?php

use App\Http\Controllers\Api\V1\WhatsAppController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1/internal/whatsapp')->middleware('internal.secret')->group(function () {
    Route::post('/session', [WhatsAppController::class, 'sessionUpdate']);
    Route::post('/messages', [WhatsAppController::class, 'incomingMessage']);
});
