<?php

use App\Models\RefreshToken;
use App\Models\Role;
use App\Models\User;
use App\Models\Workspace;
use App\Notifications\ResetPasswordNotification;
use Illuminate\Support\Facades\Notification;

function makeUserWithRole(string $roleSlug = 'agent', array $userAttributes = []): array
{
    $workspace = Workspace::factory()->create();

    $role = Role::firstOrCreate(
        ['workspace_id' => null, 'slug' => $roleSlug],
        ['name' => ucfirst($roleSlug), 'is_system_role' => true],
    );

    $user = User::factory()->create(array_merge([
        'workspace_id' => $workspace->id,
        'password' => 'a-very-strong-password',
    ], $userAttributes));

    $user->roles()->sync([$role->id]);

    return [$workspace, $user];
}

it('logs in with valid credentials and returns access + refresh tokens', function () {
    [$workspace, $user] = makeUserWithRole();

    $response = $this->postJson('/api/v1/auth/login', [
        'workspace' => $workspace->slug,
        'email' => $user->email,
        'password' => 'a-very-strong-password',
    ]);

    $response->assertStatus(200)
        ->assertJsonStructure([
            'data' => ['access_token', 'refresh_token', 'token_type', 'expires_in', 'user' => ['id', 'email']],
        ]);

    expect(RefreshToken::where('user_id', $user->id)->count())->toBe(1);
});

it('rejects invalid credentials', function () {
    [$workspace, $user] = makeUserWithRole();

    $response = $this->postJson('/api/v1/auth/login', [
        'workspace' => $workspace->slug,
        'email' => $user->email,
        'password' => 'wrong-password',
    ]);

    $response->assertStatus(401)->assertJson(['code' => 'INVALID_CREDENTIALS']);
});

it('rejects login for a suspended account', function () {
    [$workspace, $user] = makeUserWithRole(userAttributes: ['status' => 'suspended']);

    $response = $this->postJson('/api/v1/auth/login', [
        'workspace' => $workspace->slug,
        'email' => $user->email,
        'password' => 'a-very-strong-password',
    ]);

    $response->assertStatus(403)->assertJson(['code' => 'ACCOUNT_SUSPENDED']);
});

it('rotates a refresh token and invalidates the old one', function () {
    [$workspace, $user] = makeUserWithRole();

    $login = $this->postJson('/api/v1/auth/login', [
        'workspace' => $workspace->slug,
        'email' => $user->email,
        'password' => 'a-very-strong-password',
    ])->json('data');

    $refreshed = $this->postJson('/api/v1/auth/refresh', [
        'refresh_token' => $login['refresh_token'],
    ]);

    $refreshed->assertStatus(200);
    expect($refreshed->json('data.refresh_token'))->not->toBe($login['refresh_token']);

    // Reusing the original (now-rotated-out) token must fail and revoke the family.
    $reuse = $this->postJson('/api/v1/auth/refresh', [
        'refresh_token' => $login['refresh_token'],
    ]);

    $reuse->assertStatus(401)->assertJson(['code' => 'REFRESH_TOKEN_REUSE_DETECTED']);

    // The rotated (currently valid) token should now also be revoked as a precaution.
    $secondUse = $this->postJson('/api/v1/auth/refresh', [
        'refresh_token' => $refreshed->json('data.refresh_token'),
    ]);

    $secondUse->assertStatus(401);
});

it('returns the authenticated user with roles and permissions on /auth/me', function () {
    [$workspace, $user] = makeUserWithRole('team_lead');

    $login = $this->postJson('/api/v1/auth/login', [
        'workspace' => $workspace->slug,
        'email' => $user->email,
        'password' => 'a-very-strong-password',
    ])->json('data');

    $me = $this->withHeader('Authorization', 'Bearer '.$login['access_token'])
        ->getJson('/api/v1/auth/me');

    $me->assertStatus(200)
        ->assertJsonPath('data.email', $user->email)
        ->assertJsonPath('data.roles.0', 'team_lead');
});

it('rejects unauthenticated access to /auth/me', function () {
    $this->getJson('/api/v1/auth/me')->assertStatus(401);
});

it('logs out and revokes the access token', function () {
    [$workspace, $user] = makeUserWithRole();

    $login = $this->postJson('/api/v1/auth/login', [
        'workspace' => $workspace->slug,
        'email' => $user->email,
        'password' => 'a-very-strong-password',
    ])->json('data');

    $this->withHeader('Authorization', 'Bearer '.$login['access_token'])
        ->postJson('/api/v1/auth/logout', ['refresh_token' => $login['refresh_token']])
        ->assertStatus(200);

    // Sanctum's RequestGuard memoizes the resolved user for the lifetime of
    // the guard instance, which the test container keeps alive across
    // requests within a single test — force re-resolution so this assertion
    // reflects a real subsequent request, not a cached auth() call.
    $this->app['auth']->forgetGuards();

    $this->withHeader('Authorization', 'Bearer '.$login['access_token'])
        ->getJson('/api/v1/auth/me')
        ->assertStatus(401);
});

it('sends a password reset notification without leaking account existence', function () {
    Notification::fake();
    [$workspace, $user] = makeUserWithRole();

    $existing = $this->postJson('/api/v1/auth/password/forgot', [
        'workspace' => $workspace->slug,
        'email' => $user->email,
    ]);
    $existing->assertStatus(200);

    $nonExistent = $this->postJson('/api/v1/auth/password/forgot', [
        'workspace' => $workspace->slug,
        'email' => 'nobody@demo.test',
    ]);
    $nonExistent->assertStatus(200);

    expect($existing->json('message'))->toBe($nonExistent->json('message'));
    Notification::assertSentTo($user, ResetPasswordNotification::class);
});
