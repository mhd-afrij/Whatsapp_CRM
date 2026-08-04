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
     * Matching strategy: plain `LIKE '%term%'` against the existing btree-indexed name/email/
     * phone columns (and the gateway-owned `messages.body` column, read-only). A MySQL FULLTEXT
     * index would score better for the free-text `messages.body`/`contacts.full_name` matches,
     * but this pass does not add one: this repo has no confirmed local MySQL full-text
     * configuration (minimum word length, stopword list, ngram parser for non-space-delimited
     * content) to validate against, and shipping an unverified FULLTEXT migration would be
     * guessing rather than engineering. LIKE is slower on large tables (leading wildcard defeats
     * a btree index) but is correct and matches the rest of this codebase's existing `search`
     * filters (see ContactController::index). Revisit under docs/08-implementation-roadmap.md's
     * Phase 13 note about full-text/OpenSearch once there's a real data volume to benchmark.
     *
     * Two response shapes:
     *  - No `category` param: a "breakdown" - up to 5 results per category plus each category's
     *    total count, for an omnibar-style dropdown.
     *  - `category` param given: only that category, fully paginated (page/per_page/total/
     *    last_page in meta), for a "view all results in this category" page.
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

    private function queryFor(string $category, string $q)
    {
        return match ($category) {
            'contacts' => Contact::query()
                ->where(function ($query) use ($q) {
                    $query->where('full_name', 'like', "%{$q}%")
                        ->orWhere('email', 'like', "%{$q}%")
                        ->orWhere('phone_number', 'like', "%{$q}%")
                        ->orWhere('company', 'like', "%{$q}%");
                })
                ->orderByDesc('id'),

            'conversations' => Conversation::query()
                ->with(['contact', 'whatsappContact'])
                ->where(function ($query) use ($q) {
                    $query->whereHas('contact', fn ($c) => $c->where('full_name', 'like', "%{$q}%"))
                        ->orWhereHas('whatsappContact', fn ($c) => $c->where('push_name', 'like', "%{$q}%"))
                        ->orWhereHas('messages', fn ($m) => $m->where('body', 'like', "%{$q}%"));
                })
                ->orderByDesc('last_message_at'),

            'leads' => Lead::query()
                ->with(['contact'])
                ->where(function ($query) use ($q) {
                    $query->whereHas('contact', fn ($c) => $c->where('full_name', 'like', "%{$q}%")
                        ->orWhere('email', 'like', "%{$q}%")
                        ->orWhere('phone_number', 'like', "%{$q}%"))
                        ->orWhere('status', 'like', "%{$q}%");
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
