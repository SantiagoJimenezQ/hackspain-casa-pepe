import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyzeRun,summarize,unionWait} from './analyze-agent-latency.mjs';
const event=(type,ms,payload={},correlation={})=>({type,sequence:ms,occurredAt:new Date(ms).toISOString(),payload,correlation,runIdentifier:'A'});
test('M03 counts adapter dispatch rather than plans or approvals',()=>{
 const result=analyzeRun({runIdentifier:'A',profile:'test',events:[event('incident.impact-detected',0),event('plan.created',100),event('approval.requested',200),event('tool-call.started',300),event('tool-call.dispatched',800,{}, {toolCallIdentifier:'tool'}),event('tool-call.completed',900,{}, {toolCallIdentifier:'tool'})]});
 assert.equal(result.eventToFirstDispatchMilliseconds,800);assert.equal(result.eventToFirstExternalCompletionMilliseconds,900);
});
test('M02 merges overlapping human waits',()=>assert.equal(unionWait([[100,400],[200,500]],0,1000),400));
test('M05 excludes late old-run data and does not invent missing dispatch',()=>{
 const result=analyzeRun({runIdentifier:'A',profile:'test',events:[event('incident.impact-detected',0),{...event('tool-call.dispatched',10),runIdentifier:'B'}]});
 assert.equal(result.eventToFirstDispatchMilliseconds,null);assert.equal(result.failed,true);
});
test('summary retains failed runs and computes percentiles',()=>assert.deepEqual(summarize([{profile:'A',failed:false,eventToFirstDispatchMilliseconds:10},{profile:'A',failed:true,eventToFirstDispatchMilliseconds:null},{profile:'A',failed:false,eventToFirstDispatchMilliseconds:30}]),[{profile:'A',runs:3,failed:1,measured:2,median:20,p95:30}]));
