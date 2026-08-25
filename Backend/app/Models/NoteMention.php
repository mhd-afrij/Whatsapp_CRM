<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NoteMention extends Model
{
    public $timestamps = false;

    protected $fillable = ['internal_note_id', 'mentioned_user_id', 'notified_at'];

    protected function casts(): array
    {
        return ['notified_at' => 'datetime'];
    }

    public function note(): BelongsTo
    {
        return $this->belongsTo(InternalNote::class, 'internal_note_id');
    }

    public function mentionedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'mentioned_user_id');
    }
}
