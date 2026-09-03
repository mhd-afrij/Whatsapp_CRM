<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeadActivity extends Model
{
    use BelongsToWorkspace;
    protected $fillable = ['workspace_id', 'lead_id', 'created_by', 'activity_type', 'description', 'metadata', 'occurred_at'];
    protected function casts(): array { return ['metadata' => 'array', 'occurred_at' => 'datetime']; }
    public function lead(): BelongsTo { return $this->belongsTo(Lead::class); }
    public function creator(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
}
