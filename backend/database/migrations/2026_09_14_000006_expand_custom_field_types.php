<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement("ALTER TABLE custom_field_definitions MODIFY field_type ENUM('text','textarea','number','date','date_time','select','multi_select','checkbox','url','email','phone') NOT NULL");
    }

    public function down(): void
    {
        DB::statement("ALTER TABLE custom_field_definitions MODIFY field_type ENUM('text','number','select','date','boolean') NOT NULL");
    }
};