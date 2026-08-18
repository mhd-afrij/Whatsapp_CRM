<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // MySQL FULLTEXT indexes for improved search relevance.
        // SQLite does not support FULLTEXT natively; these are MySQL-only.
        if ($this->isMySQL()) {
            DB::statement('ALTER TABLE messages ADD FULLTEXT INDEX ft_messages_body (body)');
            DB::statement('ALTER TABLE contacts ADD FULLTEXT INDEX ft_contacts_search (full_name, email, company)');
        }
    }

    public function down(): void
    {
        if ($this->isMySQL()) {
            DB::statement('ALTER TABLE messages DROP INDEX ft_messages_body');
            DB::statement('ALTER TABLE contacts DROP INDEX ft_contacts_search');
        }
    }

    private function isMySQL(): bool
    {
        return config('database.default') === 'mysql'
            || config('database.connections.'.config('database.default').'.driver') === 'mysql';
    }
};
