<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;

class LeadStatus extends Model
{
    use BelongsToWorkspace;

    protected $fillable = [
        'workspace_id', 'name', 'slug', 'color', 'type', 'description',
        'is_default', 'is_active', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public const DEFAULT_STATUSES = [
        ['name' => 'New', 'color' => '#6366f1', 'type' => 'open', 'is_default' => true],
        ['name' => 'Contacted', 'color' => '#0ea5e9', 'type' => 'open'],
        ['name' => 'Qualified', 'color' => '#22c55e', 'type' => 'open'],
        ['name' => 'Proposal Sent', 'color' => '#f59e0b', 'type' => 'open'],
        ['name' => 'Negotiation', 'color' => '#a855f7', 'type' => 'open'],
        ['name' => 'Unqualified', 'color' => '#ef4444', 'type' => 'lost'],
        ['name' => 'Converted', 'color' => '#16a34a', 'type' => 'won'],
    ];

    public static function seedDefaults(int $workspaceId): void
    {
        if (self::query()->where('workspace_id', $workspaceId)->exists()) {
            return;
        }

        foreach (self::DEFAULT_STATUSES as $index => $status) {
            self::create([
                'workspace_id' => $workspaceId,
                'name' => $status['name'],
                'slug' => \Illuminate\Support\Str::slug($status['name'], '_'),
                'color' => $status['color'],
                'type' => $status['type'],
                'is_default' => $status['is_default'] ?? false,
                'is_active' => true,
                'sort_order' => $index,
            ]);
        }
    }
}