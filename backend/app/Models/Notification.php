<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Custom in-app notification record per docs/04-database-design.md (bigint id,
 * not Laravel's default UUID database-notifications table).
 */
class Notification extends Model
{
    use BelongsToWorkspace;

    protected $fillable = ['workspace_id', 'user_id', 'type', 'data', 'read_at'];

    protected function casts(): array
    {
        return [
            'data' => 'array',
            'read_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
