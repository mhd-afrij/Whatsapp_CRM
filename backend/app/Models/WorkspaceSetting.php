<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkspaceSetting extends Model
{
    protected $fillable = [
        'workspace_id', 'business_hours', 'notification_defaults', 'branding',
        'away_message_enabled', 'away_message', 'away_message_trigger',
        'ai_provider', 'ai_model', 'ai_api_key', 'ai_business_context', 'ai_enabled',
    ];

    protected function casts(): array
    {
        return [
            'business_hours' => 'array',
            'notification_defaults' => 'array',
            'branding' => 'array',
            'away_message_enabled' => 'boolean',
            'ai_api_key' => 'encrypted',
            'ai_enabled' => 'boolean',
        ];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }
}

