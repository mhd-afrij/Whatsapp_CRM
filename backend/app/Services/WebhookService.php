<?php

namespace App\Services;

use App\Jobs\DeliverWebhookJob;
use App\Models\WebhookDelivery;
use App\Models\WebhookEndpoint;
use App\Support\WebhookEvents;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Support\Str as UuidStr;
use RuntimeException;
use Throwable;

/**
 * Webhook emission engine.
 *
 * The event catalog (App\Support\WebhookEvents) contains ONLY events with a real
 * backend emission site. Inbound message events (message.received/delivered/
 * read) are NOT catalogued because the gateway owns the Baileys socket - the
 * backend cannot observe them, so emitting them would be a fake feature.
 *
 * Delivery is always queued (DeliverWebhookJob), never inline in a critical
 * request path. Connect-time target validation (SSRF guard) lives here because
 * it must run on endpoint create/update; the actual network I/O lives in
 * DeliverWebhookJob::executeOnce so the queue path and the synchronous test
 * path share exactly one implementation.
 */
class WebhookService
{
    public const SIGNATURE_HEADER = 'X-Webhook-Signature';

    /** Seconds to wait before retrying after the given failed attempt number. */
    public const BACKOFF = [1 => 60, 2 => 300, 3 => 1800, 4 => 3600];

    public function __construct(
        protected array $blockedIpRanges = [
            '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16',
            '169.254.0.0/16', '100.64.0.0/10', '127.0.0.0/8',
        ],
    ) {
    }

    /**
     * Fire an event across a whole workspace. Every active endpoint in the
     * workspace subscribed to the event gets exactly one queued delivery.
     */
    public function emit(string $event, int $workspaceId, array $data): void
    {
        $this->assertSupportedEvent($event);

        $endpoints = WebhookEndpoint::query()
            ->where('workspace_id', $workspaceId)
            ->where('is_active', true)
            ->whereHas('subscriptions', fn ($q) => $q->where('event_name', $event))
            ->get();

        foreach ($endpoints as $endpoint) {
            $this->enqueue($endpoint, $event, $data);
        }
    }

    /**
     * Create ONE pending delivery row for one endpoint + dispatch the delivery
     * job immediately (the job owns retries/backoff). Returns the row.
     */
    public function enqueue(WebhookEndpoint $endpoint, string $event, array $data): WebhookDelivery
    {
        $this->assertSupportedEvent($event);

        $eventId = 'evt_'.Str::uuid()->toString();

        $delivery = WebhookDelivery::create([
            'workspace_id' => $endpoint->workspace_id,
            'webhook_id' => $endpoint->id,
            'event_id' => $eventId,
            'event_name' => $event,
            'payload_json' => $this->envelope($endpoint, $event, $data, $eventId),
            'status' => WebhookDelivery::STATUS_PENDING,
            'attempt_count' => 0,
            'max_retries' => $endpoint->max_retries,
            'created_at' => now(),
        ]);

        DeliverWebhookJob::dispatch($delivery->id);

        return $delivery;
    }

    /**
     * The signed envelope every receiver gets: unique event id (idempotency on
     * the receiver's side), event name, ISO timestamp, workspace id, and the
     * business payload. This exact JSON array is what gets transmitted.
     */
    public function envelope(WebhookEndpoint $endpoint, string $event, array $data, string $eventId): string
    {
        return (string) json_encode([
            'id' => $eventId,
            'event' => $event,
            'createdAt' => now()->toIso8601String(),
            'workspaceId' => $endpoint->workspace_id,
            'data' => $data,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }

    /**
     * Request headers for a delivery, including the HMAC-SHA256 signature over
     * the EXACT raw body string that is transmitted (so the receiver can
     * reproduce the body byte-for-byte and verify).
     */
    public function requestHeaders(WebhookEndpoint $endpoint, string $rawBody): array
    {
        return [
            'Content-Type' => 'application/json',
            'Accept' => 'application/json',
            'User-Agent' => 'CRM-WhatsApp-Webhook/1.0',
            self::SIGNATURE_HEADER => hash_hmac('sha256', (string) $rawBody, (string) $endpoint->secret),
        ];
    }

    /**
     * Seconds to wait before retrying after the given failed attempt. Capped.
     */
    public function backoffSeconds(int $failedAttempt): int
    {
        return min(self::BACKOFF[$failedAttempt] ?? (self::BACKOFF[4] * 2), self::BACKOFF[4] * 2);
    }

    /**
     * Validate a target URL (SSRF guard). Loopback targets are allowed outside
     * production so local dev listeners can be exercised via "Send test", and
     * always rejected in production. DNS is resolved and any private/loopback
     * resolved IP is rejected.
     *
     * @return array{valid: bool, reason: ?string}
     */
    public function validateTargetUrl(string $url): array
    {
        $parts = parse_url($url);
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));

        if ($scheme !== 'http' && $scheme !== 'https') {
            return ['valid' => false, 'reason' => 'Only http/https URLs are allowed.'];
        }

        $host = strtolower((string) (rtrim($parts['host'] ?? '', '[]')));
        if ($host === '') {
            return ['valid' => false, 'reason' => 'A host is required.'];
        }

        $loopback = in_array($host, ['localhost', '127.0.0.1', '::1'], true) || str_starts_with($host, '127.');

        if ($loopback) {
            if (app()->environment() === 'production') {
                return ['valid' => false, 'reason' => 'Loopback targets are not allowed in production.'];
            }

            return ['valid' => true, 'reason' => null];
        }

        $resolved = @dns_get_record($host, DNS_A | DNS_AAAA);

        foreach ((array) $resolved as $record) {
            $ip = $record['ip'] ?? null;
            if ($ip !== null && $this->isPrivateIp((string) $ip)) {
                return ['valid' => false, 'reason' => 'Private/loopback network targets are not allowed.'];
            }
        }

        return ['valid' => true, 'reason' => null];
    }

    protected function isPrivateIp(string $ip): bool
    {
        $isPrivate = filter_var(
            $ip,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_IPV4 | FILTER_FLAG_IPV6 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE,
        ) === false;

        if ($isPrivate) {
            return true;
        }

        return in_array($ip, ['0.0.0.0', '::', '::1'], true)
            || str_starts_with(strtolower($ip), 'fe8')
            || str_starts_with(strtolower($ip), 'fe9')
            || str_starts_with(strtolower($ip), 'fea')
            || str_starts_with(strtolower($ip), 'feb')
            || str_starts_with(strtolower($ip), 'fc')
            || str_starts_with(strtolower($ip), 'fd');
    }

    protected function assertSupportedEvent(string $event): void
    {
        if (! in_array($event, WebhookEvents::catalog(), true)) {
            throw new RuntimeException("Unsupported webhook event: {$event}");
        }
    }
}
