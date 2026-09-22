<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Services\ReportService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Validator;

/**
 * Reports module - unified analytics overview for the Reports dashboard.
 *
 * GET /api/v1/reports/overview?range=7d|30d|90d|custom&from=&to=&agent_user_id=&whatsapp_account_id=&compare=&page=
 *
 * Gated on reports.view (see routes/api.php). One envelope backs every panel on the
 * Reports page (see ReportService::overview for the full schema). Agent/account
 * filtering and the agent-visibility claim are resolved inside ReportService, so a
 * viewer without reports.view_all_agents only ever receives their own slice.
 */
class ReportController extends Controller
{
    public function __construct(protected ReportService $reportService) {}

    public function overview(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'range' => 'sometimes|string|in:7d,30d,90d,custom',
            'from' => 'required_if:range,custom|nullable|date',
            'to' => 'required_if:range,custom|nullable|date|after_or_equal:from',
            'agent_user_id' => 'nullable|integer',
            'whatsapp_account_id' => 'nullable|integer',
            'compare' => 'sometimes|boolean',
            'page' => 'nullable|integer|min:1',
        ]);

        if ($validator->fails()) {
            return $this->error('The given data was invalid.', $validator->errors());
        }

        $filters = $validator->validated();
        $user = $request->user();

        $key = 'reports:overview:'.$user->workspace_id.':'.md5(json_encode($filters));

        $data = Cache::remember($key, 30, fn () => $this->reportService->overview($user, $filters));

        return $this->success($data, 'OK');
    }
}
