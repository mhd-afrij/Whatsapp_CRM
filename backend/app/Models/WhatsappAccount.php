<?php

namespace App\Models;

use App\Models\Concerns\BelongsToWorkspace;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A managed WhatsApp connection for a workspace. The real authenticated
 * Baileys session lives in the gateway; this row is the CRM's bookkeeping +
 * configuration around it. `status` mirrors the gateway snapshot (kept in
 * sync by WhatsappAccountService from the gateway-owned whatsapp_sessions
 * row, keyed by whatsapp_account_id), never invented by the frontend.
 *
 * The gateway runs one live Baileys session per connection (see
 * ConnectionManagerRegistry in whatsapp-gateway), so a workspace can hold
 * many connections and every one of them may be connected concurrently.
 * is_active is a routing preference (the default account for the inbox and
 * auto-routing), not a "only one live session" guard: creating or
 * activating a row NEVER reports it as connected - only a real gateway
 * confirmation does.
 */
class WhatsappAccount extends Model
{
    use BelongsToWorkspace, HasFactory;

    protected $table = 'whatsapp_connections';

    public const PROVIDER_BAILEYS = 'baileys';

    public const ROUTING_MODES = ['default', 'round_robin', 'team_only'];

    protected $fillable = [
        'workspace_id',
        'name',
        'phone_number',
        'display_name',
        'device_name',
        'provider',
        'status',
        'session_id',
        'auto_reply_enabled',
        'assigned_team_id',
        'routing_mode',
        'is_active',
        'last_connected_at',
        'connected_at',
        'last_seen_at',
        'last_disconnected_at',
        'disconnected_at',
        'sync_state',
        'qr_expires_at',
        'last_heartbeat_at',
        'last_error_code',
        'last_error_message',
        'failure_reason',
        'routing_settings',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'auto_reply_enabled' => 'boolean',
            'assigned_team_id' => 'integer',
            'session_id' => 'integer',
            'is_active' => 'boolean',
            'last_connected_at' => 'datetime',
            'connected_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'last_disconnected_at' => 'datetime',
            'disconnected_at' => 'datetime',
            'qr_expires_at' => 'datetime',
            'last_heartbeat_at' => 'datetime',
            'routing_settings' => 'array',
            'created_by' => 'integer',
        ];
    }

    public function assignedTeam(): BelongsTo
    {
        return $this->belongsTo(Team::class, 'assigned_team_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function whatsappSession(): BelongsTo
    {
        return $this->belongsTo(WhatsappSession::class, 'session_id');
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(Conversation::class, 'whatsapp_account_id');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class, 'whatsapp_account_id');
    }
}
