<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RegisterUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Normalize inputs once, before validation, so duplicates are detected
     * against the canonical form and stored values are consistent.
     */
    protected function prepareForValidation(): void
    {
        if ($this->has('email')) {
            $this->merge(['email' => strtolower(trim((string) $this->input('email')))]);
        }

        if ($this->has('username')) {
            $this->merge(['username' => strtolower(trim((string) $this->input('username')))]);
        }
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255'],
            // Onboarding Step 1 handle. Globally unique (across workspaces and
            // soft-deleted rows, so a restored invitation account can keep it).
            'username' => [
                'required',
                'string',
                'min:3',
                'max:30',
                'regex:/^[a-zA-Z0-9_]+$/',
                Rule::unique('users', 'username'),
            ],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'password_confirmation' => ['required', 'string'],
        ];
    }

    public function messages(): array
    {
        return [
            'password.min' => 'Password must be at least 8 characters.',
            'password.confirmed' => 'Passwords do not match.',
            'email.email' => 'Please enter a valid email address.',
            'username.required' => 'A username is required.',
            'username.regex' => 'Username may only contain letters, numbers and underscores.',
            'username.unique' => 'That username is already taken.',
            'username.min' => 'Username must be at least 3 characters.',
            'username.max' => 'Username may not be longer than 30 characters.',
        ];
    }
}