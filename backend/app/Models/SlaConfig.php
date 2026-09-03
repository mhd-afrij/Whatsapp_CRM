<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SlaConfig extends Model
{
    use BelongsToWorkspace;

    protected $fillable = [
        'workspace_id',
        'name',
        'first_response_minutes',
        'followup_response_minutes',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function slaEvents(): HasMany
    {
        return $this->hasMany(SlaEvent::class);
    }
}
