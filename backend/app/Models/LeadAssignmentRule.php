<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;

class LeadAssignmentRule extends Model
{
    use BelongsToWorkspace;

    protected $fillable = [
        'workspace_id', 'name', 'conditions', 'actions',
        'priority', 'is_active', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'conditions' => 'array',
            'actions' => 'array',
            'priority' => 'integer',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }
}