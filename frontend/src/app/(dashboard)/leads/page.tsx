'use client';

import { useState } from 'react';
import { Filter, Plus, RefreshCw, Search, SlidersHorizontal, UsersRound } from 'lucide-react';
import { LeadBoard } from '@/components/leads/lead-board';
import { RequirePermission } from '@/components/auth/require-permission';
import { useLeadList, useMoveLead } from '@/hooks/use-leads';
import type { Lead, LeadFilters, LeadStage } from '@/lib/leads-api';
import { ContactDetailDrawer } from '@/components/contacts/contact-detail-drawer';

function LeadsView() {
  const [search, setSearch] = useState('');
  const [temperature, setTemperature] = useState<LeadFilters['temperature']>();
  const [pendingLeadId, setPendingLeadId] = useState<number>();
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const filters: LeadFilters = { search: search || undefined, temperature, per_page: 100 };
  const { data, isLoading, isError, refetch, isFetching } = useLeadList(filters);
  const moveLeadMutation = useMoveLead();
  const leads = data?.data ?? [];
  const hotCount = leads.filter((lead) => lead.temperature === 'hot').length;
  const qualifiedCount = leads.filter((lead) => lead.stage === 'qualified').length;
  const convertedCount = leads.filter((lead) => lead.stage === 'converted').length;

  const moveLead = async (lead: Lead, stage: LeadStage) => {
    setPendingLeadId(lead.id);
    try { await moveLeadMutation.mutateAsync({ id: lead.id, stage }); } finally { setPendingLeadId(undefined); }
  };

  return <main className='space-y-7 p-6 md:p-8'>
    <header className='flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between'>
      <div><div className='mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-primary'><span className='h-2 w-2 rounded-full bg-primary shadow-[0_0_0_4px_var(--color-primary-soft)]' />Sales workspace</div><h1 className='text-3xl font-semibold tracking-tight text-text md:text-4xl'>Lead pipeline</h1><p className='mt-2 max-w-xl text-sm leading-6 text-muted'>Turn live WhatsApp conversations into qualified opportunities and keep every follow-up visible to the team.</p></div>
      <button type='button' className='inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark'><Plus className='h-4 w-4' />New lead</button>
    </header>
    <section className='grid gap-3 sm:grid-cols-3'>
      {[{ label: 'Total leads', value: leads.length, icon: UsersRound, tone: 'text-info' }, { label: 'Hot opportunities', value: hotCount, icon: SlidersHorizontal, tone: 'text-danger' }, { label: 'Converted', value: convertedCount, icon: Filter, tone: 'text-success' }].map(({ label, value, icon: Icon, tone }) => <div key={label} className='relative overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm'><div className='flex items-center justify-between'><span className='text-xs font-medium uppercase tracking-wider text-muted'>{label}</span><Icon className={`h-4 w-4 ${tone}`} /></div><p className='mt-3 text-2xl font-semibold text-text'>{value}</p><p className='mt-1 text-xs text-muted'>{label === 'Total leads' ? `${qualifiedCount} qualified now` : 'Across this view'}</p></div>)}
    </section>
    <section className='flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between'>
      <div className='relative min-w-0 flex-1 sm:max-w-md'><Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted' /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder='Search people, phones, or lead notes' className='w-full rounded-xl border border-border bg-bg py-2.5 pl-9 pr-3 text-sm text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20' /></div>
      <div className='flex items-center gap-2'><select aria-label='Filter by temperature' value={temperature ?? ''} onChange={(event) => setTemperature((event.target.value || undefined) as LeadFilters['temperature'])} className='rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none'><option value=''>All temperatures</option><option value='hot'>Hot</option><option value='warm'>Warm</option><option value='cold'>Cold</option></select><button type='button' onClick={() => void refetch()} aria-label='Refresh leads' className='rounded-xl border border-border p-2.5 text-muted hover:bg-primary-soft/40 hover:text-primary'><RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /></button></div>
    </section>
    {isLoading && <div className='rounded-2xl border border-border bg-surface p-12 text-center text-sm text-muted'>Loading your pipeline...</div>}
    {isError && <div className='rounded-2xl border border-danger/20 bg-danger/5 p-8 text-center'><p className='text-sm font-semibold text-danger'>The pipeline could not be loaded.</p><button type='button' onClick={() => void refetch()} className='mt-3 text-xs font-semibold text-danger underline'>Try again</button></div>}
    {!isLoading && !isError && <div className='-mx-6 overflow-x-auto px-6 pb-3 md:-mx-8 md:px-8'><LeadBoard leads={leads} onStageChange={moveLead} onContactClick={setSelectedContactId} pendingLeadId={pendingLeadId} /></div>}
    <ContactDetailDrawer contactId={selectedContactId} open={selectedContactId !== null} onOpenChange={(open) => { if (!open) setSelectedContactId(null); }} />
  </main>;
}

export default function LeadsPage() { return <RequirePermission permission='leads.manage'><LeadsView /></RequirePermission>; }
