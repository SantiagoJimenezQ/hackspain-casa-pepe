import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DecisionTreeView from './decision-tree-view';
import { LocaleProvider, useI18n } from '@/components/i18n/locale-provider';
import type { ActivityRecord } from '@/lib/casa-pepe-types';
const fixture = vi.hoisted(() => ({ run: 'one', events: [] as ActivityRecord[] }));
vi.mock('./dashboard-provider', () => ({ useDashboard: () => ({ overview: { incident: { runIdentifier: fixture.run, startedAt: '2026-09-19T10:00:00Z', title: 'Test incident' }, recentActivity: [] }, activity: fixture.events, decisionEvents: [] }) }));
vi.mock('@/lib/decision-tree-history', () => ({ loadTreeHistory: vi.fn().mockResolvedValue(0) }));
const plan = { identifier: 'e1', runIdentifier: 'one', sequence: 1, occurredAt: '2026-09-19T10:00:12Z', type: 'plan.revised', title: 'Replan', summary: 'Less capacity', source: 'agent', simulated: false, replayed: false, payload: { plan: { version: 2, reason: 'Capacity changed', priorities: [{ serviceName: 'Health', reason: 'Critical service', decision: 'recover-now' }, { serviceName: 'Reports', reason: 'No capacity', decision: 'postpone' }] } } };
beforeEach(() => {
  fixture.run = 'one'; fixture.events = [];
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
describe('decision tree view', () => {
  it('updates the open tree when the locale changes', async () => {
    function LocaleSwitch() {
      const { setLocale } = useI18n();
      return <button onClick={() => setLocale('en')}>English</button>;
    }
    fixture.events = [plan];
    render(<><LocaleSwitch /><DecisionTreeView onClose={vi.fn()} /></>, { wrapper: LocaleProvider });
    await waitFor(() => expect(screen.getByText(/En directo/)).toBeVisible());
    expect(screen.getByRole('button', { name: /Aplazado Reports/ })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByText(/1 milestones · 1 plan changes/)).toBeVisible();
    expect(screen.getByRole('button', { name: /Postponed Reports/ })).toBeVisible();
  });
  it('opens an accessible empty view and closes with the close button', async () => {
    const close = vi.fn(); render(<DecisionTreeView onClose={close} />, { wrapper: LocaleProvider });
    expect(screen.getByRole('dialog', { name: 'Árbol de decisiones' })).toBeVisible();
    await screen.findByText('Esperando la primera decisión');
    expect(screen.getByRole('button', { name: 'Reproducir recorrido' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar árbol de decisiones' }));
    expect(close).toHaveBeenCalledOnce();
  });
  it('selects a postponed branch and exposes its recorded reason and source', async () => {
    fixture.events = [plan]; render(<DecisionTreeView onClose={vi.fn()} />, { wrapper: LocaleProvider });
    fireEvent.click(screen.getByRole('button', { name: /Aplazado Reports/ }));
    expect(screen.getByRole('heading', { name: 'Reports' })).toBeVisible();
    expect(screen.getByLabelText('Detalle del hito seleccionado')).toHaveTextContent('No capacity');
    fireEvent.click(screen.getByText('Ver evento de origen'));
    expect(screen.getByText('plan.revised')).toBeVisible();
    await waitFor(() => expect(screen.getByText(/En directo/)).toBeVisible());
  });
  it('discards the old run when the incident resets', async () => {
    fixture.events = [plan]; const view = render(<DecisionTreeView onClose={vi.fn()} />, { wrapper: LocaleProvider });
    await waitFor(() => expect(screen.getByText(/En directo/)).toBeVisible());
    fixture.run = 'two'; view.rerender(<DecisionTreeView onClose={vi.fn()} />);
    await screen.findByText('Esperando la primera decisión');
    expect(screen.queryByText('Reports')).not.toBeInTheDocument();
  });
});
