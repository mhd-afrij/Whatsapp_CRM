<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhatsappAccountSetting extends Model
{
    use BelongsToWorkspace;

    protected $fillable = [
        'workspace_id',
        'whatsapp_session_id',
        'assigned_team_id',
        'display_name',
        'is_default',
        'auto_reply_settings',
    ];

    protected function casts(): array
    {
        return [
            'whatsapp_session_id' => 'integer',
            'assigned_team_id' => 'integer',
            'is_default' => 'boolean',
            'auto_reply_settings' => 'array',
        ];
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(WhatsappSession::class, 'whatsapp_session_id');
    }

    public function assignedTeam(): BelongsTo
    {
        return $this->belongsTo(Team::class, 'assigned_team_id');
    }
}
