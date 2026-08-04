<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Builder;

/**
 * Split-ownership table (see docs/DATA_OWNERSHIP.md §"Column-level split table").
 * Row creation and WhatsApp-derived columns (whatsapp_contact_id, last_message_at,
 * last_message_preview, unread_count) are gateway-owned; CRM columns (contact_id,
 * status, assigned_user_id, assigned_team_id, closed_at, closed_by) are backend-owned.
 * The backend may freely read/write here because it owns its column subset, but
 * must never touch the gateway's columns outside the internal API contract.
 */
class Conversation extends Model
{
    use BelongsToWorkspace, HasFactory;

    protected $fillable = [
        'workspace_id', 'whatsapp_contact_id', 'contact_id', 'status', 'priority', 'assigned_user_id',
        'assigned_team_id', 'last_message_at', 'last_message_preview', 'unread_count',
        'closed_at', 'closed_by',
    ];

    protected function casts(): array
    {
        return [
            'last_message_at' => 'datetime',
            'closed_at' => 'datetime',
            'unread_count' => 'integer',
        ];
    }

    public function whatsappContact(): BelongsTo
    {
        return $this->belongsTo(WhatsappContact::class);
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function assignedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_user_id');
    }

    public function assignedTeam(): BelongsTo
    {
        return $this->belongsTo(Team::class, 'assigned_team_id');
    }

    public function closedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'closed_by');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }

    public function assignments(): HasMany
    {
        return $this->hasMany(ConversationAssignment::class);
    }

    public function participants(): HasMany
    {
        return $this->hasMany(ConversationParticipant::class);
    }

    public function labels(): BelongsToMany
    {
        return $this->belongsToMany(Label::class, 'conversation_label')->withPivot("created_at");
    }

    /**
     * Constrain inbox reads to the records a user may see. WorkspaceScope is
     * already applied by BelongsToWorkspace; this scope adds the agent/team
     * boundary required on top of that tenant boundary.
     */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        if ($user->hasPermission('conversations.view_all')) {
            return $query;
        }

        $teamIds = $user->teams()->pluck('teams.id');

        return $query->where(function (Builder $visible) use ($user, $teamIds) {
            $visible->where('assigned_user_id', $user->id);

            if ($teamIds->isNotEmpty()) {
                $visible->orWhereIn('assigned_team_id', $teamIds);
            }
        });
    }
}
