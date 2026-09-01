<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;

class SystemSetting extends Model
{
    use BelongsToWorkspace;

    protected $fillable = [
        'workspace_id',
        'key',
        'value',
        'type',
    ];

    public function getCastValueAttribute()
    {
        return match ($this->type) {
            'boolean' => filter_var($this->value, FILTER_VALIDATE_BOOLEAN),
            'integer' => (int) $this->value,
            'json' => json_decode($this->value, true),
            default => $this->value,
        };
    }

    public static function getForWorkspace(int $workspaceId, string $key, mixed $default = null): mixed
    {
        $setting = static::where('workspace_id', $workspaceId)->where('key', $key)->first();

        return $setting ? $setting->cast_value : $default;
    }

    public static function setForWorkspace(int $workspaceId, string $key, mixed $value): void
    {
        static::updateOrCreate(
            ['workspace_id' => $workspaceId, 'key' => $key],
            [
                'value' => is_array($value) ? json_encode($value) : (string) $value,
                'type' => match (true) {
                    is_bool($value) => 'boolean',
                    is_int($value) => 'integer',
                    is_array($value) => 'json',
                    default => 'string',
                },
            ]
        );
    }
}
