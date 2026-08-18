<?php

namespace App\Services;

use App\Models\Contact;
use App\Models\Deal;
use App\Models\User;

/**
 * Resolves {{variable}} placeholders inside saved message-template content at
 * send/preview time. Supported variables:
 *
 *   {{contact.first_name}}   {{contact.last_name}}   {{contact.full_name}}
 *   {{contact.company}}      {{contact.email}}       {{contact.phone}}
 *   {{agent.name}}           {{agent.first_name}}
 *   {{workspace.name}}       {{deal.name}}           {{deal.value}}
 *
 * Unknown variables are left as-is (the agent sees the placeholder rather than a
 * silently blanked value), and a null/empty source value resolves to an empty string.
 */
class MessageTemplateService
{
    public function resolve(
        string $content,
        User $agent,
        array $context = [],
        array $dealContext = [],
    ): string {
        $contact = null;
        if (! empty($context['contact_id'])) {
            $contact = Contact::query()->find($context['contact_id']);
        }

        $deal = null;
        if (! empty($dealContext['deal_id'])) {
            $deal = Deal::query()->find($dealContext['deal_id']);
        }

        $values = [
            'contact.first_name' => $contact ? $this->firstName($contact->full_name) : '',
            'contact.last_name' => $contact ? $this->lastName($contact->full_name) : '',
            'contact.full_name' => $contact?->full_name ?? '',
            'contact.company' => $contact?->company ?? '',
            'contact.email' => $contact?->email ?? '',
            'contact.phone' => $contact?->phone_number ?? '',
            'agent.name' => $agent->name ?? '',
            'agent.first_name' => $agent->name ? $this->firstName($agent->name) : '',
            'workspace.name' => $agent->workspace?->name ?? '',
            'deal.name' => $deal?->title ?? '',
            'deal.value' => $deal ? $this->formatMoney($deal->value_amount, $deal->value_currency) : '',
        ];

        return preg_replace_callback('/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/', function ($matches) use ($values) {
            $key = strtolower(trim($matches[1]));

            return array_key_exists($key, $values) ? $values[$key] : $matches[0];
        }, $content);
    }

    private function firstName(?string $fullName): string
    {
        if (! $fullName) {
            return '';
        }
        $parts = preg_split('/\s+/', trim($fullName));

        return $parts[0] ?? '';
    }

    private function lastName(?string $fullName): string
    {
        if (! $fullName) {
            return '';
        }
        $parts = preg_split('/\s+/', trim($fullName));

        return count($parts) > 1 ? implode(' ', array_slice($parts, 1)) : '';
    }

    private function formatMoney($amount, ?string $currency): string
    {
        if ($amount === null) {
            return '';
        }
        $symbol = match (strtoupper((string) $currency)) {
            'USD' => '$',
            'EUR' => '€',
            'GBP' => '£',
            'INR' => '₹',
            default => ($currency ? strtoupper((string) $currency).' ' : ''),
        };

        return $symbol.number_format((float) $amount, 2);
    }
}
