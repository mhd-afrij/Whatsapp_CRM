<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Team extends Model
{
    use BelongsToWorkspace;

    protected $fillable = ['workspace_id', 'name', 'description'];

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'team_user')->withPivot('is_lead', 'created_at');
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(Conversation::class, 'assigned_team_id');
    }
}