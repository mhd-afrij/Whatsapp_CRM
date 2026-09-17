<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Outgoing webhook delivery (greenfield): endpoints, per-endpoint event
 * subscriptions, delivery runs and per-attempt details. Delivery itself runs in
 * a queued job (never inline in a critical HTTP request path) and every payload
 * is HMAC-SHA256 signed with the endpoint's secret (encrypted at rest).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('webhook_endpoints', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->string('name', 150);
            $table->text('url');
            $table->string('description')->nullable();
            $table->text('secret');
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('timeout_seconds')->default(10);
            $table->unsignedTinyInteger('max_retries')->default(3);
            $table->timestamp('last_delivery_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['workspace_id', 'is_active'], 'idx_webhook_endpoints_wia');
        });

        Schema::create('webhook_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('webhook_id')->constrained('webhook_endpoints')->cascadeOnDelete();
            $table->string('event_name', 100);
            $table->timestamps();

            $table->unique(['webhook_id', 'event_name']);
            $table->index('event_name');
        });

        Schema::create('webhook_deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->constrained('workspaces')->cascadeOnDelete();
            $table->foreignId('webhook_id')->nullable()->constrained('webhook_endpoints')->nullOnDelete();
            $table->string('event_id', 64);
            $table->string('event_name', 120);
            $table->longText('payload_json')->nullable();
            $table->string('status', 20)->default('pending');
            $table->unsignedTinyInteger('attempt_count')->default(0);
            $table->unsignedTinyInteger('max_retries')->default(3);
            $table->unsignedInteger('last_http_status')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('completed_at')->nullable();

            $table->index(['workspace_id', 'created_at'], 'idx_webhook_deliveries_wc');
            $table->index(['webhook_id', 'created_at'], 'idx_webhook_deliveries_hc');
            $table->index('status');
            $table->index(['event_id', 'webhook_id'], 'idx_webhook_deliveries_eh');
        });

        Schema::create('webhook_delivery_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('delivery_id')->constrained('webhook_deliveries')->cascadeOnDelete();
            $table->unsignedTinyInteger('attempt_number');
            $table->json('request_headers')->nullable();
            $table->text('request_body')->nullable();
            $table->unsignedInteger('response_status')->nullable();
            $table->json('response_headers')->nullable();
            $table->longText('response_body')->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['delivery_id', 'attempt_number'], 'idx_webhook_attempts_den');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('webhook_delivery_attempts');
        Schema::dropIfExists('webhook_deliveries');
        Schema::dropIfExists('webhook_subscriptions');
        Schema::dropIfExists('webhook_endpoints');
    }
};