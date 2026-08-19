<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Lead extends Model
{
    use BelongsToWorkspace, HasFactory, SoftDeletes;

    // ── Lifecycle stages (§2) ──────────────────────────────────────────
    public const STAGE_NEW = 'new';
    public const STAGE_CONTACTED = 'contacted';
    public const STAGE_QUALIFIED = 'qualified';
    public const STAGE_VIEWING = 'viewing';
    public const STAGE_NEGOTIATION = 'negotiation';
    public const STAGE_CONVERTED = 'converted';
    public const STAGE_LOST = 'lost';

    public const ACTIVE_STAGES = [
        self::STAGE_NEW,
        self::STAGE_CONTACTED,
        self::STAGE_QUALIFIED,
        self::STAGE_VIEWING,
        self::STAGE_NEGOTIATION,
    ];

    // ── Temperatures (§7) ──────────────────────────────────────────────
    public const TEMP_COLD = 'cold';
    public const TEMP_WARM = 'warm';
    public const TEMP_HOT = 'hot';

    // ── Lost reasons (§10) ─────────────────────────────────────────────
    public const LOST_REASONS = [
        'price_too_high',
        'not_interested',
        'purchased_elsewhere',
        'no_response',
        'invalid_lead',
        'duplicate',
        'requirement_changed',
        'other',
    ];

    protected $fillable = [
        'workspace_id',
        'contact_id',
        'conversation_id',
        'source',
        'source_detail',
        'campaign',
        'landing_page',
        'external_lead_id',
        'stage',
        'score',
        'temperature',
        'owner_user_id',
        'assigned_team_id',
        'property_type',
        'preferred_location',
        'budget_min',
        'budget_max',
        'bedrooms',
        'bathrooms',
        'requirement_type',
        'notes',
        'lost_reason',
        'lost_notes',
        'converted_at',
    ];

    protected function casts(): array
    {
        return [
            'score' => 'integer',
            'budget_min' => 'decimal:2',
            'budget_max' => 'decimal:2',
            'bedrooms' => 'integer',
            'bathrooms' => 'integer',
            'converted_at' => 'datetime',
        ];
    }

    // ── Computed attributes ─────────────────────────────────────────────

    /**
     * Temperature label derived from score (§7).
     *
     * This is an *accessor* — the persisted `temperature` column is the
     * canonical source, but this method is useful for display when only the
     * score is available.
     */
    protected function temperatureFromScore(): Attribute
    {
        return Attribute::make(
            get: fn () => match (true) {
                $this->score >= 80 => self::TEMP_HOT,
                $this->score >= 40 => self::TEMP_WARM,
                default => self::TEMP_COLD,
            },
        );
    }

    // ── Relationships ───────────────────────────────────────────────────

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }

    public function assignedTeam(): BelongsTo
    {
        return $this->belongsTo(Team::class, 'assigned_team_id');
    }

    public function deals(): HasMany
    {
        return $this->hasMany(Deal::class);
    }

    public function labels(): BelongsToMany
    {
        return $this->belongsToMany(Label::class, 'lead_label')->withPivot('created_at');
    }

    public function activities(): HasMany
    {
        return $this->hasMany(LeadActivity::class);
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    // ── Scopes ──────────────────────────────────────────────────────────

    /**
     * Narrow to active (non-terminal) leads.
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->whereIn('stage', self::ACTIVE_STAGES);
    }

    /**
     * Filter by owner (own scope for agents).
     */
    public function scopeOwnedBy(Builder $query, int $userId): Builder
    {
        return $query->where('owner_user_id', $userId);
    }

    /**
     * Filter by team.
     */
    public function scopeForTeam(Builder $query, int $teamId): Builder
    {
        return $query->where('assigned_team_id', $teamId);
    }

    /**
     * Full-text search across name, email, phone, company (§13).
     */
    public function scopeSearch(Builder $query, string $search): Builder
    {
        $term = trim($search);

        return $query->whereHas('contact', function (Builder $q) use ($term) {
            $q->where(function (Builder $inner) use ($term) {
                $inner->where('full_name', 'like', "%{$term}%")
                    ->orWhere('email', 'like', "%{$term}%")
                    ->orWhere('phone_number', 'like', "%{$term}%")
                    ->orWhere('company', 'like', "%{$term}%");
            });
        });
    }
}
