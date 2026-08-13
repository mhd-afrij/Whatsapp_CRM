<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use App\Models\Concerns\ReadOnlyFromBackend;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Gateway-owned table (see docs/DATA_OWNERSHIP.md). Read-only from the backend,
 * EXCEPT the single documented exception: `contact_id` may be written by the
 * backend's contact-merge flow via {@see self::linkToContact()}.
 */
class WhatsappContact extends Model
{
    use BelongsToWorkspace, ReadOnlyFromBackend;

    protected $fillable = [
        'workspace_id', 'wa_jid', 'push_name', 'phone_number', 'profile_picture_url',
        'is_business', 'contact_id', 'last_seen_at',
    ];

    protected function casts(): array
    {
        return [
            'is_business' => 'boolean',
            'last_seen_at' => 'datetime',
        ];
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(Conversation::class);
    }

    /**
     * Narrow, single-purpose write allowed by DATA_OWNERSHIP.md §"Cross-link fields":
     * the backend is permitted to populate `contact_id` when merging a WhatsApp
     * contact into a CRM contact. No other column may be written from the backend.
     */
    public function linkToContact(Contact $contact): bool
    {
        return static::withoutEvents(function () use ($contact) {
            return static::query()->whereKey($this->getKey())->update(['contact_id' => $contact->getKey()]) > 0;
        });
    }
}
