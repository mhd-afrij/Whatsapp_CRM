<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SlaEvent extends Model
{
    use BelongsToWorkspace;

    protected $fillable = [
        'workspace_id',
        'conversation_id',
        'sla_config_id',
        'type',
        'status',
        'started_at',
        'deadline_at',
        'resolved_at',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'deadline_at' => 'datetime',
            'resolved_at' => 'datetime',
        ];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function slaConfig(): BelongsTo
    {
        return $this->belongsTo(SlaConfig::class);
    }
}
