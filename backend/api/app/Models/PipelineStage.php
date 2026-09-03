<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PipelineStage extends Model
{
    use BelongsToWorkspace;

    protected $fillable = [
        'workspace_id',
        'name',
        'slug',
        'position',
        'color',
    ];

    protected function casts(): array
    {
        return [
            'position' => 'integer',
        ];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }
}
