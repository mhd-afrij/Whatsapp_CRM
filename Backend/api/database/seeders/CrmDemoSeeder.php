<?php

namespace Database\Seeders;

use App\Models\CalendarEvent;
use App\Models\Customer;
use App\Models\Lead;
use App\Models\Task;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Database\Seeder;

class CrmDemoSeeder extends Seeder
{
    public function run(): void
    {
        $workspace = Workspace::where('slug', 'demo')->first();
        if (! $workspace) {
            return;
        }

        $owner = User::where('workspace_id', $workspace->id)->where('email', 'owner@demo.test')->first();
        $lead = User::where('workspace_id', $workspace->id)->where('email', 'lead@demo.test')->first();
        $agent = User::where('workspace_id', $workspace->id)->where('email', 'agent@demo.test')->first();

        Customer::upsert([
            [
                'workspace_id' => $workspace->id,
                'name' => 'Priya Sharma',
                'phone' => '+91 98765 43210',
                'email' => 'priya@acme.io',
                'company' => 'Acme Retail',
                'stage' => 'negotiation',
                'agent_name' => $agent?->name,
                'last_contact_at' => now()->subHours(2),
            ],
            [
                'workspace_id' => $workspace->id,
                'name' => 'Marcus Chen',
                'phone' => '+1 415 555 0142',
                'email' => 'marcus@chenlabs.com',
                'company' => 'Chen Labs',
                'stage' => 'qualified',
                'agent_name' => $lead?->name,
                'last_contact_at' => now()->subDay(),
            ],
        ], ['workspace_id', 'email'], ['phone', 'company', 'stage', 'agent_name', 'last_contact_at']);

        Lead::upsert([
            [
                'workspace_id' => $workspace->id,
                'title' => 'Retail POS rollout',
                'customer_name' => 'Priya Sharma',
                'value' => '$12,400',
                'stage' => 'negotiation',
                'agent_name' => $agent?->name,
                'expected_close_date' => now()->addWeeks(2)->toDateString(),
            ],
            [
                'workspace_id' => $workspace->id,
                'title' => 'Consulting retainer',
                'customer_name' => 'Marcus Chen',
                'value' => '$6,000',
                'stage' => 'qualified',
                'agent_name' => $lead?->name,
                'expected_close_date' => now()->addWeeks(1)->toDateString(),
            ],
        ], ['workspace_id', 'title'], ['customer_name', 'value', 'stage', 'agent_name', 'expected_close_date']);

        Task::upsert([
            [
                'workspace_id' => $workspace->id,
                'assignee_id' => $agent?->id,
                'title' => 'Send updated proposal to Priya',
                'due_at' => now()->addHours(4),
                'priority' => 'high',
                'status' => 'open',
            ],
            [
                'workspace_id' => $workspace->id,
                'assignee_id' => $owner?->id,
                'title' => 'Review Chen Labs contract',
                'due_at' => now()->addDay(),
                'priority' => 'normal',
                'status' => 'open',
            ],
        ], ['workspace_id', 'title'], ['assignee_id', 'due_at', 'priority', 'status']);

        CalendarEvent::upsert([
            [
                'workspace_id' => $workspace->id,
                'title' => 'Demo call - Chen Labs',
                'starts_at' => now()->addDays(2)->setTime(10, 0),
                'ends_at' => now()->addDays(2)->setTime(10, 30),
                'location' => 'Google Meet',
                'kind' => 'demo',
            ],
            [
                'workspace_id' => $workspace->id,
                'title' => 'Proposal review - Acme Retail',
                'starts_at' => now()->addDays(4)->setTime(14, 0),
                'ends_at' => now()->addDays(4)->setTime(14, 30),
                'location' => 'Office',
                'kind' => 'follow_up',
            ],
        ], ['workspace_id', 'title'], ['starts_at', 'ends_at', 'location', 'kind']);
    }
}
