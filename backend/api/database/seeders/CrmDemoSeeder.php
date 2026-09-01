<?php

namespace Database\Seeders;

use App\Models\CalendarEvent;
use App\Models\Customer;
use App\Models\CrmNotification;
use App\Models\Lead;
use App\Models\Note;
use App\Models\PipelineStage;
use App\Models\SystemSetting;
use App\Models\Task;
use App\Models\User;
use App\Models\Workspace;
use App\Models\AuditLog;
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

        PipelineStage::upsert([
            ['workspace_id' => $workspace->id, 'name' => 'New', 'slug' => 'new', 'position' => 1, 'color' => '#64748b'],
            ['workspace_id' => $workspace->id, 'name' => 'Qualified', 'slug' => 'qualified', 'position' => 2, 'color' => '#2563eb'],
            ['workspace_id' => $workspace->id, 'name' => 'Proposal', 'slug' => 'proposal', 'position' => 3, 'color' => '#7c3aed'],
            ['workspace_id' => $workspace->id, 'name' => 'Negotiation', 'slug' => 'negotiation', 'position' => 4, 'color' => '#f59e0b'],
            ['workspace_id' => $workspace->id, 'name' => 'Won', 'slug' => 'won', 'position' => 5, 'color' => '#22c55e'],
            ['workspace_id' => $workspace->id, 'name' => 'Lost', 'slug' => 'lost', 'position' => 6, 'color' => '#ef4444'],
        ], ['workspace_id', 'slug'], ['name', 'position', 'color']);

        SystemSetting::setForWorkspace($workspace->id, 'company.name', 'Demo Workspace');
        SystemSetting::setForWorkspace($workspace->id, 'company.timezone', 'UTC');
        SystemSetting::setForWorkspace($workspace->id, 'company.file_limit_mb', 25);
        SystemSetting::setForWorkspace($workspace->id, 'session.timeout_minutes', 60);
        SystemSetting::setForWorkspace($workspace->id, 'notifications.email_enabled', true);
        SystemSetting::setForWorkspace($workspace->id, 'notifications.whatsapp_enabled', true);
        SystemSetting::setForWorkspace($workspace->id, 'security.password_min_length', 10);

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
            [
                'workspace_id' => $workspace->id,
                'name' => 'Sofia Alvarez',
                'phone' => '+34 611 223 344',
                'email' => 'sofia@northwind.es',
                'company' => 'Northwind Imports',
                'stage' => 'qualified',
                'agent_name' => $lead?->name,
                'last_contact_at' => now()->subHours(6),
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
            [
                'workspace_id' => $workspace->id,
                'title' => 'Northwind annual support',
                'customer_name' => 'Sofia Alvarez',
                'value' => '$18,000',
                'stage' => 'proposal',
                'agent_name' => $owner?->name,
                'expected_close_date' => now()->addWeeks(3)->toDateString(),
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
            [
                'workspace_id' => $workspace->id,
                'assignee_id' => $lead?->id,
                'title' => 'Follow up with Sofia on proposal',
                'due_at' => now()->addHours(8),
                'priority' => 'high',
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
            [
                'workspace_id' => $workspace->id,
                'title' => 'Team pipeline review',
                'starts_at' => now()->addDays(1)->setTime(9, 0),
                'ends_at' => now()->addDays(1)->setTime(9, 30),
                'location' => 'Zoom',
                'kind' => 'meeting',
            ],
        ], ['workspace_id', 'title'], ['starts_at', 'ends_at', 'location', 'kind']);

        Note::create([
            'workspace_id' => $workspace->id,
            'user_id' => $owner?->id,
            'notable_type' => Customer::class,
            'notable_id' => Customer::where('workspace_id', $workspace->id)->where('email', 'priya@acme.io')->value('id'),
            'body' => 'Customer asked for a revised quote with yearly billing.',
        ]);

        CrmNotification::create([
            'workspace_id' => $workspace->id,
            'user_id' => $agent?->id,
            'type' => 'task_due',
            'title' => 'Task due soon',
            'body' => 'Send updated proposal to Priya is due in 4 hours.',
            'notifiable_type' => Task::class,
            'notifiable_id' => Task::where('workspace_id', $workspace->id)->where('title', 'Send updated proposal to Priya')->value('id'),
        ]);

        AuditLog::create([
            'workspace_id' => $workspace->id,
            'user_id' => $owner?->id,
            'action' => 'workspace.seeded',
            'entity_type' => 'Workspace',
            'entity_id' => $workspace->id,
            'before_state' => null,
            'after_state' => ['seed' => 'demo'],
            'ip_address' => '127.0.0.1',
            'user_agent' => 'Seeder',
        ]);
    }
}
