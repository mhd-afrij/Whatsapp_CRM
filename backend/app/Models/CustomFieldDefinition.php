<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;

class CustomFieldDefinition extends Model
{
    use BelongsToWorkspace;

    protected $fillable = [
        'workspace_id', 'entity_type', 'name', 'key', 'field_type',
        'options', 'is_required', 'is_active', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'options' => 'array',
            'is_required' => 'boolean',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }
}
