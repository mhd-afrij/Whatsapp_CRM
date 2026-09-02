<?php

namespace App\Providers;

use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Deal;
use App\Models\Invitation;
use App\Models\Label;
use App\Models\Lead;
use App\Models\Role;
use App\Models\Task;
use App\Models\Team;
use App\Models\User;
use App\Policies\ContactPolicy;
use App\Policies\ConversationPolicy;
use App\Policies\DealPolicy;
use App\Policies\InvitationPolicy;
use App\Policies\LabelPolicy;
use App\Policies\LeadPolicy;
use App\Policies\RolePolicy;
use App\Policies\TaskPolicy;
use App\Policies\TeamPolicy;
use App\Policies\UserPolicy;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Gate::policy(Conversation::class, ConversationPolicy::class);
        Gate::policy(Contact::class, ContactPolicy::class);
        Gate::policy(Deal::class, DealPolicy::class);
        Gate::policy(Task::class, TaskPolicy::class);
        Gate::policy(User::class, UserPolicy::class);
        Gate::policy(Label::class, LabelPolicy::class);
        Gate::policy(Lead::class, LeadPolicy::class);
        Gate::policy(Team::class, TeamPolicy::class);
        Gate::policy(Role::class, RolePolicy::class);
        Gate::policy(Invitation::class, InvitationPolicy::class);

        // Super admins bypass every policy check.
        Gate::before(function (User $user, string $ability) {
            return $user->isSuperAdmin() ? true : null;
        });

        RateLimiter::for('login', function (Request $request) {
            return Limit::perMinute(5)->by(strtolower((string) $request->input('email')).'|'.$request->ip());
        });

        // Password reset request/confirm and invitation acceptance are unauthenticated,
        // abuse-prone endpoints (email enumeration, token brute-forcing) - throttle by the
        // submitted identifier plus IP, same pattern as the login limiter above.
        RateLimiter::for('password-reset', function (Request $request) {
            return Limit::perMinute(5)->by(strtolower((string) $request->input('email')).'|'.$request->ip());
        });

        RateLimiter::for('invitation-accept', function (Request $request) {
            return Limit::perMinute(10)->by((string) $request->input('token').'|'.$request->ip());
        });

        // Invitation creation is authenticated but still abuse-prone (mass-inviting /
        // spamming outbound email) - throttle per acting user.
        RateLimiter::for('invitation-create', function (Request $request) {
            return Limit::perMinute(10)->by(optional($request->user())->id ?: $request->ip());
        });

        RateLimiter::for('search', function (Request $request) {
            return Limit::perMinute(60)->by(optional($request->user())->id ?: $request->ip());
        });

        // Report/contact exports are expensive (DB + file generation) - keep them rare per user.
        RateLimiter::for('export', function (Request $request) {
            return Limit::perMinute(10)->by(optional($request->user())->id ?: $request->ip());
        });

        // AI draft generation hits external provider APIs - throttle per user to protect BYO keys.
        RateLimiter::for('ai-draft', function (Request $request) {
            return Limit::perMinute(15)->by(optional($request->user())->id ?: $request->ip());
        });
    }
}
