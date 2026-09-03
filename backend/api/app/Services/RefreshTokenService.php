<?php

namespace App\Services;

use App\Models\RefreshToken;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class RefreshTokenService
{
    private const TTL_DAYS = 30;

    public function __construct(private readonly Request $request) {}

    /**
     * Issue a brand new refresh-token family for a fresh login.
     *
     * @return array{token: string, model: RefreshToken}
     */
    public function issue(User $user): array
    {
        return $this->issueInFamily($user, (string) Str::uuid());
    }

    /**
     * Rotate an existing refresh token: the old one is marked revoked and a
     * new one is issued in the same family. If the presented token was
     * already revoked, that's reuse of a rotated-out token — a signal of
     * theft — so the entire family is revoked and rotation is refused.
     *
     * @throws RefreshTokenReuseException|RefreshTokenInvalidException
     */
    public function rotate(string $rawToken): array
    {
        $hash = $this->hash($rawToken);
        $existing = RefreshToken::where('token_hash', $hash)->first();

        if (! $existing) {
            throw new RefreshTokenInvalidException;
        }

        if ($existing->revoked_at !== null) {
            RefreshToken::where('family_id', $existing->family_id)
                ->whereNull('revoked_at')
                ->update(['revoked_at' => now()]);

            throw new RefreshTokenReuseException;
        }

        if ($existing->expires_at->isPast()) {
            throw new RefreshTokenInvalidException;
        }

        $existing->update(['revoked_at' => now()]);

        return $this->issueInFamily($existing->user, $existing->family_id);
    }

    public function revoke(string $rawToken): void
    {
        RefreshToken::where('token_hash', $this->hash($rawToken))
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);
    }

    public function revokeAllForUser(User $user): void
    {
        $user->refreshTokens()->whereNull('revoked_at')->update(['revoked_at' => now()]);
    }

    private function issueInFamily(User $user, string $familyId): array
    {
        $raw = Str::random(64);

        $model = $user->refreshTokens()->create([
            'token_hash' => $this->hash($raw),
            'family_id' => $familyId,
            'expires_at' => now()->addDays(self::TTL_DAYS),
            'ip_address' => $this->request->ip(),
            'user_agent' => $this->request->userAgent(),
        ]);

        return ['token' => $raw, 'model' => $model];
    }

    private function hash(string $raw): string
    {
        return hash('sha256', $raw);
    }
}
