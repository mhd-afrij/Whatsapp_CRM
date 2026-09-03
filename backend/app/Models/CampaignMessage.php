<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Per-recipient dispatch record for a campaign. One row per (campaign,
 * contact) - the unique constraint makes re-sending a campaign idempotent:
 * rows already marked sent are never recreated or re-dispatched.
 */
class CampaignMessage extends Model
{
    use BelongsToWorkspace, HasFactory;

    public const STATUS_PENDING = 'pending';
    public const STATUS_SENT = 'sent';
    public const STATUS_FAILED = 'failed';
    public const STATUS_SKIPPED = 'skipped';

    protected $fillable = [
        'workspace_id', 'campaign_id', 'contact_id', 'phone_number', 'rendered_content',
        'status', 'conversation_id', 'wa_message_id', 'dispatch_id', 'error', 'sent_at',
    ];

    protected function casts(): array
    {
        return [
            'sent_at' => 'datetime',
        ];
    }

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(Campaign::class);
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }
}
