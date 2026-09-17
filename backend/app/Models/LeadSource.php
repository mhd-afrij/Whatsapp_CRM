<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;

class LeadSource extends Model
{
    use BelongsToWorkspace;

    protected $fillable = [
        'workspace_id', 'name', 'slug', 'color', 'icon', 'description',
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

    public const DEFAULT_SOURCES = [
        ['name' => 'WhatsApp', 'color' => '#22c55e', 'is_default' => true],
        ['name' => 'Website', 'color' => '#0ea5e9'],
        ['name' => 'Facebook', 'color' => '#3b82f6'],
        ['name' => 'Instagram', 'color' => '#a855f7'],
        ['name' => 'Referral', 'color' => '#f59e0b'],
        ['name' => 'Walk-in', 'color' => '#14b8a6'],
        ['name' => 'Phone Call', 'color' => '#8b5cf6'],
        ['name' => 'Email', 'color' => '#ef4444'],
        ['name' => 'Advertisement', 'color' => '#f43f5e'],
        ['name' => 'Other', 'color' => '#64748b'],
    ];

    public static function seedDefaults(int $workspaceId): void
    {
        if (self::query()->where('workspace_id', $workspaceId)->exists()) {
            return;
        }

        foreach (self::DEFAULT_SOURCES as $index => $source) {
            self::create([
                'workspace_id' => $workspaceId,
                'name' => $source['name'],
                'slug' => \Illuminate\Support\Str::slug($source['name'], '_'),
                'color' => $source['color'],
                'is_default' => $source['is_default'] ?? false,
                'is_active' => true,
                'sort_order' => $index,
            ]);
        }
    }
}