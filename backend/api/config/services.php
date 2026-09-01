<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'frontend' => [
        'url' => env('FRONTEND_URL', 'http://localhost:3000'),
    ],

    'whatsapp_sync' => [
        'base_url' => env('WHATSAPP_SYNC_INTERNAL_BASE_URL', 'http://localhost:3100'),
        'secret' => env('SERVICE_TO_SERVICE_SECRET'),
        'webhook_secret' => env('WHATSAPP_SYNC_WEBHOOK_SECRET', env('SERVICE_TO_SERVICE_SECRET')),
        'default_workspace_slug' => env('WHATSAPP_SYNC_DEFAULT_WORKSPACE_SLUG', 'demo'),
    ],

];
