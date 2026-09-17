<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('invitations', function (Blueprint $table) {
            if (! Schema::hasColumn('invitations', 'token_hash')) {
                $table->string('token_hash', 128)->nullable()->unique()->after('token');
            }
            if (! Schema::hasColumn('invitations', 'first_name')) {
                $table->string('first_name')->nullable()->after('email');
            }
            if (! Schema::hasColumn('invitations', 'last_name')) {
                $table->string('last_name')->nullable()->after('first_name');
            }
            if (! Schema::hasColumn('invitations', 'message')) {
                $table->text('message')->nullable()->after('last_name');
            }
            if (! Schema::hasColumn('invitations', 'revoked_at')) {
                $table->timestamp('revoked_at')->nullable()->after('accepted_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('invitations', function (Blueprint $table) {
            $table->dropColumn(['token_hash', 'first_name', 'last_name', 'message', 'revoked_at']);
        });
    }
};
