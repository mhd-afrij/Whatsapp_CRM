<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Deal;
use App\Models\Lead;
use App\Models\Task;
use Illuminate\Http\Request;

class SearchController extends Controller
{
    /** Categories this endpoint knows how to search, in display order. */
    private const CATEGORIES = ['contacts', 'conversations', 'leads', 'deals', 'tasks'];

    /**
     * GET /api/v1/search?q=...&category=&page=&per_page=
     *
     * Every allowed permission is authenticated-only (route middleware requires
     * `auth:sanctum`+`active`); `search.global` itself is granted to every seeded role (see
     * docs/07-permission-matrix.md), so the gate here is per-category: a category is included
     * in results only if the requesting user holds the permission that would let them view that
     * entity type normally (contacts.view / conversations.view / leads.manage / deals.manage /
     * tasks.manage-or-view_team). This keeps search permission-aware without inventing a new
     * blanket "can see everything" permission.
     *
     * Workspace isolation is automatic: every model queried here (Contact, Conversation, Lead,
     * Deal, Task, Message) uses the BelongsToWorkspace trait, which applies a global scope
     * filtering to the authenticated user's workspace_id on every query - no manual
     * workspace_id filtering is needed or done here.
     *
     * Matching strategy: MySQL FULLTEXT with MATCH AGAINST in Boolean mode when available,
     * falling back to LIKE '%term%' for SQLite or when FULLTEXT is not configured.
     */
    public function index(Request $request)
    {
        $user = $request->user();

        $q = trim((string) $request->string('q'));

        if ($q === '') {
            return $this->success(['query' => $q, 'categories' => []], 'OK');
        }

        $category = $request->string('category')->toString();
        $category = in_array($category, self::CATEGORIES, true) ? $category : null;

        $allowed = $this->allowedCategories($user);

        if ($category !== null && ! in_array($category, $allowed, true)) {
            return $this->error('You do not have permission to search this category.', null, 403);
        }

        if ($category !== null) {
            $perPage = min(max((int) $request->integer('per_page', 15), 1), 100);
            $paginator = $this->queryFor($category, $q)->paginate($perPage);

            return $this->success([
                'query' => $q,
                'category' => $category,
                'items' => $paginator->items(),
            ], 'OK', [
                'page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ]);
        }

        $categories = [];
        foreach (self::CATEGORIES as $cat) {
            if (! in_array($cat, $allowed, true)) {
                continue;
            }

            $query = $this->queryFor($cat, $q);
            $categories[$cat] = [
                'items' => (clone $query)->limit(5)->get()->values(),
                'total' => $query->count(),
            ];
        }

        return $this->success([
            'query' => $q,
            'categories' => $categories,
        ], 'OK');
    }

    /**
     * @return string[] category keys this user's permissions allow searching.
     */
    private function allowedCategories($user): array
    {
        $allowed = [];

        if ($user->hasPermission('contacts.view')) {
            $allowed[] = 'contacts';
        }
        if ($user->hasPermission('conversations.view')) {
            $allowed[] = 'conversations';
        }
        if ($user->hasPermission('leads.manage')) {
            $allowed[] = 'leads';
        }
        if ($user->hasPermission('deals.manage')) {
            $allowed[] = 'deals';
        }
        if ($user->hasAnyPermission(['tasks.manage', 'tasks.view_team'])) {
            $allowed[] = 'tasks';
        }

        return $allowed;
    }

    private function useFulltext(): bool
    {
        return config('database.default') === 'mysql';
    }

    private function fulltextQuery(string $term): string
    {
        // Boolean mode: support quoted phrases and +required/-excluded terms.
        // Replace spaces with wildcards for partial matching.
        $escaped = str_replace(['"', "'"], '', $term);

        return "+{$escaped}*";
    }

    private function queryFor(string $category, string $q)
    {
        $useFt = $this->useFulltext();

        return match ($category) {
            // Contacts use the model's search scope (LIKE + normalized-phone
            // matching, spec §14) on every driver rather than FULLTEXT: the
            // normalized-phone requirement can't be expressed with MATCH, and
            // InnoDB FULLTEXT cannot see rows inserted inside an uncommitted
            // transaction (which broke the insert-then-search tests).
            'contacts' => Contact::query()
                ->search($q)
                ->orderByDesc('id'),

            'conversations' => $useFt
                ? Conversation::query()
                    ->with(['contact', 'whatsappContact'])
                    ->where(function ($query) use ($q) {
                        $query->whereHas('contact', fn ($c) => $c->whereRaw('MATCH(full_name, email, company) AGAINST(? IN BOOLEAN MODE)', [$this->fulltextQuery($q)]))
                            ->orWhereHas('whatsappContact', fn ($c) => $c->where('push_name', 'like', "%{$q}%"))
                            ->orWhereHas('messages', fn ($m) => $m
                                ->whereNull('deleted_for_me_at')
                                ->whereRaw('MATCH(body) AGAINST(? IN BOOLEAN MODE)', [$this->fulltextQuery($q)]));
                    })
                    ->orderByDesc('last_message_at')
                : Conversation::query()
                    ->with(['contact', 'whatsappContact'])
                    ->where(function ($query) use ($q) {
                        $query->whereHas('contact', fn ($c) => $c->where('full_name', 'like', "%{$q}%"))
                            ->orWhereHas('whatsappContact', fn ($c) => $c->where('push_name', 'like', "%{$q}%"))
                            ->orWhereHas('messages', fn ($m) => $m
                                ->whereNull('deleted_for_me_at')
                                ->where('body', 'like', "%{$q}%"));
                    })
                    ->orderByDesc('last_message_at'),

            'leads' => Lead::query()
                ->with(['contact'])
                ->where(function ($query) use ($q) {
                    $query->whereHas('contact', fn ($c) => $c->where('full_name', 'like', "%{$q}%")
                        ->orWhere('email', 'like', "%{$q}%")
                        ->orWhere('phone_number', 'like', "%{$q}%"))
                        ->orWhere('stage', 'like', "%{$q}%");
                })
                ->orderByDesc('created_at'),

            'deals' => Deal::query()
                ->with(['contact'])
                ->where(function ($query) use ($q) {
                    $query->where('title', 'like', "%{$q}%")
                        ->orWhereHas('contact', fn ($c) => $c->where('full_name', 'like', "%{$q}%"));
                })
                ->orderByDesc('created_at'),

            'tasks' => Task::query()
                ->where(function ($query) use ($q) {
                    $query->where('title', 'like', "%{$q}%")
                        ->orWhere('description', 'like', "%{$q}%");
                })
                ->orderByDesc('created_at'),

            default => throw new \InvalidArgumentException("Unknown search category: {$category}"),
        };
    }
}
