'use client';

import { Inbox, Sparkles, Target, Trophy, XCircle } from 'lucide-react';
import type { Lead, LeadStage } from '@/lib/leads-api';
import { LeadCard } from '@/components/leads/lead-card';

const columns: { stage: LeadStage; label: string; icon: typeof Inbox; tone: string }[] = [
  { stage: 'new', label: 'New lead', icon: Inbox, tone: 'text-info' },
  { stage: 'contacted', label: 'Contacted', icon: Sparkles, tone: 'text-primary' },
  { stage: 'qualified', label: 'Qualified', icon: Target, tone: 'text-warning-dark' },
  { stage: 'converted', label: 'Converted', icon: Trophy, tone: 'text-success' },
  { stage: 'lost', label: 'Lost', icon: XCircle, tone: 'text-danger' },
];

export function LeadBoard({ leads, onStageChange, onContactClick, pendingLeadId }: { leads: Lead[]; onStageChange: (lead: Lead, stage: LeadStage) => void; onContactClick?: (contactId: number) => void; pendingLeadId?: number }) {
  return (
    <div className='grid min-w-[1120px] grid-cols-5 gap-4'>
      {columns.map(({ stage, label, icon: Icon, tone }) => {
        const columnLeads = leads.filter((lead) => lead.stage === stage);
        return <section key={stage} aria-label={`${label} leads`} className='flex min-h-[420px] flex-col rounded-2xl bg-bg/75 p-3'>
          <header className='flex items-center justify-between px-1 pb-3'><div className='flex items-center gap-2'><Icon className={`h-4 w-4 ${tone}`} /><h2 className='text-sm font-semibold text-text'>{label}</h2></div><span className='rounded-full bg-surface px-2 py-0.5 text-xs font-semibold text-muted'>{columnLeads.length}</span></header>
          <div className='flex flex-1 flex-col gap-3'>{columnLeads.map((lead) => <LeadCard key={lead.id} lead={lead} stages={columns.map((column) => column.stage)} onStageChange={(nextStage) => onStageChange(lead, nextStage)} onContactClick={onContactClick} pending={pendingLeadId === lead.id} />)}{columnLeads.length === 0 && <div className='flex flex-1 items-center justify-center rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted'>No leads in this stage</div>}</div>
        </section>;
      })}
    </div>
  );
}
