'use client';

import Link from 'next/link';
import { ArrowRight, CalendarClock, CircleDollarSign, MessageCircle, MoreHorizontal, Phone } from 'lucide-react';
import type { Lead, LeadStage } from '@/lib/leads-api';

const stageLabels: Record<string, string> = { new: 'New lead', contacted: 'Contacted', qualified: 'Qualified', lost: 'Lost', converted: 'Converted' };

function initials(name: string | null | undefined) {
  return (name ?? 'Lead').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

export function LeadCard({ lead, stages, onStageChange, onContactClick, pending }: { lead: Lead; stages: LeadStage[]; onStageChange: (stage: LeadStage) => void; onContactClick?: (contactId: number) => void; pending?: boolean }) {
  const name = lead.contact?.full_name || lead.contact?.phone_number || `Lead #${lead.id}`;
  const nextStage = stages[stages.indexOf(lead.stage) + 1];

  return (
    <article className='group rounded-2xl border border-border/80 bg-surface p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 items-center gap-3'>
          <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-xs font-bold text-primary-dark'>{initials(lead.contact?.full_name)}</div>
          <div className='min-w-0'><button type='button' onClick={() => onContactClick ? onContactClick(lead.contact_id) : undefined} className='block max-w-full truncate text-left text-sm font-semibold text-text hover:text-primary'>{name}</button><p className='mt-0.5 truncate text-xs text-muted'>{lead.source || 'Manual source'}</p></div>
        </div>
        <button type='button' aria-label={`More actions for ${name}`} className='rounded-lg p-1.5 text-muted opacity-60 transition hover:bg-bg hover:text-text group-hover:opacity-100'><MoreHorizontal className='h-4 w-4' /></button>
      </div>
      <div className='mt-4 grid grid-cols-2 gap-2 text-xs text-muted'>
        <span className='inline-flex items-center gap-1.5'><Phone className='h-3.5 w-3.5 text-primary' />{lead.contact?.phone_number || 'No phone'}</span>
        <span className='inline-flex items-center gap-1.5'><CircleDollarSign className='h-3.5 w-3.5 text-warning' />Score {lead.score}</span>
      </div>
      <div className='mt-4 flex items-center justify-between border-t border-border/70 pt-3'>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${lead.temperature === 'hot' ? 'bg-danger/10 text-danger' : lead.temperature === 'warm' ? 'bg-warning/10 text-warning-dark' : 'bg-info/10 text-info-dark'}`}>{lead.temperature}</span>
        <div className='flex items-center gap-1.5'>
          <Link href={`/inbox?contact=${lead.contact_id}`} aria-label={`Open conversation with ${name}`} className='rounded-lg border border-border p-1.5 text-muted hover:border-primary/40 hover:bg-primary-soft/40 hover:text-primary'><MessageCircle className='h-3.5 w-3.5' /></Link>
          <button type='button' disabled={!nextStage || pending} onClick={() => nextStage && onStageChange(nextStage)} className='inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50'>{pending ? 'Saving' : nextStage ? stageLabels[nextStage] ?? nextStage : 'Complete'}{nextStage && <ArrowRight className='h-3 w-3' />}</button>
        </div>
      </div>
      {lead.converted_at && <p className='mt-3 inline-flex items-center gap-1 text-[11px] text-success'><CalendarClock className='h-3.5 w-3.5' />Converted {new Date(lead.converted_at).toLocaleDateString()}</p>}
    </article>
  );
}
