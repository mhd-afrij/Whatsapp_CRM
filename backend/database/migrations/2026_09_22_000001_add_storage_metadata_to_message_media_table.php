<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Bring message_media in line with what the gateway already inserts
     * (whatsapp-gateway/src/whatsapp/message-repository.ts) so the storage
     * provider label and blob key survive when media lives outside the
     * gateway's local disk (Azure Blob Storage).
     */
    public function up(): void
    {
        Schema::table('message_media', function (Blueprint $table) {
            $table->bigInteger('file_size')->nullable()->after('file_size_bytes');
            $table->string('blob_name', 500)->nullable()->after('storage_path');
            $table->text('media_url')->nullable()->after('blob_name');
            $table->string('storage_provider', 50)->nullable()->after('media_url')->default('local');
        });
    }

    public function down(): void
    {
        Schema::table('message_media', function (Blueprint $table) {
            $table->dropColumn(['file_size', 'blob_name', 'media_url', 'storage_provider']);
        });
    }
};