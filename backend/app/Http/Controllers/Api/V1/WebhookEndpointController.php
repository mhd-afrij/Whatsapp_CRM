<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Api\V1\Support\WebhookEndpoint as WebhookEndpointPresenter;
use App\Models\WebhookDelivery;
use App\Models\WebhookEndpoint;
use App\Models\WebhookSubscription;
use App\Services\WebhookService;
use App\Support\WebhookEvents;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule as Vld;
use Illuminate\Validation\ValidationException;

/**
 * Workspace webhook endpoints.
 *
 * The event catalog is the REAL backend-observable set (App\Support\WebhookEvents).
 * The controller surface is deliberately small: CRUD + subscriptions + a
 * synchronous "Send test" round trip that transmits the EXACT signed bytes a
 * real delivery sends (shared HMAC signing via WebhookService::requestHeaders),
 * so "connected" is always backed by an actual HTTP exchange - never invented.
 */
class WebhookEndpointController extends Controller
{
    public function __construct(protected WebhookService $webhooks)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $endpoints = WebhookEndpoint::query()
            ->with('subscriptions')
            ->orderBy('name')
            ->paginate($request->integer('per_page', 20));

        return response()->json([
            'data' => $endpoints->through(fn (WebhookEndpoint $endpoint) => $this->present($endpoint))->values(),
            'meta' => $this->pageMeta($endpoints),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatePayload($request);

        $url = (string) $data['url'];

        if ($this->hasDuplicateUrl($url, null)) {
            throw ValidationException::withMessages(['url' => 'Another active webhook already uses this URL.']);
        }

        $this->assertValidTarget($url);

        $endpoint = WebhookEndpoint::create([
            'workspace_id' => $request->user()->current_workspace_id,
            'name' => $data['name'],
            'url' => $url,
            'description' => $data['description'] ?? null,
            'is_active' => $data['is_active'] ?? true,
            'timeout_seconds' => $data['timeout_seconds'] ?? 10,
            'max_retries' => $data['max_retries'] ?? 3,
            'secret' => Crypt::encryptString(Str::random(48)),
            'created_by' => $request->user()->id,
        ]);

        $this->syncSubscriptions($endpoint, $data['events'] ?? []);

        return response()->json([
            'data' => $this->present($endpoint->load('subscriptions')),
        ], 201);
    }

    public function show(WebhookEndpoint $endpoint): JsonResponse
    {
        return response()->json([
            'data' => $this->present($endpoint->load(['subscriptions', 'deliveries' => fn ($q) => $q->orderByDesc('id')->limit(20)])),
        ]);
    }

    public function update(Request $request, WebhookEndpoint $endpoint): JsonResponse
    {
        $data = $this->validatePayload($request);

        if (isset($data['url']) && $data['url'] !== $endpoint->url) {
            $this->assertValidTarget($data['url']);

            if ($this->hasDuplicateUrl($data['url'], $endpoint->id)) {
                throw ValidationException::withMessages(['url' => 'Another active webhook already uses this URL.']);
            }
        }

        $endpoint->update([
            'name' => $data['name'],
            'url' => $data['url'],
            'description' => $data['description'] ?? $endpoint->description,
            'is_active' => $data['is_active'] ?? $endpoint->is_active,
            'timeout_seconds' => $data['timeout_seconds'] ?? $endpoint->timeout_seconds,
            'max_retries' => $data['max_retries'] ?? $endpoint->max_retries,
        ]);

        if (array_key_exists('events', $data)) {
            $this->syncSubscriptions($endpoint, $data['events']);
        }

        return response()->json([
            'data' => $this->present($endpoint->load('subscriptions')),
        ]);
    }

    public function destroy(WebhookEndpoint $endpoint): JsonResponse
    {
        $endpoint->delete();

        return response()->json(['data' => null], 204);
    }

    public function rotateSecret(WebhookEndpoint $endpoint): JsonResponse
    {
        $newSecret = Str::random(48);

        $endpoint->forceFill(['secret' => Crypt::encryptString($newSecret)])->save();

        return response()->json([
            'data' => [
                'id' => $endpoint->id,
                'regeneratedAt' => now()->toIso8601String(),
            ],
        ]);
    }

    /**
     * Synchronous "Send test": ONE real, signed HTTP POST to the configured URL
     * with a sample payload for the requested event. Returns the ACTUAL
     * status/body/duration/signature - never a fabricated "connected". Uses the
     * exact same signing bytes (WebhookService::envelope + requestHeaders) as a
     * real queued delivery.
     */
    public function test(Request $request, WebhookEndpoint $endpoint): JsonResponse
    {
        $event = $request->validate([
            'event' => ['required', 'string', Vld::in(WebhookEvents::catalog())],
        ])['event'];

        $eventId = 'evt_'.Str::uuid()->toString();
        $rawBody = $this->webhooks->envelope($endpoint, $event, $request->input('data', []), $eventId);

        $started = hrtime(true);
        $status = null;
        $responseBody = null;
        $error = null;

        try {
            $response = \Illuminate\Support\Facades\Http::withHeaders($this->webhooks->requestHeaders($endpoint, $rawBody))
                ->timeout($endpoint->timeout_seconds)
                ->post($endpoint->url, json_decode($rawBody, true) ?? []);

            $status = $response->status();

            if ($status < 200 || $status >= 300) {
                $error = "HTTP {$status}";
            } else {
                $responseBody = Str::limit($response->body(), 16000);
            }
        } catch (\Throwable $e) {
            $error = Str::limit($e->getMessage(), 1000);
        }

        $durationMs = (int) round((hrtime(true) - $started) / 1e6);

        return response()->json([
            'data' => [
                'eventId' => $eventId,
                'event' => $event,
                'status' => $status,
                'body' => $responseBody,
                'error' => $error,
                'durationMs' => $durationMs,
                'signature' => hash_hmac('sha256', $rawBody, (string) Crypt::decryptString((string) $endpoint->secret)),
            ],
        ]);
    }

    protected function validatePayload(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'url' => ['required', 'url', 'max:2048'],
            'description' => ['nullable', 'string', 'max:500'],
            'is_active' => ['sometimes', 'boolean'],
            'timeout_seconds' => ['sometimes', 'integer', 'between:1,60'],
            'max_retries' => ['sometimes', 'integer', 'between:0,10'],
            'events' => ['sometimes', 'array', 'max:50'],
            'events.*' => ['distinct', Vld::in(WebhookEvents::catalog())],
        ]);
    }

    protected function assertValidTarget(string $url): void
    {
        $result = $this->webhooks->validateTargetUrl($url);

        if (! $result['valid']) {
            throw ValidationException::withMessages(['url' => $result['reason'] ?? 'Target URL is not allowed.']);
        }
    }

    protected function hasDuplicateUrl(string $url, ?int $exceptId = null): bool
    {
        return WebhookEndpoint::query()
            ->when($exceptId !== null, fn ($q) => $q->whereKeyNot($exceptId))
            ->where('url', $url)
            ->exists();
    }

    protected function syncSubscriptions(WebhookEndpoint $endpoint, array $events): void
    {
        $endpoint->subscriptions()->delete();

        foreach (array_unique($events) as $event) {
            WebhookSubscription::create([
                'webhook_id' => $endpoint->id,
                'workspace_id' => $endpoint->workspace_id,
                'event_name' => $event,
            ]);
        }
    }

    protected function present(WebhookEndpoint $endpoint): array
    {
        return [
            'id' => $endpoint->id,
            'name' => $endpoint->name,
            'url' => $endpoint->url,
            'description' => $endpoint->description,
            'is_active' => $endpoint->is_active,
            'timeout_seconds' => $endpoint->timeout_seconds,
            'max_retries' => $endpoint->max_retries,
            'has_secret' => filled($endpoint->secret),
            'last_delivery_at' => $endpoint->last_delivery_at?->toIso8601String(),
            'created_by' => $endpoint->created_by,
            'created_at' => $endpoint->created_at?->toIso8601String(),
            'events' => $endpoint->subscriptions->pluck('event_name')->values(),
        ];
    }

    protected function pageMeta($paginator): array
    {
        return [
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
        ];
    }
}
