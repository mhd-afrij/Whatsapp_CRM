<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $userId = $this->route('id');

        return [
            'name' => 'sometimes|string|max:255',
            'email' => [
                'sometimes',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($userId),
            ],
            'role_ids' => 'sometimes|array',
            'role_ids.*' => 'exists:roles,id',
        ];
    }

    public function messages(): array
    {
        return [
            'name.max' => 'Name may not exceed 255 characters.',
            'email.email' => 'Please provide a valid email address.',
            'email.unique' => 'A user with this email already exists.',
            'role_ids.*.exists' => 'One or more selected roles are invalid.',
        ];
    }
}
