<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Label;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class LabelController extends Controller
{
    /**
     * GET /api/v1/labels
     * Open to any authenticated workspace user (needed to render filter chips / assign
     * controls) - only create/update/delete are gated on labels.manage.
     */
    public function index(Request $request)
    {
        $this->authorize('viewAny', Label::class);

        $labels = Label::query()->orderBy('name')->get();

        return $this->success($labels, 'OK');
    }

    /**
     * POST /api/v1/labels
     */
    public function store(Request $request)
    {
        $this->authorize('create', Label::class);

        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'max:100', Rule::unique('labels', 'name')->where('workspace_id', $request->user()->workspace_id)],
            'color_hex' => ['required', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]);

        if ($validator->fails()) {
            return $this->error('Validation failed', $validator->errors(), 422);
        }

        $label = Label::create($validator->validated());

        AuditLogger::log('label.created', $request->user(), $label, $validator->validated());

        return $this->success($label, 'Label created', null, 201);
    }

    /**
     * PATCH /api/v1/labels/{id}
     */
    public function update(Request $request, Label $label)
    {
        $this->authorize('update', $label);

        $validator = Validator::make($request->all(), [
            'name' => ['sometimes', 'string', 'max:100', Rule::unique('labels', 'name')->where('workspace_id', $label->workspace_id)->ignore($label->id)],
            'color_hex' => ['sometimes', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]);

        if ($validator->fails()) {
            return $this->error('Validation failed', $validator->errors(), 422);
        }

        $data = $validator->validated();
        $before = $label->only(array_keys($data));
        $label->update($data);

        AuditLogger::log('label.updated', $request->user(), $label, $data, $request, $before);

        return $this->success($label->fresh(), 'Label updated');
    }

    /**
     * DELETE /api/v1/labels/{id}
     *
     * The label_id column on every contact_label/conversation_label/lead_label/deal_label
     * pivot table is declared with ->cascadeOnDelete() (see
     * database/migrations/2026_07_31_080039_create_label_pivot_tables.php), so the database
     * itself removes every pivot row referencing this label as part of the same delete - no
     * orphaned rows, no need to manually detach from each relation first.
     */
    public function destroy(Request $request, Label $label)
    {
        $this->authorize('delete', $label);

        AuditLogger::log('label.deleted', $request->user(), $label);

        $label->delete();

        return $this->success(null, 'Label deleted');
    }
}
