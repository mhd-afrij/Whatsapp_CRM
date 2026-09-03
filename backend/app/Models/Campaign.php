<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A bulk WhatsApp messaging campaign. Audience is resolved from
 * audience_filter (labels/statuses/search) at send time; each recipient gets a
 * campaign_messages row that tracks its individual dispatch outcome. The text
 * sent is message_content (snapshotted from the linked template, if any), so
 * later template edits never change what an already-created campaign delivers.
 */
class Campaign extends Model
{
    use BelongsToWorkspace, HasFactory;

    public const STATUS_DRAFT = 'draft';
    public const STATUS_SCHEDULED = 'scheduled';
    public const STATUS_SENDING = 'sending';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_FAILED = 'failed';
    public const STATUS_CANCELLED = 'cancelled';

    public const STATUSES = [
        self::STATUS_DRAFT,
        self::STATUS_SCHEDULED,
        self::STATUS_SENDING,
        self::STATUS_COMPLETED,
        self::STATUS_FAILED,
        self::STATUS_CANCELLED,
    ];

    /** Statuses a (re)send may be triggered from. */
    public const SENDABLE_STATUSES = [
        self::STATUS_DRAFT,
        self::STATUS_SCHEDULED,
        self::STATUS_COMPLETED,
        self::STATUS_FAILED,
    ];

    protected $fillable = [
        'workspace_id', 'name', 'description', 'message_template_id', 'message_content',
        'audience_filter', 'status', 'scheduled_at', 'started_at', 'completed_at',
        'total_targets', 'sent_count', 'failed_count', 'created_by', 'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'audience_filter' => 'array',
            'scheduled_at' => 'datetime',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(MessageTemplate::class, 'message_template_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(CampaignMessage::class);
    }

    /**
     * The actor whose identity template variables ({{agent.name}}) resolve
     * against - the campaign creator, even if since archived.
     */
    public function senderContext(): User
    {
        $user = $this->created_by ? User::withTrashed()->find($this->created_by) : null;

        return $user ?? new User(['name' => '']);
    }
}
