<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PipelineStage extends Model
{
    use HasFactory;

    protected $fillable = [
        'pipeline_id', 'name', 'position', 'probability_percent', 'is_won_stage', 'is_lost_stage',
    ];

    protected function casts(): array
    {
        return [
            'is_won_stage' => 'boolean',
            'is_lost_stage' => 'boolean',
        ];
    }

    public function pipeline(): BelongsTo
    {
        return $this->belongsTo(Pipeline::class);
    }

    public function deals(): HasMany
    {
        return $this->hasMany(Deal::class);
    }
}
