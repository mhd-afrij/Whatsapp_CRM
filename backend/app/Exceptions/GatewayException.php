<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Classifies a failed interaction with the whatsapp-gateway service so the
 * controllers and the rest of the application can react to the *kind* of
 * failure rather than inspecting raw HTTP exceptions or connection errors.
 *
 * Codes (stable, safe to switch on and to relay to the frontend):
 *
 *   - GATEWAY_UNREACHABLE   connection could not be established (DNS/TCP refused)
 *   - GATEWAY_TIMEOUT       the gateway accepted the TCP connection but did not
 *                           respond within the configured timeout
 *   - GATEWAY_UNAUTHORIZED  the shared internal token was rejected (401)
 *   - GATEWAY_UNAVAILABLE   the gateway answered but reported it could not serve
 *                           (e.g. 5xx from an internal route, 503 readiness)
 *   - GATEWAY_INVALID_RESPONSE  the gateway returned an unparseable/2xx body that
 *                           did not match the expected envelope
 *
 * Transient failures (UNREACHABLE, TIMEOUT, UNAVAILABLE) are retryable and must
 * never be surfaced as an HTTP 500 on the CRM API - the calling controller
 * downgrades them to 502 with a stable code and a `retryable` flag instead.
 *
 * Internal exception details and secrets are deliberately NOT exposed: the
 * public message is a safe, generic phrase; the original error is available
 * only via getPrevious() for logging purposes.
 */
class GatewayException extends RuntimeException
{
    public const UNREACHABLE = 'GATEWAY_UNREACHABLE';

    public const TIMEOUT = 'GATEWAY_TIMEOUT';

    public const UNAUTHORIZED = 'GATEWAY_UNAUTHORIZED';

    public const UNAVAILABLE = 'GATEWAY_UNAVAILABLE';

    public const INVALID_RESPONSE = 'GATEWAY_INVALID_RESPONSE';

    /** Codes that are safe to retry (a temporary gateway outage, not a config error). */
    public const RETRYABLE_CODES = [
        self::UNREACHABLE,
        self::TIMEOUT,
        self::UNAVAILABLE,
    ];

    /** The stable gateway error code (e.g. GATEWAY_UNREACHABLE) surfaced to the frontend. */
    public readonly string $gatewayCode;

    public function __construct(
        string $gatewayCode,
        string $publicMessage,
        ?\Throwable $previous = null,
    ) {
        parent::__construct($publicMessage, 0, $previous);
        $this->gatewayCode = $gatewayCode;
    }

    public static function unreachable(?\Throwable $previous = null): self
    {
        return new self(self::UNREACHABLE, 'WhatsApp gateway is temporarily unavailable.', $previous);
    }

    public static function timeout(?\Throwable $previous = null): self
    {
        return new self(self::TIMEOUT, 'WhatsApp gateway is temporarily unavailable (request timed out).', $previous);
    }

    public static function unauthorized(?\Throwable $previous = null): self
    {
        return new self(self::UNAUTHORIZED, 'WhatsApp gateway rejected the request (unauthorized).', $previous);
    }

    public static function unavailable(string $detail, ?\Throwable $previous = null): self
    {
        return new self(self::UNAVAILABLE, 'WhatsApp gateway is temporarily unavailable.', $previous);
    }

    public static function invalidResponse(?\Throwable $previous = null): self
    {
        return new self(self::INVALID_RESPONSE, 'WhatsApp gateway returned an invalid response.', $previous);
    }

    public function retryable(): bool
    {
        return in_array($this->gatewayCode, self::RETRYABLE_CODES, true);
    }

    /**
     * The stable, user-safe status the frontend maps to its recoverable
     * "gateway unavailable" connection state.
     */
    public function publicStatus(): string
    {
        return 'unavailable';
    }
}
