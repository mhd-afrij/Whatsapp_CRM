<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class InternalNote extends Model
{
    use BelongsToWorkspace, HasFactory;

    protected $fillable = [
        'workspace_id', 'conversation_id', 'contact_id', 'deal_id', 'author_id', 'body', 'is_private',
    ];

    protected function casts(): array
    {
        return ['is_private' => 'boolean'];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function deal(): BelongsTo
    {
        return $this->belongsTo(Deal::class);
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    public function mentions(): HasMany
    {
        return $this->hasMany(NoteMention::class);
    }
}