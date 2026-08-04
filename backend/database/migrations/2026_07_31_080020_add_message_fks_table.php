<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->foreign('replied_to_message_id')->references('id')->on('messages')->nullOnDelete();
        });

        Schema::table('conversation_participants', function (Blueprint $table) {
            $table->foreign('last_read_message_id')->references('id')->on('messages')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('conversation_participants', function (Blueprint $table) {
            $table->dropForeign(['last_read_message_id']);
        });

        Schema::table('messages', function (Blueprint $table) {
            $table->dropForeign(['replied_to_message_id']);
        });
    }
};
