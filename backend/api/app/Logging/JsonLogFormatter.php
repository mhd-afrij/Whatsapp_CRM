<?php

namespace App\Logging;

use Illuminate\Log\Logger;
use Monolog\Formatter\JsonFormatter;

class JsonLogFormatter
{
    /**
     * Apply structured JSON formatting to every handler on the given channel.
     *
     * Fields (timestamp, level, message, context, extra) are emitted by
     * Monolog's JsonFormatter itself; request_id/workspace_id/user_id are
     * injected as log context by RequestContextLogProcessor (added when the
     * Authentication phase introduces workspace/user context).
     */
    public function __invoke(Logger $logger): void
    {
        foreach ($logger->getHandlers() as $handler) {
            $handler->setFormatter(new JsonFormatter);
        }
    }
}
