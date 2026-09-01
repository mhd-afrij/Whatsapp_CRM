<?php

use App\Models\RefreshToken;
use App\Models\Role;
use App\Models\User;
use App\Models\Workspace;

function ensureOwnerRole(): Role
{
    return Role::firstOrCreate(
        ['workspace_id' => null, 'slug' => 'owner'],
        ['name' => 'Owner', 'is_system_role' => true],
    );
}

it('registers a new workspace with an owner account and returns tokens', function () {
    $role = ensureOwnerRole();

    $response = $this->postJson('/api/v1/auth/register', [
        'name' => 'Dana Owner',
        'email' => 'dana@example.test',
        'password' => 'a-very-strong-password',
        'password_confirmation' => 'a-very-strong-password',
        'workspace_name' => 'Acme Realty',
    ]);

    $response->assertStatus(200)
        ->assertJsonStructure([
            'data' => ['access_token', 'refresh_token', 'token_type', 'expires_in', 'user' => ['id', 'email']],
        ]);

    $workspace = Workspace::where('slug', 'acme-realty')->first();
    expect($workspace)->not->toBeNull();
    expect($workspace->status)->toBe('active');

    $user = User::where('workspace_id', $workspace->id)->where('email', 'dana@example.test')->first();
    expect($user)->not->toBeNull();
    expect($user->status)->toBe('active');
    expect($user->roles()->pluck('id'))->toContain($role->id);

    expect(RefreshToken::where('user_id', $user->id)->count())->toBe(1);
});

it('registers and can immediately log in without naming the workspace', function () {
    ensureOwnerRole();

    $this->postJson('/api/v1/auth/register', [
        'name' => 'Dana Owner',
        'email' => 'dana@example.test',
        'password' => 'a-very-strong-password',
        'password_confirmation' => 'a-very-strong-password',
        'workspace_name' => 'Acme Realty',
    ])->assertStatus(200);

    $this->postJson('/api/v1/auth/login', [
        'email' => 'dana@example.test',
        'password' => 'a-very-strong-password',
    ])->assertStatus(200)
        ->assertJsonStructure(['data' => ['access_token']]);
});

it('uniquifies the workspace slug when the name is already taken', function () {
    ensureOwnerRole();

    Workspace::factory()->create(['name' => 'Acme Realty', 'slug' => 'acme-realty']);

    $response = $this->postJson('/api/v1/auth/register', [
        'name' => 'Other Owner',
        'email' => 'other@example.test',
        'password' => 'a-very-strong-password',
        'password_confirmation' => 'a-very-strong-password',
        'workspace_name' => 'Acme Realty',
    ]);

    $response->assertStatus(200);

    expect(Workspace::where('slug', 'acme-realty-1')->exists())->toBeTrue();

    // Both workspaces coexist, each with its own account for distinct emails.
    expect(Workspace::count())->toBeGreaterThanOrEqual(2);
});

it('allows the same email to register a second workspace', function () {
    ensureOwnerRole();

    foreach (['First Co', 'Second Co'] as $workspaceName) {
        $this->postJson('/api/v1/auth/register', [
            'name' => 'Multi Owner',
            'email' => 'multi@example.test',
            'password' => 'a-very-strong-password',
            'password_confirmation' => 'a-very-strong-password',
            'workspace_name' => $workspaceName,
        ])->assertStatus(200);
    }

    expect(User::where('email', 'multi@example.test')->count())->toBe(2);
});

it('rejects registration when validation fails', function () {
    ensureOwnerRole();

    $missing = $this->postJson('/api/v1/auth/register', [
        'name' => 'No Workspace',
        'email' => 'noworkspace@example.test',
        'password' => 'a-very-strong-password',
        'password_confirmation' => 'a-very-strong-password',
    ]);
    $missing->assertStatus(422)->assertJsonValidationErrors(['workspace_name']);

    $mismatch = $this->postJson('/api/v1/auth/register', [
        'name' => 'Bad Confirm',
        'email' => 'badconfirm@example.test',
        'password' => 'a-very-strong-password',
        'password_confirmation' => 'different-password',
        'workspace_name' => 'Mismatch Co',
    ]);
    $mismatch->assertStatus(422)->assertJsonValidationErrors(['password']);

    expect(User::where('email', 'noworkspace@example.test')->exists())->toBeFalse();
    expect(User::where('email', 'badconfirm@example.test')->exists())->toBeFalse();
});
