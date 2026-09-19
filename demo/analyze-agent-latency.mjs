import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const time = (event) => Date.parse(event?.occurredAt ?? '');
const delta = (a,b) => Number.isFinite(a) && Number.isFinite(b) && b >= a ? b-a : null;
export function unionWait(intervals, start, end) {
 let covered=start,total=0;
 for(const [a,b] of intervals.map(([a,b])=>[Math.max(a,start),Math.min(b,end)]).filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>a).sort((a,b)=>a[0]-b[0])) {total+=Math.max(0,b-Math.max(covered,a));covered=Math.max(covered,b);}
 return total;
}
export function analyzeRun(run) {
 const events=[...new Map(run.events.filter(e=>!e.runIdentifier || e.runIdentifier===run.runIdentifier).map(e=>[e.sequence,e])).values()].sort((a,b)=>a.sequence-b.sequence);
 const impact=events.find(e=>e.type==='incident.impact-detected');
 const dispatches=events.filter(e=>e.type==='tool-call.dispatched');
 const start=time(impact), first=time(dispatches[0]);
 const firstTool=dispatches[0]?.correlation?.toolCallIdentifier;
 const completion=firstTool ? events.find(e=>e.type==='tool-call.completed' && e.correlation?.toolCallIdentifier===firstTool) : undefined;
 const recovery=dispatches.find(e=>e.payload?.toolCall?.name==='execute_recovery');
 const verified=events.find(e=>e.type==='tool-call.completed' && e.payload?.toolCall?.name==='verify_recovery' && e.payload?.toolCall?.output?.verified===true);
 const approvals=new Map(); const waits=[]; const approvalToDispatch=[];
 for(const e of events) {
  const approval=e.payload?.approval;
  if(e.type==='approval.requested' && approval) approvals.set(approval.identifier,{...approval,requestedAt:e.occurredAt});
  if(['approval.decided','approval.expired','approval.superseded'].includes(e.type) && approval) {
   const prior=approvals.get(approval.identifier);
   if(prior) waits.push([Date.parse(prior.requestedAt),time(e)]);
   if(approval.status==='approved') {
    const dispatched=dispatches.find(d=>d.correlation?.planIdentifier===approval.planIdentifier && d.correlation?.planStepIdentifier===approval.planStepIdentifier && time(d)>=time(e));
    approvalToDispatch.push({approvalIdentifier:approval.identifier,milliseconds:delta(time(e),time(dispatched))});
   }
   approvals.delete(approval.identifier);
  }
 }
 const end=time(events.at(-1));
 for(const pending of approvals.values()) waits.push([Date.parse(pending.requestedAt),end]);
 const turns=events.filter(e=>e.type==='agent.decision-timing');
 const changes=events.filter(e=>e.type==='resource.capacity-changed');
 return {
  runIdentifier:run.runIdentifier,profile:run.profile,metadata:run.metadata ?? {},
  eventToFirstDispatchMilliseconds:delta(start,first),
  eventToFirstExternalCompletionMilliseconds:delta(start,time(completion)),
  eventToFirstRecoveryDispatchMilliseconds:delta(start,time(recovery)),
  eventToFirstVerifiedRecoveryMilliseconds:delta(start,time(verified)),
  modelRequestsBeforeFirstDispatch:Number.isFinite(first)?turns.filter(e=>Date.parse(e.payload.startedAt)<=first).length:null,
  humanWaitingMilliseconds:Number.isFinite(start)&&Number.isFinite(end)?unionWait(waits,start,end):null,
  approvalToDispatch,
  changedEvidenceToDispatch:changes.map(e=>({sequence:e.sequence,milliseconds:delta(time(e),time(dispatches.find(d=>time(d)>=time(e) && events.some(p=>p.type==='plan.revised' && time(p)>=time(e) && p.correlation?.planIdentifier===d.correlation?.planIdentifier))))})),
  modelMilliseconds:turns.map(e=>e.payload.modelMilliseconds),
  failed:events.some(e=>['agent.llm-failed','agent.limit-reached','tool-call.failed'].includes(e.type)) || !Number.isFinite(first),
  rejected:turns.filter(e=>e.payload.outcome==='rejected').length,
  stale:turns.filter(e=>e.payload.outcome==='stale').length,
 };
}
export function summarize(runs) {
 return [...new Set(runs.map(r=>r.profile))].map(profile=>{
  const group=runs.filter(r=>r.profile===profile), values=group.map(r=>r.eventToFirstDispatchMilliseconds).filter(v=>v!==null).sort((a,b)=>a-b);
  return {profile,runs:group.length,failed:group.filter(r=>r.failed).length,measured:values.length,median:values.length?(values[Math.floor((values.length-1)/2)]+values[Math.ceil((values.length-1)/2)])/2:null,p95:values.length?values[Math.ceil(values.length*.95)-1]:null};
 });
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 const file=process.argv[2]; if(!file) throw new Error('Usage: node demo/analyze-agent-latency.mjs <runs.json>');
 const input=JSON.parse(await readFile(file,'utf8'));const runs=input.runs.map(analyzeRun);
 process.stdout.write(JSON.stringify({runs,summary:summarize(runs)},null,2)+'\n');
}
