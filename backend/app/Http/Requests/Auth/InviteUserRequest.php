<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class InviteUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'email' => [
                'required', 'string', 'email',
                Rule::unique('users', 'email')->where('workspace_id', $this->user()?->workspace_id),
                Rule::unique('invitations', 'email')
                    ->where('workspace_id', $this->user()?->workspace_id)
                    ->where('status', 'pending'),
            ],
            'role_id' => [
                'required', 'integer',
                Rule::exists('roles', 'id')->where('workspace_id', $this->user()?->workspace_id),
            ],
            'first_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'last_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'message' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'send_email' => ['sometimes', 'boolean'],
        ];
    }
}
