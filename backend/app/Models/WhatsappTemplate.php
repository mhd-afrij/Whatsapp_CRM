<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A saved WhatsApp message template. Baileys-only app: never labelled "Meta
 * approved", so provider_template_id / approval_status are always null for
 * locally created templates (kept on the row so an official Meta API
 * integration can be added later without a migration).
 */
class WhatsappTemplate extends Model
{
    use BelongsToWorkspace;

    public const HEADER_TYPES = ['none', 'text', 'image', 'document', 'video'];
    public const CATEGORIES = [
        'general', 'sales', 'support', 'follow-up', 'reminder', 'appointment',
        'lead', 'payment', 'marketing', 'internal', 'custom',
    ];

    protected $fillable = [
        'workspace_id',
        'account_id',
        'name',
        'key',
        'category',
        'language',
        'header_type',
        'header_content',
        'body',
        'footer',
        'buttons_json',
        'variables_json',
        'provider_template_id',
        'approval_status',
        'is_active',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'account_id' => 'integer',
            'buttons_json' => 'array',
            'variables_json' => 'array',
            'is_active' => 'boolean',
            'created_by' => 'integer',
        ];
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(WhatsappAccount::class, 'account_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}