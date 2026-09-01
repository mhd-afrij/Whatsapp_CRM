<?php

use App\Models\Role;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind a different classes or traits.
|
*/

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

/*
|--------------------------------------------------------------------------
| Expectations
|--------------------------------------------------------------------------
|
| When you're writing tests, you often need to check that values meet certain conditions. The
| "expect()" function gives you access to a set of "expectations" methods that you can use
| to assert different things. Of course, you may extend the Expectation API at any time.
|
*/

expect()->extend('toBeOne', function () {
    return $this->toBe(1);
});

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| While Pest is very powerful out-of-the-box, you may have some testing code specific to your
| project that you don't want to repeat in every file. Here you can also expose helpers as
| global functions to help you to reduce the number of lines of code in your test files.
|
*/

/**
 * Creates a workspace + user assigned the given system role slug
 * (creating the role if the seeders haven't run in this test).
 *
 * @return array{0: Workspace, 1: User}
 */
function userWithRole(string $roleSlug = 'agent', array $userAttributes = []): array
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

/**
 * Logs in via the real /auth/login endpoint and returns the access token.
 */
function loginAs(User $user, Workspace $workspace, string $password = 'a-very-strong-password'): string
{
    $response = test()->postJson('/api/v1/auth/login', [
        'workspace' => $workspace->slug,
        'email' => $user->email,
        'password' => $password,
    ]);

    return $response->json('data.access_token');
}
