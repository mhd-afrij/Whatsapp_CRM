<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Models\Concerns\BelongsToWorkspace;
use App\Notifications\ResetPasswordNotification;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Collection;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use BelongsToWorkspace, HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    public const ROLE_SUPER_ADMIN = 'super_admin';

    public const ROLE_ADMIN = 'admin';

    public const ROLE_USER = 'user';

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
        'about',
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
        return $this->belongsToMany(Role::class, 'role_user')->withPivot('created_at');
    }

    public function teams(): BelongsToMany
    {
        return $this->belongsToMany(Team::class, 'team_user')->withPivot('is_lead')->withPivot('created_at');
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
    public function permissionNames(): Collection
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

    protected ?Collection $cachedPermissionNames = null;

    public function isSuperAdmin(): bool
    {
        return $this->hasRoleKey(self::ROLE_SUPER_ADMIN);
    }

    public function isAdmin(): bool
    {
        return $this->isSuperAdmin() || $this->hasRoleKey(self::ROLE_ADMIN);
    }

    /**
     * Stable product-level RBAC keys exposed to the frontend/API consumers.
     * Existing seeded role names remain intact; Manager/Agent/Viewer collapse
     * to the standard user tier for the fixed 3-role access model.
     *
     * @return array<int, string>
     */
    public function roleKeys(): array
    {
        $roles = $this->roles()->get(['name', 'slug']);

        if ($roles->contains(fn (Role $role) => $this->roleMatches($role, self::ROLE_SUPER_ADMIN))) {
            return [self::ROLE_SUPER_ADMIN];
        }

        if ($roles->contains(fn (Role $role) => $this->roleMatches($role, self::ROLE_ADMIN))) {
            return [self::ROLE_ADMIN];
        }

        return [self::ROLE_USER];
    }

    public function hasRoleKey(string $roleKey): bool
    {
        return $this->roles()
            ->get(['name', 'slug'])
            ->contains(fn (Role $role) => $this->roleMatches($role, $roleKey));
    }

    protected function roleMatches(Role $role, string $roleKey): bool
    {
        return match ($roleKey) {
            self::ROLE_SUPER_ADMIN => in_array($role->slug, ['super_admin', 'super-administrator'], true)
                || $role->name === 'Super Administrator',
            self::ROLE_ADMIN => in_array($role->slug, ['admin', 'administrator'], true)
                || $role->name === 'Administrator',
            self::ROLE_USER => ! $this->roleMatches($role, self::ROLE_SUPER_ADMIN)
                && ! $this->roleMatches($role, self::ROLE_ADMIN),
            default => false,
        };
    }

    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new ResetPasswordNotification($token));
    }
}
