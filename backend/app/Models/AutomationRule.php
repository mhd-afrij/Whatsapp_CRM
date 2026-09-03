<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;

class AutomationRule extends Model
{
    use BelongsToWorkspace;

    protected $fillable = [
        'workspace_id', 'name', 'trigger_type', 'trigger_value', 'actions',
        'is_active', 'run_count', 'last_run_at',
    ];

    protected function casts(): array
    {
        return ['actions' => 'array', 'is_active' => 'boolean', 'last_run_at' => 'datetime'];
    }
}