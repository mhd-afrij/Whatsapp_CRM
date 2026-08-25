<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\SlaConfig;
use App\Services\SlaService;
use App\Support\AuditLogger;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class SlaController extends Controller
{
    use ApiResponse;

    public function __construct(private readonly SlaService $slaService) {}

    /**
     * GET /api/v1/sla/configs
     */
    public function index(Request $request)
    {
        $this->authorize('viewAny', SlaConfig::class);

        $configs = SlaConfig::query()
            ->where('workspace_id', $request->user()->workspace_id)
            ->get();

        return $this->success($configs, 'OK');
    }

    /**
     * POST /api/v1/sla/configs
     */
    public function store(Request $request)
    {
        $this->authorize('create', SlaConfig::class);

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:120',
            'first_response_minutes' => 'required|integer|min:1',
            'followup_response_minutes' => 'required|integer|min:1',
        ]);

        if ($validator->fails()) {
            return $this->error('Validation failed', $validator->errors(), 422);
        }

        $config = SlaConfig::create([
            ...$validator->validated(),
            'workspace_id' => $request->user()->workspace_id,
        ]);

        AuditLogger::log('sla_config.created', $request->user(), $config, $validator->validated());

        return $this->success($config, 'SLA config created', null, 201);
    }

    /**
     * PATCH /api/v1/sla/configs/{id}
     */
    public function update(Request $request, SlaConfig $slaConfig)
    {
        $this->authorize('update', $slaConfig);

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|string|max:120',
            'first_response_minutes' => 'sometimes|integer|min:1',
            'followup_response_minutes' => 'sometimes|integer|min:1',
            'is_active' => 'sometimes|boolean',
        ]);

        if ($validator->fails()) {
            return $this->error('Validation failed', $validator->errors(), 422);
        }

        $slaConfig->update($validator->validated());

        AuditLogger::log('sla_config.updated', $request->user(), $slaConfig, $validator->validated());

        return $this->success($slaConfig->fresh(), 'SLA config updated');
    }

    /**
     * DELETE /api/v1/sla/configs/{id}
     */
    public function destroy(Request $request, SlaConfig $slaConfig)
    {
        $this->authorize('delete', $slaConfig);

        AuditLogger::log('sla_config.deleted', $request->user(), $slaConfig);
        $slaConfig->delete();

        return $this->success(null, 'SLA config deleted');
    }

    /**
     * GET /api/v1/conversations/{conversation}/sla
     * Get SLA status for a conversation.
     */
    public function getStatus(Request $request, Conversation $conversation)
    {
        $this->authorize('view', $conversation);

        $status = $this->slaService->getSlaStatus($conversation->id);

        return $this->success($status, 'OK');
    }
}
