<?php

namespace App\Jobs;

use App\Models\WebhookDelivery;
use App\Models\WebhookDeliveryAttempt;
use App\Models\WebhookEndpoint;
use App\Services\WebhookService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Throwable;

/**
 * Performs EXACTLY ONE delivery attempt for one WebhookDelivery.
 *
 * Owns the network I/O (single shared implementation that the queued path and
 * the "Send test" sync path both route through) and the retry/backoff policy:
 *
 *  - 2xx                -> delivery succeeds, attempt row recorded.
 *  - 3xx/4xx/5xx/error -> attempt row recorded; if attempts remain the job
 *                         re-dispatches itself with WebhookService::backoffSeconds
 *                         exponential backoff; otherwise the delivery is marked
 *                         permanently failed.
 *
 * The signing headers (HMAC-SHA256 over the exact raw body) come from
 * WebhookService::requestHeaders so production and test share identical bytes.
 */
class DeliverWebhookJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;

    public int $maxExceptions = 1;

    public int $timeout = 90;

    public function __construct(public readonly int $deliveryId)
    {
    }

    public function handle(WebhookService $service): void
    {
        $delivery = WebhookDelivery::query()->find($this->deliveryId);

        if ($delivery === null || $delivery->status === WebhookDelivery::STATUS_SUCCESS) {
            return;
        }

        $endpoint = WebhookEndpoint::query()->find($delivery->webhook_id);

        if ($endpoint === null || ! $endpoint->is_active) {
            $delivery->forceFill([
                'status' => $endpoint === null ? WebhookDelivery::STATUS_FAILED : WebhookDelivery::STATUS_FAILED,
                'last_error' => $endpoint === null ? 'Webhook endpoint was deleted.' : 'Webhook endpoint is disabled.',
                'completed_at' => now(),
            ])->save();

            return;
        }

        $attemptNumber = $delivery->attempt_count + 1;
        $rawBody = (string) $delivery->payload_json;
        $startedAt = hrtime(true);
        $status = null;
        $responseBody = null;
        $error = null;

        try {
            $response = Http::withHeaders($service->requestHeaders($endpoint, $rawBody))
                ->timeout($endpoint->timeout_seconds)
                ->post($endpoint->url, json_decode($rawBody, true) ?? []);

            $status = $response->status();

            if ($status < 200 || $status >= 300) {
                $error = "HTTP {$status}";
            } else {
                $responseBody = Str::limit($response->body(), 16000);
            }
        } catch (Throwable $e) {
            $error = Str::limit($e->getMessage(), 1000);
        }

        $durationMs = (int) round((hrtime(true) - $startedAt) / 1e6);

        WebhookDeliveryAttempt::create([
            'delivery_id' => $delivery->id,
            'attempt_number' => $attemptNumber,
            'request_headers' => json_encode($service->requestHeaders($endpoint, $rawBody), JSON_UNESCAPED_SLASHES),
            'request_body' => Str::limit($rawBody, 16000),
            'response_status' => $status,
            'response_body' => $responseBody,
            'duration_ms' => $durationMs,
            'error_message' => $error,
            'created_at' => now(),
        ]);

        if ($error === null) {
            $delivery->forceFill([
                'status' => WebhookDelivery::STATUS_SUCCESS,
                'attempt_count' => $attemptNumber,
                'last_http_status' => $status,
                'last_error' => null,
                'completed_at' => now(),
            ])->save();

            $endpoint->forceFill(['last_delivery_at' => now()])->save();

            return;
        }

        $delivery->forceFill([
            'attempt_count' => $attemptNumber,
            'last_http_status' => $status,
            'last_error' => $error,
        ])->save();

        if ($attemptNumber < $delivery->max_retries) {
            $delivery->forceFill(['status' => WebhookDelivery::STATUS_RETRYING])->save();

            self::dispatch($this->deliveryId)->delay(now()->addSeconds($service->backoffSeconds($attemptNumber)));

            return;
        }

        $delivery->forceFill([
            'status' => WebhookDelivery::STATUS_FAILED,
            'completed_at' => now(),
        ])->save();

        $endpoint->forceFill(['last_failure_at' => now()])->save();
    }
}
