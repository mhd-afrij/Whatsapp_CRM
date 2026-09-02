<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\WorkspaceSetting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Validator;

class AiAssistantController extends Controller
{
    public function settings(Request $request)
    {
        $settings = WorkspaceSetting::firstOrCreate(['workspace_id' => $request->user()->workspace_id]);
        return $this->success([
            'provider' => $settings->ai_provider,
            'model' => $settings->ai_model,
            'business_context' => $settings->ai_business_context,
            'enabled' => (bool) $settings->ai_enabled,
            'has_api_key' => filled($settings->ai_api_key),
        ], 'OK');
    }

    public function updateSettings(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'provider' => ['required', 'in:openai,anthropic'],
            'model' => ['required', 'string', 'max:120'],
            'api_key' => ['nullable', 'string', 'max:500'],
            'business_context' => ['nullable', 'string', 'max:10000'],
            'enabled' => ['sometimes', 'boolean'],
        ]);
        if ($validator->fails()) return $this->error('Validation failed', $validator->errors(), 422);
        $data = $validator->validated();
        $settings = WorkspaceSetting::firstOrCreate(['workspace_id' => $request->user()->workspace_id]);
        $settings->fill([
            'ai_provider' => $data['provider'],
            'ai_model' => $data['model'],
            'ai_business_context' => $data['business_context'] ?? null,
            'ai_enabled' => $data['enabled'] ?? false,
        ]);
        if (filled($data['api_key'] ?? null)) $settings->ai_api_key = $data['api_key'];
        $settings->save();
        return $this->settings($request);
    }

    public function draft(Request $request, Conversation $conversation)
    {
        $this->authorize('view', $conversation);
        $settings = WorkspaceSetting::query()->where('workspace_id', $request->user()->workspace_id)->first();
        if (! $settings?->ai_enabled || blank($settings->ai_api_key)) {
            return $this->error('AI assistant is not configured.', null, 422);
        }
        $messages = $conversation->messages()->latest('created_at')->limit(20)->get()->reverse()->map(fn ($m) => [
            'role' => $m->direction === 'inbound' ? 'user' : 'assistant',
            'content' => (string) ($m->body ?? ''),
        ])->values()->all();
        $system = trim('Draft concise, helpful WhatsApp replies. Never claim an action was taken. Ask for a human handoff when uncertain. '.$settings->ai_business_context);
        $response = $settings->ai_provider === 'anthropic'
            ? Http::withHeaders([
                'x-api-key' => $settings->ai_api_key,
                'anthropic-version' => '2023-06-01',
            ])->timeout(30)->post('https://api.anthropic.com/v1/messages', ['model' => $settings->ai_model, 'max_tokens' => 500, 'system' => $system, 'messages' => $messages])
            : Http::withToken($settings->ai_api_key)->timeout(30)->post('https://api.openai.com/v1/chat/completions', ['model' => $settings->ai_model, 'temperature' => 0.4, 'max_tokens' => 500, 'messages' => [['role' => 'system', 'content' => $system], ...$messages]]);
        if ($response->failed()) return $this->failure('The AI provider rejected the request.', 'ai_provider_error', 502);
        $draft = $settings->ai_provider === 'anthropic' ? $response->json('content.0.text') : $response->json('choices.0.message.content');
        return $this->success(['draft' => trim((string) $draft)], 'Draft generated');
    }

    public function test(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'provider' => ['required', 'in:openai,anthropic'],
            'model' => ['required', 'string'],
            'api_key' => ['required', 'string'],
        ]);
        if ($validator->fails()) return $this->error('Validation failed', $validator->errors(), 422);

        $data = $validator->validated();
        $response = $data['provider'] === 'anthropic'
            ? Http::withHeaders([
                'x-api-key' => $data['api_key'],
                'anthropic-version' => '2023-06-01',
            ])->timeout(15)->post('https://api.anthropic.com/v1/messages', [
                'model' => $data['model'],
                'max_tokens' => 10,
                'messages' => [['role' => 'user', 'content' => 'OK']],
            ])
            : Http::withToken($data['api_key'])->timeout(15)->post('https://api.openai.com/v1/chat/completions', [
                'model' => $data['model'],
                'messages' => [['role' => 'user', 'content' => 'OK']],
                'max_tokens' => 10,
            ]);

        if ($response->failed()) {
            $status = $response->status();
            $body = $response->json();
            $detail = $body['error']['message'] ?? $body['message'] ?? "HTTP {$status}";
            return $this->error('API key validation failed: '.$detail, null, 422);
        }

        return $this->success(['valid' => true], 'API key is valid');
    }
}
