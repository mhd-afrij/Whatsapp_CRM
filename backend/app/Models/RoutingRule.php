<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;

class RoutingRule extends Model
{
    use BelongsToWorkspace;

    protected $fillable = [
        'workspace_id', 'name', 'is_active', 'priority', 'conditions', 'actions',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'priority' => 'integer',
            'conditions' => 'array',
            'actions' => 'array',
        ];
    }
}