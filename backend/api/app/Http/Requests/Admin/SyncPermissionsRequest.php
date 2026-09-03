<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class SyncPermissionsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'permission_ids' => 'required|array',
            'permission_ids.*' => 'exists:permissions,id',
        ];
    }

    public function messages(): array
    {
        return [
            'permission_ids.required' => 'Permission list is required.',
            'permission_ids.array' => 'Permission list must be an array.',
            'permission_ids.*.exists' => 'One or more selected permissions are invalid.',
        ];
    }
}
