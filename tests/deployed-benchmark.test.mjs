import test from 'node:test';
import assert from 'node:assert/strict';
import {collectDeployed,summarizeDataset,saveBenchmarkState,CASES} from '../scripts/benchmark-deployed.mjs';
import {readFile,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';

function fixture({model=false,quota=10,fail=false,generation='a'.repeat(64)}={}){
  const posts=[];let used=0,tick=0;
  return {posts,options:{wait:async()=>{},clock:()=>tick++,now:()=>new Date('2026-11-16T12:00:00Z'),
    fetcher:async(url,request)=>{
      const path=new URL(url).pathname;
      if(path==='/api/health')return Response.json({generation,corpus:{ready:true,fresh_chunks:100,stale_chunks:0}});
      if(path==='/api/usage')return Response.json({ai:{available:true,remaining:quota,used}});
      const body=JSON.parse(request.body);posts.push({path,body});
      if(fail)return Response.json({error:'NEVER RETAIN THIS INPUT',status:'NEVER RETAIN THIS INPUT'},{status:429});
      const entry=CASES.find(entry=>entry.path===path&&(path!=='/api/ask'||entry.body.question===body.question));
      const generated=Boolean(model&&entry.model);if(generated)used++;
      return Response.json({status:entry.model?'answered':'out_of_scope',answer:'Synthetic evidence. [E1]',
        evidence:[{id:'E1',quote:'Synthetic evidence.'}],records:[],
        conversation:{topic:'housing',private:'NEVER RETAIN THIS CONTEXT'},conversationUsed:Boolean(body.conversation),
        generation:{status:generated?'used':'skipped'},aiUsage:{available:true,remaining:quota-used,used}},
        {headers:{'Server-Timing':'total;dur=4, model;dur=2, private_input;dur=123','Cache-Control':'no-store'}});
    }}};
}
test('a temporary Windows checkpoint lock does not lose measurements or a budget reserve',async t=>{
  const path=resolve('work',`benchmark-save-${randomUUID()}.json`);let calls=0;
  t.after(async()=>{await rm(path,{force:true});await rm(path+'.tmp',{force:true});});
  const state={days:{'2026-11-16':{requests:10,modelCalls:2}}};
  await saveBenchmarkState(path,state,{wait:async()=>{},renameFile:async(from,to)=>{if(!calls++){const error=new Error('locked');error.code='EPERM';throw error;}return rename(from,to);}});
  assert.equal(calls,2);assert.deepEqual(JSON.parse(await readFile(path,'utf8')),state);
});
test('deployed sampling preserves follow-ups in memory and stores only bounded measurements',async()=>{
  const f=fixture();const state=await collectDeployed({...f.options,allowModel:true,maxSamples:18,target:2});
  const dataset=state.datasets[state.activeDataset];
  assert.equal(dataset.samples.length,18);assert.ok(dataset.summary.every(row=>row.complete));
  assert.ok(f.posts.find(row=>row.body.question==='What documents do I need?').body.conversation);
  const serialized=JSON.stringify(state);
  for(const text of ['NEVER RETAIN','Synthetic evidence.','315 E Kennedy','question','conversation','private_input'])assert.equal(serialized.includes(text),false,text);
  assert.equal(state.days['2026-11-16'].modelCalls,0);
});
test('model sampling reserves at most three daily attempts and leaves a quota reserve',async()=>{
  const f=fixture({model:true});const state=await collectDeployed({...f.options,allowModel:true,maxSamples:30,target:2});
  assert.equal(state.days['2026-11-16'].modelCalls,3);
  assert.equal(state.datasets[state.activeDataset].samples.filter(row=>row.generation==='used').length,3);
  const resumed=fixture({model:true});await collectDeployed({...resumed.options,state,allowModel:true,maxSamples:30,target:2});
  assert.ok(resumed.posts.every(row=>!CASES.find(entry=>entry.body.question&&entry.body.question===row.body.question)?.model));
  const low=fixture({quota:2});await collectDeployed({...low.options,allowModel:true,maxSamples:10,target:1});
  assert.ok(low.posts.every(row=>!CASES.find(entry=>entry.body.question&&entry.body.question===row.body.question)?.model));
});
test('generation changes create separate distributions and model-free runs skip potential inference',async()=>{
  const first=fixture();const state=await collectDeployed({...first.options,maxSamples:4,target:1,revision:'abc1234'});
  const second=fixture({generation:'b'.repeat(64)});await collectDeployed({...second.options,state,maxSamples:4,target:1,revision:'abc1234'});
  assert.equal(Object.keys(state.datasets).length,2);assert.equal(summarizeDataset(state.datasets[state.activeDataset],1).filter(row=>row.complete).length,4);
});
test('rate limits stop sampling and error text never enters the saved state',async()=>{
  const f=fixture({fail:true});const state=await collectDeployed({...f.options,allowModel:true,maxSamples:20});
  assert.equal(state.pending,'rate_limit');assert.equal(f.posts.length,1);
  assert.equal(JSON.stringify(state).includes('NEVER RETAIN'),false);
  assert.equal(state.datasets[state.activeDataset].samples[0].status,'unknown');
});
test('unknown model outcomes consume the reserved budget and request caps survive resume',async()=>{
  const f=fixture();const original=f.options.fetcher;
  f.options.fetcher=async(url,options)=>{if(new URL(url).pathname==='/api/ask'&&JSON.parse(options.body).question!=='hello')throw new Error('private transport error');return original(url,options);};
  const state=await collectDeployed({...f.options,allowModel:true,maxSamples:20});
  assert.equal(state.pending,'request_failed');assert.equal(state.days['2026-11-16'].modelCalls,1);
  assert.equal(state.datasets[state.activeDataset].summary.find(row=>row.category==='housing').transportErrors,1);
  state.days['2026-11-16'].requests=198;
  const none=fixture();await collectDeployed({...none.options,state});assert.equal(none.posts.length,0);assert.equal(state.pending,'daily_request_budget');
});

test('literal quoted fallback citations are valid and fabricated quote markers stop collection',async()=>{
  const f=fixture();const original=f.options.fetcher;let corrupted=false;
  f.options.fetcher=async(url,options)=>{
    const response=await original(url,options);
    if(new URL(url).pathname!=='/api/ask')return response;
    const data=await response.json();data.answer='Start here: “Synthetic evidence.” [E1]';
    if(JSON.parse(options.body).question==='What documents do I need?'){data.answer='Invented text. [E1]';corrupted=true;}
    return Response.json(data,{headers:response.headers});
  };
  const state=await collectDeployed({...f.options,allowModel:true,maxSamples:10});
  assert.ok(corrupted);assert.equal(state.pending,'citation_validation_failed');
  const rows=state.datasets[state.activeDataset].samples;
  assert.equal(rows.find(row=>row.category==='housing').citationMarkersValid,true);
  assert.equal(rows.find(row=>row.category==='followup').citationMarkersValid,false);
});

test('a deployment during sampling cannot mix corpus generations in a percentile',async()=>{
  const f=fixture();const original=f.options.fetcher;let healthCalls=0;
  f.options.fetcher=async(url,options)=>{
    if(new URL(url).pathname==='/api/health'&&++healthCalls>1)return Response.json({generation:'b'.repeat(64)});
    return original(url,options);
  };
  const state=await collectDeployed({...f.options,allowModel:true,maxSamples:5,target:100});
  assert.equal(state.pending,'generation_changed');
  assert.equal(state.datasets[state.activeDataset].samples.length,0);
  assert.ok(state.datasets[state.activeDataset].summary.every(row=>row.observations===0));
});

test('scheduled starts and UTC boundary guards make no premature network requests',async()=>{
  const f=fixture();f.options.fetcher=async()=>{throw new Error('Network must not run');};
  const delayed=await collectDeployed({...f.options,notBefore:'2026-11-17'});
  assert.equal(delayed.pending,'scheduled_start');
  const boundary=await collectDeployed({...f.options,now:()=>new Date('2026-11-16T23:59:30Z')});
  assert.equal(boundary.pending,'utc_day_boundary');
  await assert.rejects(collectDeployed({...f.options,maxModelCalls:4}),/Invalid bounded/);
});
