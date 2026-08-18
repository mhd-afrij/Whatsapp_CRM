<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\MessageTemplate;
use App\Services\MessageTemplateService;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class MessageTemplateController extends Controller
{
    public function __construct(private readonly MessageTemplateService $templateService) {}

    /**
     * GET /api/v1/message-templates
     * List workspace templates. Filters: category, is_active, search (name/shortcut/content).
     */
    public function index(Request $request)
    {
        $this->authorize('viewAny', MessageTemplate::class);

        $query = MessageTemplate::query();

        if ($request->filled('category')) {
            $query->where('category', $request->string('category'));
        }
        if ($request->filled('is_active')) {
            $query->where('is_active', $request->boolean('is_active'));
        }
        if ($request->filled('search')) {
            $search = $request->string('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('shortcut', 'like', "%{$search}%")
                    ->orWhere('content', 'like', "%{$search}%");
            });
        }

        $perPage = min(max((int) $request->integer('per_page', 50), 1), 100);
        $templates = $query->orderBy('name')->paginate($perPage);

        return $this->success($templates->items(), 'OK', [
            'page' => $templates->currentPage(),
            'per_page' => $templates->perPage(),
            'total' => $templates->total(),
            'last_page' => $templates->lastPage(),
        ]);
    }

    /**
     * POST /api/v1/message-templates
     */
    public function store(Request $request)
    {
        $this->authorize('create', MessageTemplate::class);

        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'max:120'],
            'shortcut' => ['nullable', 'string', 'max:40', Rule::unique('message_templates', 'shortcut')->where('workspace_id', $request->user()->workspace_id)],
            'content' => ['required', 'string', 'max:4096'],
            'category' => ['nullable', 'string', 'max:60'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if ($validator->fails()) {
            return $this->error('Validation failed', $validator->errors(), 422);
        }

        $template = MessageTemplate::create([
            ...$validator->validated(),
            'workspace_id' => $request->user()->workspace_id,
            'created_by' => $request->user()->id,
            'updated_by' => $request->user()->id,
        ]);

        AuditLogger::log('template.created', $request->user(), $template, $validator->validated());

        return $this->success($template, 'Template created', null, 201);
    }

    /**
     * GET /api/v1/message-templates/{id}
     */
    public function show(Request $request, MessageTemplate $template)
    {
        $this->authorize('view', $template);

        return $this->success($template, 'OK');
    }

    /**
     * PATCH /api/v1/message-templates/{id}
     */
    public function update(Request $request, MessageTemplate $template)
    {
        $this->authorize('update', $template);

        $validator = Validator::make($request->all(), [
            'name' => ['sometimes', 'string', 'max:120'],
            'shortcut' => ['nullable', 'string', 'max:40', Rule::unique('message_templates', 'shortcut')->where('workspace_id', $template->workspace_id)->ignore($template->id)],
            'content' => ['sometimes', 'string', 'max:4096'],
            'category' => ['nullable', 'string', 'max:60'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if ($validator->fails()) {
            return $this->error('Validation failed', $validator->errors(), 422);
        }

        $data = $validator->validated();
        $before = $template->only(array_keys($data));
        $template->update([...$data, 'updated_by' => $request->user()->id]);

        AuditLogger::log('template.updated', $request->user(), $template, $data, $request, $before);

        return $this->success($template->fresh(), 'Template updated');
    }

    /**
     * DELETE /api/v1/message-templates/{id}
     */
    public function destroy(Request $request, MessageTemplate $template)
    {
        $this->authorize('delete', $template);

        AuditLogger::log('template.deleted', $request->user(), $template);
        $template->delete();

        return $this->success(null, 'Template deleted');
    }

    /**
     * POST /api/v1/message-templates/preview
     * Resolves {{variable}} placeholders in a template against an optional
     * linked contact/deal so an agent can preview the final text before sending.
     */
    public function preview(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'content' => ['required', 'string', 'max:4096'],
            'contact_id' => ['nullable', 'integer', 'exists:contacts,id'],
            'deal_id' => ['nullable', 'integer', 'exists:deals,id'],
        ]);

        if ($validator->fails()) {
            return $this->error('Validation failed', $validator->errors(), 422);
        }

        $resolved = $this->templateService->resolve(
            $validator->validated()['content'],
            $request->user(),
            $request->input('contact_id') ? ['contact_id' => $request->input('contact_id')] : [],
            $request->input('deal_id') ? ['deal_id' => $request->input('deal_id')] : [],
        );

        return $this->success(['resolvedContent' => $resolved, 'body' => $resolved], 'OK');
    }
}
