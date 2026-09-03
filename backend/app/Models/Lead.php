<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Lead extends Model
{
    use BelongsToWorkspace, HasFactory, SoftDeletes;
    protected $fillable = ['workspace_id', 'contact_id', 'conversation_id', 'source', 'source_detail', 'campaign', 'landing_page', 'external_lead_id', 'stage', 'score', 'temperature', 'property_type', 'preferred_location', 'budget_min', 'budget_max', 'bedrooms', 'bathrooms', 'requirement_type', 'owner_user_id', 'assigned_team_id', 'notes', 'lost_reason', 'lost_notes', 'converted_at'];
    protected function casts(): array { return ['budget_min' => 'decimal:2', 'budget_max' => 'decimal:2', 'converted_at' => 'datetime']; }
    public function contact(): BelongsTo { return $this->belongsTo(Contact::class); }
    public function conversation(): BelongsTo { return $this->belongsTo(Conversation::class); }
    public function owner(): BelongsTo { return $this->belongsTo(User::class, 'owner_user_id'); }
    public function assignedTeam(): BelongsTo { return $this->belongsTo(Team::class, 'assigned_team_id'); }
    public function activities(): HasMany { return $this->hasMany(LeadActivity::class)->latest('occurred_at'); }
    public function deals(): HasMany { return $this->hasMany(Deal::class); }
    public function labels(): BelongsToMany { return $this->belongsToMany(Label::class, 'lead_label')->withTimestamps(); }
}
