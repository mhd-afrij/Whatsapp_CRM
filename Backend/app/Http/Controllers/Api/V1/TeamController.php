<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Team;
use App\Models\User;
use App\Support\AuditLogger;
use App\Traits\ApiResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class TeamController extends Controller
{
    use ApiResponse;

    public function index(Request $request)
    {
        $this->authorize('viewAny', Team::class);

        $teams = Team::with('users')->orderBy('name')->get();

        return $this->success($teams->map(fn (Team $t) => $this->payload($t)), 'OK');
    }

    public function store(Request $request)
    {
        $this->authorize('create', Team::class);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:150', Rule::unique('teams', 'name')->where('workspace_id', $request->user()->workspace_id)],
            'description' => ['nullable', 'string'],
        ]);

        $team = Team::create($data);

        AuditLogger::log('team.created', $request->user(), $team, $data, $request);

        return $this->success($this->payload($team->fresh('users')), 'Team created successfully.', null, 201);
    }

    public function show(Request $request, Team $team)
    {
        $this->authorize('view', $team);

        return $this->success($this->payload($team->load('users')), 'OK');
    }

    public function update(Request $request, Team $team)
    {
        $this->authorize('update', $team);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:150', Rule::unique('teams', 'name')->where('workspace_id', $team->workspace_id)->ignore($team->id)],
            'description' => ['nullable', 'string'],
        ]);

        $before = $team->only(array_keys($data));

        $team->fill($data)->save();

        AuditLogger::log('team.updated', $request->user(), $team, $data, $request, $before);

        return $this->success($this->payload($team->fresh('users')), 'Team updated successfully.');
    }

    public function destroy(Request $request, Team $team)
    {
        $this->authorize('delete', $team);

        $team->delete();

        AuditLogger::log('team.deleted', $request->user(), $team, [], $request);

        return $this->success(null, 'Team deleted successfully.');
    }

    public function addMember(Request $request, Team $team)
    {
        $this->authorize('manageMembers', $team);

        $data = $request->validate([
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')->where('workspace_id', $team->workspace_id)],
            'is_lead' => ['sometimes', 'boolean'],
        ]);

        $team->users()->syncWithoutDetaching([
            $data['user_id'] => ['is_lead' => $data['is_lead'] ?? false, 'created_at' => now()],
        ]);

        AuditLogger::log('team.member_added', $request->user(), $team, $data, $request);

        return $this->success($this->payload($team->fresh('users')), 'Member added successfully.');
    }

    public function removeMember(Request $request, Team $team, User $user)
    {
        $this->authorize('manageMembers', $team);

        $team->users()->detach($user->id);

        AuditLogger::log('team.member_removed', $request->user(), $team, ['user_id' => $user->id], $request);

        return $this->success($this->payload($team->fresh('users')), 'Member removed successfully.');
    }

    protected function payload(Team $team): array
    {
        return [
            'id' => $team->id,
            'name' => $team->name,
            'description' => $team->description,
            'members' => $team->users->map(fn (User $u) => [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'is_lead' => (bool) $u->pivot->is_lead,
            ]),
            'created_at' => $team->created_at,
        ];
    }
}
