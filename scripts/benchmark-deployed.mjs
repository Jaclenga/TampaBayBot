/** Fixed public/synthetic workload. Reports never retain inputs or answer text. */
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,resolve,relative,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {readBoundedBody} from '../src/lib/ingestion/fetch.mjs';

const POINT={latitude:27.947664,longitude:-82.457244,address:'315 E Kennedy Blvd'};
export const CASES=[
  {id:'greeting',path:'/api/ask',body:{question:'hello',jurisdictionId:'tampa'}},
  {id:'housing',path:'/api/ask',model:true,body:{question:'Where can I find rental assistance in Tampa?',jurisdictionId:'tampa'}},
  {id:'followup',path:'/api/ask',model:true,body:{question:'What documents do I need?',jurisdictionId:'tampa'}},
  {id:'zoning',path:'/api/ask',model:true,body:{question:'What are Tampa zoning rules for a duplex?',jurisdictionId:'tampa'}},
  {id:'permits',path:'/api/ask',model:true,body:{question:'Do I need a permit to replace a water heater in Tampa?',jurisdictionId:'tampa'}},
  {id:'development-navigation',path:'/api/ask',model:true,body:{question:'Where can I find development records in Tampa?',jurisdictionId:'tampa'}},
  {id:'unsupported',path:'/api/ask',body:{question:'Write a song about the moon.',jurisdictionId:'tampa'}},
  {id:'property',path:'/api/property',body:POINT},
  {id:'development-records',path:'/api/development',body:{...POINT,radiusMeters:500}},
];
const STAGES=new Set(['total','conversation','intent','scope','retrieval','candidates','ranking','answer','citations','model','external','usage']);
const STATUSES=new Set(['answered','insufficient_evidence','conflicting_evidence','potentially_outdated','needs_location','needs_jurisdiction','official_judgment','out_of_scope','unavailable_source','missing_geographic_coverage','found','not_found','partial','unavailable','ambiguous_parcel','missing_coverage','invalid_input']);
const GEN=new Set(['used','skipped','disabled','fallback']);
const percentile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*q)-1]??null;
const numeric=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;

export async function saveBenchmarkState(output,state,{renameFile=rename,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  await writeFile(output+'.tmp',JSON.stringify(state,null,2)+'\n');
  // OneDrive and Windows indexers can briefly hold the previous checkpoint.
  // Retry the atomic replacement; never delete it or lose the budget reserve.
  for(let attempt=0;;attempt++){
    try {await renameFile(output+'.tmp',output);return;}
    catch(error){if(!['EPERM','EBUSY','EACCES'].includes(error.code)||attempt===4)throw error;await wait(25*(attempt+1));}
  }
}

export function summarizeDataset(dataset,target=100){
  return CASES.map(({id})=>{
    const all=dataset.samples.filter(row=>row.category===id&&row.epochVerified!==false), ok=all.filter(row=>row.http===200&&row.citationMarkersValid!==false);
    const transportErrors=dataset.transportErrors?.[id]??0;
    return {category:id,observations:ok.length,target,complete:ok.length>=target,
      p50Ms:percentile(ok.map(row=>row.wallMs),.5),p95Ms:percentile(ok.map(row=>row.wallMs),.95),
      failures:all.length-ok.length+transportErrors,transportErrors,errorRate:all.length+transportErrors?(all.length-ok.length+transportErrors)/(all.length+transportErrors):null,
      modelReplies:ok.filter(row=>row.generation==='used').length,
      modelStageP50Ms:percentile(ok.filter(row=>row.generation==='used').flatMap(row=>row.stages.model===undefined?[]:[row.stages.model]),.5)};
  });
}
function citationMarkersValid(data){
  if(!Array.isArray(data.evidence)||typeof data.answer!=='string')return false;
  const markers=[...data.answer.matchAll(/\[(E\d+)\]/g)];
  if(data.status==='answered'&&!markers.length)return false;
  return markers.every(marker=>{
    const item=data.evidence.find(item=>item.id===marker[1]);
    const preceding=data.answer.slice(0,marker.index).trimEnd();
    return item&&(data.status!=='answered'||typeof item.quote==='string'&&(preceding.endsWith(item.quote)||preceding.endsWith(`“${item.quote}”`)));
  });
}

export async function collectDeployed({base='https://tampabaybot-housing-preview.pages.dev/',state={schema:1,datasets:{},days:{}},
  maxSamples=100,target=100,maxModelCalls=3,allowModel=false,spacingMs=8000,
  revision='unspecified',
  notBefore,
  fetcher=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),clock=()=>performance.now(),
  now=()=>new Date(),persist=async()=>{}}={}){
  const origin=new URL(base);
  if(origin.protocol!=='https:'||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/')throw new Error('Use an HTTPS origin.');
  if(!Number.isInteger(maxSamples)||maxSamples<1||maxSamples>200||!Number.isInteger(target)||target<1||target>1000||
    !Number.isInteger(maxModelCalls)||maxModelCalls<0||maxModelCalls>3||spacingMs<6500)throw new Error('Invalid bounded benchmark options.');
  if(state.schema!==1||!state.datasets||!state.days)throw new Error('Unsupported benchmark state.');
  if(revision!=='unspecified'&&!/^[a-f\d]{7,40}$/.test(revision))throw new Error('Use a release commit identifier.');
  const day=now().toISOString().slice(0,10);
  if(notBefore&&(!/^\d{4}-\d{2}-\d{2}$/.test(notBefore)||!Number.isFinite(Date.parse(notBefore))))throw new Error('Invalid sampling start date.');
  if(notBefore&&day<notBefore){state.pending='scheduled_start';await persist(state);return state;}
  const budget=state.days[day]??={requests:0,modelCalls:0};
  const dayEnd=Date.parse(`${day}T00:00:00Z`)+86400000;
  const safeWindow=()=>now().toISOString().slice(0,10)===day&&dayEnd-now().getTime()>60000;
  if(!safeWindow()){state.pending='utc_day_boundary';await persist(state);return state;}
  if(budget.requests>=198){state.pending='daily_request_budget';await persist(state);return state;}
  async function request(path,body){
    await wait(spacingMs);
    if(!safeWindow())throw new Error('Sampling window closed.');
    const started=clock();budget.requests++;await persist(state);
    const signal=AbortSignal.timeout(45000);
    const response=await fetcher(new URL(path,origin),{method:body?'POST':'GET',redirect:'manual',signal,
      headers:{Origin:origin.origin,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const bytes=await readBoundedBody(response,{maxBytes:2*1024*1024,signal});
    return {response,data:JSON.parse(bytes.toString('utf8')),wallMs:clock()-started};
  }
  const health=await request('/api/health');
  if(health.response.status!==200||!/^([a-f\d]{64})$/.test(health.data.generation??''))throw new Error('Health metadata unavailable.');
  const generation=health.data.generation;
  const datasetKey=`${revision}:${generation}`;
  const dataset=state.datasets[datasetKey]??={samples:[],cursor:0};
  dataset.samples=dataset.samples.filter(row=>row.epochVerified!==false);
  dataset.readiness={ready:health.data.corpus?.ready===true,freshChunks:numeric(health.data.corpus?.fresh_chunks),staleChunks:numeric(health.data.corpus?.stale_chunks)};
  state.activeGeneration=generation;
  state.activeDataset=datasetKey;
  dataset.revision=revision;
  const originalSamples=dataset.samples.length;
  let usage=(await request('/api/usage')).data.ai;
  let context=null,completed=0,skips=0;
  state.pending=null;
  while(completed<maxSamples&&budget.requests<199&&safeWindow()){
    if(summarizeDataset(dataset,target).every(row=>row.complete)){state.pending='target_reached';break;}
    let entry=CASES[dataset.cursor++%CASES.length];
    const count=dataset.samples.filter(row=>row.category===entry.id&&row.http===200).length;
    if(count>=target||entry.model&&(!allowModel||budget.modelCalls>=maxModelCalls||usage?.available!==true||!(usage.remaining>2))){
      if(++skips>=CASES.length*2){state.pending='model_or_sample_budget';break;}
      continue;
    }
    // Context remains in memory for this run; a resumed follow-up is seeded
    // again rather than persisting a conversation in the benchmark artifact.
    if(entry.id==='followup'&&!context)entry=CASES.find(row=>row.id==='housing');
    const beforeUsed=numeric(usage?.used);
    if(entry.model)budget.modelCalls++; // Reserve before network; unknown outcomes consume the soft budget.
    let result;
    try { result=await request(entry.path,{...entry.body,...(entry.id==='followup'?{conversation:context}:{})}); }
    catch { dataset.transportErrors??={};dataset.transportErrors[entry.id]=(dataset.transportErrors[entry.id]??0)+1;state.pending='request_failed';await persist(state);break; }
    const {response,data,wallMs}=result;
    completed++;skips=0;
    if(entry.id==='housing')context=data.conversation??null;
    const generationStatus=GEN.has(data.generation?.status)?data.generation.status:null;
    const afterUsed=numeric(data.aiUsage?.used);
    const modelAttempt=generationStatus==='used'||beforeUsed!==null&&afterUsed!==null&&afterUsed>beforeUsed;
    if(entry.model&&['skipped','disabled'].includes(generationStatus))budget.modelCalls--;
    else if(!entry.model&&modelAttempt)budget.modelCalls++;
    if(data.aiUsage)usage=data.aiUsage;
    const responseGeneration=response.headers.get('X-TampaBayBot-Generation');
    if(responseGeneration&&responseGeneration!==generation){state.pending='generation_changed';break;}
    const stages={};
    for(const match of (response.headers.get('Server-Timing')??'').matchAll(/(?:^|,\s*)([a-z]+);dur=([\d.]+)/g)){
      const value=Number(match[2]);if(STAGES.has(match[1])&&Number.isFinite(value)&&value<=600000)stages[match[1]]=value;
    }
    dataset.samples.push({category:entry.id,http:response.status,status:STATUSES.has(data.status)?data.status:'unknown',wallMs,stages,
      epochVerified:responseGeneration===generation,
      generation:generationStatus,modelAttempt,citationMarkersValid:entry.path==='/api/ask'&&response.ok?citationMarkersValid(data):null,
      evidenceCount:Array.isArray(data.evidence)?data.evidence.length:null,recordsCount:Array.isArray(data.records)?data.records.length:null,
      contextUsed:entry.id==='followup'?data.conversationUsed===true:null,noStore:response.headers.get('Cache-Control')?.includes('no-store')===true});
    dataset.summary=summarizeDataset(dataset,target);await persist(state);
    if(dataset.samples.at(-1).citationMarkersValid===false){state.pending='citation_validation_failed';break;}
    if(response.status===429){state.pending='rate_limit';break;}
    if(!response.ok){state.pending='request_failed';break;}
  }
  if(completed>0){
    try {
      const finalHealth=await request('/api/health');
      if(finalHealth.data.generation!==generation){dataset.samples.splice(originalSamples);state.pending='generation_changed';}
      else for(const row of dataset.samples.slice(originalSamples))row.epochVerified=true;
    } catch { dataset.samples.splice(originalSamples);state.pending='validation_incomplete'; }
  }
  dataset.summary=summarizeDataset(dataset,target);
  if(dataset.summary.every(row=>row.complete))state.pending='target_reached';
  state.pending??=!safeWindow()?'utc_day_boundary':budget.requests>=199?'daily_request_budget':'run_sample_budget';
  await persist(state);return state;
}

async function main(){
  const {values}=parseArgs({options:{'allow-network':{type:'boolean'},'allow-model':{type:'boolean'},
    base:{type:'string',default:'https://tampabaybot-housing-preview.pages.dev/'},output:{type:'string',default:'work/performance-collection/state.json'},
    samples:{type:'string',default:'100'},target:{type:'string',default:'100'}}});
  if(!values['allow-network'])throw new Error('Live benchmark requires --allow-network.');
  const output=resolve(values.output),work=resolve('work');
  if(!output.startsWith(work+sep)||relative(work,output).startsWith('..'))throw new Error('Keep benchmark state under work/.');
  let state;try{state=JSON.parse(await readFile(output,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  await mkdir(dirname(output),{recursive:true});
  const result=await collectDeployed({base:values.base,state,revision:process.env.TAMPABAYBOT_BENCHMARK_RELEASE||'unspecified',notBefore:process.env.TAMPABAYBOT_BENCHMARK_START_DATE||undefined,maxSamples:Number(values.samples),target:Number(values.target),allowModel:values['allow-model']===true,
    persist:state=>saveBenchmarkState(output,state)});
  console.log(JSON.stringify({pending:result.pending,dayBudget:result.days[new Date().toISOString().slice(0,10)],summary:result.datasets[result.activeDataset]?.summary},null,2));
  if(['request_failed','validation_incomplete','citation_validation_failed'].includes(result.pending))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{
  console.error(JSON.stringify({status:'benchmark_stopped',type:['Error','TypeError','SyntaxError','TimeoutError','AbortError'].includes(error.name)?error.name:'Error',
    code:typeof error.code==='string'&&/^[A-Z_0-9]{1,40}$/.test(error.code)?error.code:null}));
  process.exitCode=1;
});
