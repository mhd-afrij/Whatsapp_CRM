<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RefreshToken extends Model
{
    protected $fillable = [
        'user_id',
        'token_hash',
        'family_id',
        'revoked_at',
        'expires_at',
        'ip_address',
        'user_agent',
    ];

    protected function casts(): array
    {
        return [
            'revoked_at' => 'datetime',
            'expires_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isActive(): bool
    {
        return is_null($this->revoked_at) && $this->expires_at->isFuture();
    }
}
