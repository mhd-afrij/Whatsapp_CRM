<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use App\Support\PhoneNumber;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Contact extends Model
{
    use BelongsToWorkspace, HasFactory, SoftDeletes;

    public const STATUS_ACTIVE = 'active';
    public const STATUS_INACTIVE = 'inactive';

    public const PRIORITY_LOW = 'low';
    public const PRIORITY_NORMAL = 'normal';
    public const PRIORITY_HIGH = 'high';
    public const PRIORITY_URGENT = 'urgent';

    public const SOURCE_WHATSAPP = 'whatsapp';
    public const SOURCE_MANUAL = 'manual';
    public const SOURCE_IMPORT = 'import';
    public const SOURCE_OTHER = 'other';

    protected $fillable = [
        'workspace_id', 'whatsapp_contact_id', 'full_name', 'email', 'company', 'job_title',
        'phone_number', 'address', 'city', 'country', 'timezone', 'status', 'priority', 'source',
        'normalized_phone_number', 'last_contacted_at', 'custom_fields', 'owner_user_id',
    ];

    protected function casts(): array
    {
        return [
            'custom_fields' => 'array',
            'last_contacted_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (Contact $contact) {
            // Normalize once, at the model boundary, so every write path (API,
            // import, WhatsApp auto-linking) gets a canonical searchable key
            // without each caller remembering to do it. The user-visible
            // phone_number stays as provided for display; normalized_phone_number
            // is the dedup/search key (spec §4).
            if ($contact->phone_number !== null) {
                $contact->normalized_phone_number = PhoneNumber::normalize($contact->phone_number);
            }
        });
    }

    public function whatsappContact(): BelongsTo
    {
        return $this->belongsTo(WhatsappContact::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(Conversation::class);
    }

    public function deals(): HasMany
    {
        return $this->hasMany(Deal::class);
    }

    public function activities(): HasMany
    {
        return $this->hasMany(ContactActivity::class);
    }

    public function labels(): BelongsToMany
    {
        return $this->belongsToMany(Label::class, 'contact_label')->withPivot('created_at');
    }

    /**
     * Search by name/email/company/phone where phone matches on the normalized
     * key too, so searching "0771234567" finds a contact stored as
     * "+94771234567" (both normalize to "94771234567").
     */
    public function scopeSearch(Builder $query, string $search): Builder
    {
        $term = trim($search);

        return $query->where(function (Builder $q) use ($term) {
            $q->where('full_name', 'like', "%{$term}%")
                ->orWhere('email', 'like', "%{$term}%")
                ->orWhere('company', 'like', "%{$term}%")
                ->orWhere('phone_number', 'like', "%{$term}%");

            if (preg_match('/\d/', $term)) {
                $q->orWhere('normalized_phone_number', 'like', '%'.PhoneNumber::normalize($term).'%');
            }
        });
    }

    /**
     * Contacts linked to a WhatsApp identity (the "WhatsApp connected" filter).
     */
    public function scopeWhatsappConnected(Builder $query): Builder
    {
        return $query->whereHas('whatsappContact');
    }

    /**
     * Contacts with no WhatsApp identity on file (the "WhatsApp unavailable"
     * filter) - useful for spotting manual/imported records that were never
     * linked to a WhatsApp number.
     */
    public function scopeWhatsappUnavailable(Builder $query): Builder
    {
        return $query->whereDoesntHave('whatsappContact');
    }
}
