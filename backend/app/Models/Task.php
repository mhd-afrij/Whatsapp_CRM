<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Task extends Model
{
    use BelongsToWorkspace, HasFactory, SoftDeletes;

    protected $fillable = [
        'workspace_id', 'title', 'description', 'assignee_id', 'created_by', 'contact_id',
        'lead_id', 'deal_id', 'conversation_id', 'due_at', 'priority', 'status', 'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'due_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class);
    }

    public function deal(): BelongsTo
    {
        return $this->belongsTo(Deal::class);
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function comments(): HasMany
    {
        return $this->hasMany(TaskComment::class);
    }

    public function reminders(): HasMany
    {
        return $this->hasMany(TaskReminder::class);
    }
}
