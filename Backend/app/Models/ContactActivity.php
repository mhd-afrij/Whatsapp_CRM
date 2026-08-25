<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContactActivity extends Model
{
    use BelongsToWorkspace;

    public $timestamps = false;

    protected $fillable = [
        'workspace_id', 'contact_id', 'activity_type', 'subject_type', 'subject_id',
        'description', 'occurred_at', 'created_by',
    ];

    protected function casts(): array
    {
        return ['occurred_at' => 'datetime'];
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
