<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\AutomationRule;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class AutomationRuleController extends Controller
{
    public function index()
    {
        return $this->success(AutomationRule::query()->latest()->get(), 'OK');
    }

    public function store(Request $request)
    {
        $data = $this->validateRule($request);
        $rule = AutomationRule::create([...$data, 'workspace_id' => $request->user()->workspace_id]);
        AuditLogger::log('automation_rule.created', $request->user(), $rule, $data);
        return $this->success($rule, 'Automation rule created', null, 201);
    }

    public function update(Request $request, AutomationRule $automationRule)
    {
        $data = $this->validateRule($request, true);
        $automationRule->update($data);
        AuditLogger::log('automation_rule.updated', $request->user(), $automationRule, $data);
        return $this->success($automationRule->fresh(), 'Automation rule updated');
    }

    public function destroy(Request $request, AutomationRule $automationRule)
    {
        AuditLogger::log('automation_rule.deleted', $request->user(), $automationRule);
        $automationRule->delete();
        return $this->success(null, 'Automation rule deleted');
    }

    private function validateRule(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';
        $validator = Validator::make($request->all(), [
            'name' => [$required, 'string', 'max:120'],
            'trigger_type' => [$required, Rule::in(['keyword', 'new_contact', 'inbound_message'])],
            'trigger_value' => ['nullable', 'string', 'max:255'],
            'actions' => [$required, 'array', 'max:10'],
            'actions.*.type' => ['required', Rule::in(['add_label', 'create_task', 'send_reply'])],
            'actions.*.value' => ['nullable', 'string', 'max:4096'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
        if ($validator->fails()) {
            abort(response()->json(['success' => false, 'message' => 'Validation failed', 'errors' => $validator->errors()], 422));
        }
        return $validator->validated();
    }
}