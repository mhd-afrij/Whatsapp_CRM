<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Models\Concerns\BelongsToWorkspace;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use BelongsToWorkspace, HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'workspace_id',
        'name',
        'email',
        'password',
        'avatar_path',
        'is_active',
        'last_login_at',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'last_login_at' => 'datetime',
        ];
    }

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'role_user')->withPivot("created_at");
    }

    public function teams(): BelongsToMany
    {
        return $this->belongsToMany(Team::class, 'team_user')->withPivot('is_lead')->withPivot("created_at");
    }

    public function assignedConversations(): HasMany
    {
        return $this->hasMany(Conversation::class, 'assigned_user_id');
    }

    public function presence(): HasOne
    {
        return $this->hasOne(UserPresence::class);
    }

    public function hasPermission(string $permission): bool
    {
        return $this->permissionNames()->contains($permission);
    }

    public function hasAnyPermission(array $permissions): bool
    {
        return $this->permissionNames()->intersect($permissions)->isNotEmpty();
    }

    /**
     * All distinct permission names granted to this user via their roles. Cached per-request
     * instance to avoid repeated queries during a single permission-heavy request.
     */
    public function permissionNames(): \Illuminate\Support\Collection
    {
        if (! isset($this->cachedPermissionNames)) {
            $this->cachedPermissionNames = $this->roles()
                ->with('permissions')
                ->get()
                ->flatMap(fn (Role $role) => $role->permissions->pluck('name'))
                ->unique()
                ->values();
        }

        return $this->cachedPermissionNames;
    }

    protected ?\Illuminate\Support\Collection $cachedPermissionNames = null;

    public function isSuperAdmin(): bool
    {
        return $this->roles()->where('slug', 'super-administrator')->exists();
    }

    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new \App\Notifications\ResetPasswordNotification($token));
    }
}
