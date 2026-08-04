<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Label extends Model
{
    use BelongsToWorkspace, HasFactory;

    protected $fillable = ['workspace_id', 'name', 'color_hex'];

    public function contacts(): BelongsToMany
    {
        return $this->belongsToMany(Contact::class, 'contact_label')->withPivot("created_at");
    }

    public function conversations(): BelongsToMany
    {
        return $this->belongsToMany(Conversation::class, 'conversation_label')->withPivot("created_at");
    }

    public function leads(): BelongsToMany
    {
        return $this->belongsToMany(Lead::class, 'lead_label')->withPivot("created_at");
    }

    public function deals(): BelongsToMany
    {
        return $this->belongsToMany(Deal::class, 'deal_label')->withPivot("created_at");
    }
}