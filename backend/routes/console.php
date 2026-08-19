<?php

use Illuminate\Support\Facades\Schedule;

// Background workers that poll gateway-owned tables / due rows the backend
// cannot hook inline (see each command's docblock). Running them requires the
// scheduler itself to run (php artisan schedule:work / schedule:run via cron);
// this registration is what makes task reminders, overdue/connection/new-message
// notifications, and the SLA engine actually fire without manual invocations.

Schedule::command('tasks:send-reminders')->everyMinute()->withoutOverlapping();
Schedule::command('tasks:notify-overdue')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('conversations:notify-new-messages')->everyMinute()->withoutOverlapping();
Schedule::command('whatsapp:notify-connection-events')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('sla:check-breaches')->everyMinute()->withoutOverlapping();
