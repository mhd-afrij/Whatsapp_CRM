<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Contact extends Model
{
    use BelongsToWorkspace, SoftDeletes;

    protected $table = 'customers';

    protected $fillable = [
        'workspace_id',
        'name',
        'phone',
        'email',
        'company',
        'stage',
        'agent_name',
        'last_contact_at',
    ];

    protected function casts(): array
    {
        return [
            'last_contact_at' => 'datetime',
        ];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(Conversation::class);
    }
}
