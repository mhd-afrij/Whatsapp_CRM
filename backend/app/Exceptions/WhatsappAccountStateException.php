<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * A WhatsApp account operation violated a business rule of the
 * single-live-session gateway architecture (e.g. reconnecting a managed slot
 * that is not mapped to the live session, or activating an account while
 * another one is still connected). Surfaced to the frontend as a 409 so it
 * can prompt for the confirming action (disconnect first / force switch)
 * instead of being mistaken for a gateway outage (502) or a validation
 * failure (422).
 */
class WhatsappAccountStateException extends RuntimeException {}
