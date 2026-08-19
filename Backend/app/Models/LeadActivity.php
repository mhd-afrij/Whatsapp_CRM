<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class LeadActivity extends Model
{
    use BelongsToWorkspace;

    public $timestamps = false;

    protected $fillable = [
        'workspace_id',
        'lead_id',
        'created_by',
        'activity_type',
        'subject_type',
        'subject_id',
        'description',
        'metadata',
        'occurred_at',
    ];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'occurred_at' => 'datetime',
        ];
    }

    // ── Relationships ───────────────────────────────────────────────────

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function subject(): MorphTo
    {
        return $this->morphTo();
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    /**
     * Convenience factory used by LeadService / controllers.
     */
    public static function record(
        int $workspaceId,
        int $leadId,
        string $activityType,
        ?int $createdBy = null,
        ?string $description = null,
        ?array $metadata = null,
        ?string $subjectType = null,
        ?int $subjectId = null,
    ): self {
        return static::create([
            'workspace_id' => $workspaceId,
            'lead_id' => $leadId,
            'created_by' => $createdBy,
            'activity_type' => $activityType,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'description' => $description,
            'metadata' => $metadata,
            'occurred_at' => now(),
        ]);
    }
}
