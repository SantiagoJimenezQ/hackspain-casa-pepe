'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Circle, GitBranch, Maximize2, Minus, Pause, Play, Plus, RotateCcw, TriangleAlert, X } from 'lucide-react';
import { useDashboard } from './dashboard-provider';
import { useI18n } from '@/components/i18n/locale-provider';
import { buildDecisionTree, elapsedLabel, mergeTreeEvents, type DecisionTreeNode, type DecisionTreeBranch } from '@/lib/decision-tree';
import { loadTreeHistory } from '@/lib/decision-tree-history';
import type { ActivityRecord } from '@/lib/casa-pepe-types';
import { localeTags, messageKey } from '@/lib/i18n';
import styles from './decision-tree.module.css';

const kindKeys = { signal: 'tree.kind.signal', decision: 'tree.kind.decision', plan: 'tree.kind.plan', revision: 'tree.kind.revision', action: 'tree.kind.action', result: 'tree.kind.result' } as const;
function StatusIcon({ tone }: { tone: DecisionTreeNode['tone'] }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'danger' || tone === 'warning' ? TriangleAlert : Circle;
  return <Icon size={18} aria-hidden="true" />;
}

export default function DecisionTreeView({ onClose }: { onClose: () => void }) {
  const { overview } = useDashboard();
  if (!overview) return null;
  // A reset remounts history, selection, and playback together.
  return <RunTree key={overview.incident.runIdentifier} run={overview.incident.runIdentifier} start={overview.incident.startedAt} title={overview.incident.title} onClose={onClose} />;
}

function RunTree({ run, start, title, onClose }: { run: string; start: string; title: string; onClose: () => void }) {
  const { activity, overview } = useDashboard();
  const { locale, t } = useI18n();
  const [history, setHistory] = useState<ActivityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [zoom, setZoom] = useState(1);
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let cursor = 0;
    let timer: ReturnType<typeof setTimeout>;
    const sync = async () => {
      try {
        cursor = await loadTreeHistory(run, cursor, controller.signal, items => setHistory(current => mergeTreeEvents(current, items, run)));
        if (!controller.signal.aborted) { setLoading(false); setError(''); }
      } catch (cause) {
        if (!controller.signal.aborted) { setLoading(false); setError(cause instanceof Error ? cause.message : 'No se pudo cargar el historial.'); }
      }
      if (!controller.signal.aborted) timer = setTimeout(sync, 4000);
    };
    void sync();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [run, retry]);

  const allNodes = useMemo(() => buildDecisionTree(mergeTreeEvents(history, [...activity, ...(overview?.recentActivity ?? [])], run), run, locale), [history, activity, overview?.recentActivity, run, locale]);
  const nodes = useMemo(() => {
    const hasPlans = allNodes.some(node => node.kind === 'plan' || node.kind === 'revision');
    return detail ? allNodes : allNodes.filter(node => (node.kind !== 'decision' || node.sourceType.startsWith('approval.') || !hasPlans) && (node.kind !== 'action' || node.tone === 'danger'));
  }, [allNodes, detail]);
  const selected = nodes.find(node => node.id === selectedId || node.branches.some(branch => branch.id === selectedId)) ?? nodes[0];
  const branch = selected?.branches.find(item => item.id === selectedId);
  const index = selected ? nodes.indexOf(selected) : 0;
  const changes = allNodes.filter(node => node.kind === 'revision').length;

  const nextNodeId = nodes[index + 1]?.id;
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (!nextNodeId) setPlaying(false);
      else setSelectedId(nextNodeId);
    }, 2400);
    return () => clearTimeout(timer);
  }, [playing, nextNodeId]);
  const selectedNodeId = selected?.id;
  useEffect(() => {
    if (selectedNodeId) cards.current.get(selectedNodeId)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
  }, [selectedNodeId]); // Selection follows playback without moving keyboard focus.

  const select = (id: string) => { setPlaying(false); setSelectedId(id); };
  const fit = () => { setZoom(Math.max(0.5, Math.min(1, ((viewport.current?.clientWidth ?? 1100) - 48) / (Math.min(nodes.length, 4) * 294)))); };

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="decision-tree-title" onCancel={onClose}>
    <header className={styles.header}>
      <div className={styles.heading}><GitBranch size={23} /><div><span className={styles.eyebrow}>CASA PEPE / RECORRIDO DEL AGENTE</span><h1 id="decision-tree-title">Árbol de decisiones</h1></div></div>
      <button type="button" className={styles.control} onClick={onClose} autoFocus aria-label="Cerrar árbol de decisiones"><X size={17} /><span>Cerrar</span><kbd>Esc</kbd></button>
    </header>
    <div className={styles.toolbar}>
      <div><h2>{title}</h2><p>{t('tree.milestones', { changes, count: nodes.length })} {loading ? t('tree.loadingHistory') : error ? t('tree.partialHistory') : t('tree.live')}</p></div>
      <div className={styles.controls}><div className={styles.segment}><button type="button" aria-pressed={!detail} onClick={() => { setDetail(false); setPlaying(false); }}>{t('tree.summaryTab')}</button><button type="button" aria-pressed={detail} onClick={() => { setDetail(true); setPlaying(false); }}>{t('tree.detailTab')}</button></div><button type="button" className={styles.control} disabled={!nodes.length} onClick={() => { if (!playing && index === nodes.length - 1) setSelectedId(nodes[0].id); setPlaying(!playing); }}>{playing ? <Pause size={15} /> : <Play size={15} />}{playing ? t('tree.pause') : t('tree.play')}</button></div>
    </div>
    {error ? <div role="alert" className={styles.error}>{error} {t('tree.errorSuffix')} <button type="button" onClick={() => setRetry(value => value + 1)}>{t('tree.retry')}</button></div> : null}
    <div className={styles.body}>
      <section className={styles.canvas} aria-label="Recorrido del incidente">
        <div ref={viewport} className={styles.viewport}>
          {!nodes.length ? <div className={styles.empty}><GitBranch size={44} /><h2>{loading ? t('tree.loadingJourney') : t('tree.awaitingFirst')}</h2><p>{t('tree.emptyHint')}</p></div> : <div className={styles.graph} style={{ zoom }}>
            {nodes.map((node, i) => <div key={node.id} className={styles.column}>
              <div className={styles.columnLabel}><span>{String(i + 1).padStart(2, '0')}</span>{t(kindKeys[node.kind])}</div>
              {i > 0 ? <div className={styles.sequenceLine} aria-hidden="true">›</div> : null}
              <button type="button" ref={element => { if (element) cards.current.set(node.id, element); else cards.current.delete(node.id); }} className={`${styles.node} ${styles[node.tone]} ${selected?.id === node.id ? styles.selected : ''}`} aria-pressed={selected?.id === node.id && !branch} onClick={() => select(node.id)}>
                <div className={styles.meta}><StatusIcon tone={node.tone} /><time>{elapsedLabel(node.occurredAt, start)}</time><span>{t(kindKeys[node.kind])}</span></div>
                <strong>{node.title}</strong><p>{node.reason || t('tree.noExplanation')}</p><span className={styles.badge}>{node.status}</span>
              </button>
              {node.branches.length ? <div className={styles.branches}>{node.branches.map(item => <button type="button" key={item.id} className={`${styles.branch} ${styles[item.tone]} ${branch?.id === item.id ? styles.selected : ''}`} aria-pressed={branch?.id === item.id} onClick={() => select(item.id)}><div className={styles.meta}><StatusIcon tone={item.tone} /><span>{item.status}</span></div><strong>{item.title}</strong><p>{item.reason}</p></button>)}</div> : null}
            </div>)}
          </div>}
        </div>
        <div className={styles.legend}><span><i className={styles.solid} />{t('tree.legend.priority')}</span><span><i className={styles.dashed} />{t('tree.legend.time')}</span><span><i className={styles.amber} />{t('tree.legend.revision')}</span><small>{t('tree.legend.note')}</small></div>
      </section>
      <aside className={styles.inspector} aria-label="Detalle del hito seleccionado">
        {selected ? <NodeDetails node={selected} branch={branch} start={start} /> : <div className={styles.empty}><Circle size={28} /><p>{t('tree.selectHint')}</p></div>}
      </aside>
    </div>
    <footer className={styles.footer}>
      <button type="button" className={styles.control} aria-label="Volver al inicio del recorrido" disabled={!nodes.length} onClick={() => select(nodes[0].id)}><RotateCcw size={17} /></button>
      <input type="range" aria-label="Hito del recorrido" min={0} max={Math.max(0, nodes.length - 1)} value={index} disabled={!nodes.length} onChange={event => { const node = nodes[Number(event.target.value)]; if (node) select(node.id); }} />
      <span className={styles.counter}>{selected ? elapsedLabel(selected.occurredAt, start) : '00:00'} <small>· {nodes.length ? index + 1 : 0}/{nodes.length}</small></span>
      <div className={styles.controls}><button type="button" className={styles.control} aria-label="Reducir zoom" disabled={zoom <= 0.5} onClick={() => setZoom(value => Math.max(0.5, value - 0.1))}><Minus size={16} /></button><span className={styles.zoom}>{Math.round(zoom * 100)}%</span><button type="button" className={styles.control} aria-label="Ampliar zoom" disabled={zoom >= 1.5} onClick={() => setZoom(value => Math.min(1.5, value + 0.1))}><Plus size={16} /></button><button type="button" className={styles.control} onClick={fit}><Maximize2 size={15} /><span>{t('tree.fit')}</span></button></div>
    </footer>
    <p className={styles.note}>{t('tree.footnote')}</p>
  </dialog>;
}

/**
 * Where the milestone came from, in the terms an operator thinks in: when it happened, what kind
 * of event it was and whether it was real. The activity identifier and its sequence number are
 * internal bookkeeping, so they stay out of the panel.
 */
function SourceDetails({ node }: { node: DecisionTreeNode }) {
  const { locale, t } = useI18n();
  const when = new Date(node.occurredAt);
  const origin = messageKey(`tree.title.${node.sourceType}`);
  return (
    <details className={styles.source}>
      <summary>{t('tree.sourceEvent')}</summary>
      <dl>
        <dt>{t('tree.sourceDate')}</dt>
        <dd>{Number.isNaN(when.getTime()) ? node.occurredAt : when.toLocaleString(localeTags[locale])}</dd>
        <dt>{t('tree.sourceType')}</dt>
        <dd>{origin ? t(origin) : node.sourceType}</dd>
        <dt>{t('tree.sourceMode')}</dt>
        <dd>{node.simulated ? t('tree.simulated') : t('tree.notSimulated')}{node.replayed ? t('tree.replayed') : ''}</dd>
      </dl>
    </details>
  );
}

function NodeDetails({ node, branch, start }: { node: DecisionTreeNode; branch?: DecisionTreeBranch; start: string }) {
  const { t } = useI18n();
  return <><span className={styles.eyebrow}>{branch ? t('tree.planPriority').toUpperCase() : t(kindKeys[node.kind]).toUpperCase()}</span><h2>{branch?.title ?? node.title}</h2><div className={`${styles.detailStatus} ${styles[branch?.tone ?? node.tone]}`}><StatusIcon tone={branch?.tone ?? node.tone} /><span>{branch?.status ?? node.status}</span><time>{elapsedLabel(node.occurredAt, start)}</time></div><h3>{t('tree.recordedReason')}</h3><p className={styles.explanation}>{branch?.reason || node.reason || t('tree.noExplanation')}</p>{!branch && node.details.length ? <><h3>{t('tree.contextChanges')}</h3><ul>{node.details.map((text, index) => <li key={index}>{text}</li>)}</ul></> : null}<SourceDetails node={node} /></>;
}
