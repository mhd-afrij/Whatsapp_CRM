<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deals', function (Blueprint $table) {
            $table->string('lost_reason')->nullable()->after('status');
            $table->unsignedTinyInteger('probability_percent')->nullable()->after('value_currency');
            $table->timestamp('closed_at')->nullable()->after('lost_reason');
        });
    }

    public function down(): void
    {
        Schema::table('deals', function (Blueprint $table) {
            $table->dropColumn(['lost_reason', 'probability_percent', 'closed_at']);
        });
    }
};
