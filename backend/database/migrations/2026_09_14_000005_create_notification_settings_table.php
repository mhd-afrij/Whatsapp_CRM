<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notification_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->boolean('email_enabled')->default(true);
            $table->string('email_digest', 20)->default('immediately'); // immediately|hourly|daily|never
            $table->string('digest_time', 5)->default('09:00');
            $table->json('quiet_hours')->nullable();
            $table->boolean('in_app_sound')->default(true);
            $table->boolean('browser_notifications')->default(true);
            $table->boolean('show_unread_badge')->default(true);
            $table->boolean('auto_mark_read')->default(true);
            $table->timestamps();

            $table->unique('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_settings');
    }
};