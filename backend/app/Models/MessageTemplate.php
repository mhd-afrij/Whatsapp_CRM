<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Workspace-scoped saved replies / message templates used by agents to
 * respond quickly with consistent, pre-approved copy. Supports variables of
 * the form {{contact.first_name}}, {{contact.last_name}}, {{agent.name}},
 * {{workspace.name}}, {{deal.name}} which are resolved at send time by
 * MessageTemplateService::resolve().
 */
class MessageTemplate extends Model
{
    use BelongsToWorkspace, HasFactory;

    protected $fillable = [
        'workspace_id', 'name', 'shortcut', 'content', 'category', 'is_active', 'created_by', 'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
