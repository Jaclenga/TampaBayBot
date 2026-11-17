import test from 'node:test';
import assert from 'node:assert/strict';
import {smallTalkReply} from '../src/lib/core/small-talk.mjs';
import {answerResidentQuestion} from '../src/lib/core/resident.mjs';
import {JURISDICTIONS} from '../src/lib/coverage.mjs';
import {makeDemoCorpus} from './fixtures/demo-corpus.mjs';
import {createTimings} from '../src/lib/performance/timing.mjs';
import {parseLlmConfig} from '../src/lib/llm/index.mjs';

const now=new Date('2026-11-17T12:00:00Z'),corpus=makeDemoCorpus(now);
const options={...corpus,now,config:parseLlmConfig({LLM_PROVIDER:'none'})};
for(const [message,area,label] of [['hey','tampa','Tampa'],['hello','st-petersburg','St. Petersburg'],['hi','tampa-bay','Tampa Bay']]){
  test(`${message} uses the selected ${label} jurisdiction without retrieval or inference`,async()=>{
    const timings=createTimings();
    const result=await answerResidentQuestion(message,{...options,jurisdictionId:area,timings,
      chunks:new Proxy(corpus.chunks,{get(){throw new Error('Greeting must not scan passages');}}),
      config:parseLlmConfig({LLM_PROVIDER:'ollama',LLM_BASE_URL:'http://127.0.0.1:11434',LLM_MODEL:'fixture'}),
      provider:{complete(){throw new Error('Greeting must not call a model');}}});
    assert.equal(result.answer,`Hi! What would you like to know about ${label}?`);
    assert.equal(result.jurisdictionId,area);assert.deepEqual(result.evidence,[]);
    assert.equal(result.coverage,undefined);assert.equal(timings.snapshot().retrieval,undefined);
    assert.equal(result.generation.status,'skipped');
  });
}
test('all configured areas use their existing labels, with a plain fallback for unknown areas',()=>{
  for(const area of JURISDICTIONS)assert.equal(smallTalkReply('good morning','en',area.id),`Hi! What would you like to know about ${area.label}?`);
  for(const area of [null,'unknown'])assert.equal(smallTalkReply('hi','en',area),'Hi! What would you like to know about local housing or property information?');
  assert.equal(smallTalkReply('hola','es','st-petersburg'),'¡Hola! ¿Qué le gustaría saber sobre St. Petersburg?');
  assert.match(smallTalkReply('hola','es','pinellas-county'),/Condado de Pinellas/);
});
test('mixed greetings retain ordinary factual and explicit-city routing',async()=>{
  for(const question of ['hey, what permits are near me?','Hey, can you tell me about building permits in St. Pete?']){
    assert.equal(smallTalkReply(question,'en','st-petersburg'),null);
    const result=await answerResidentQuestion(question,{...options,jurisdictionId:'st-petersburg'});
    assert.equal(result.category,'permitting');assert.equal(result.jurisdictionId,'st-petersburg');
    assert.doesNotMatch(result.answer,/^Hi!/);
  }
  const conflict=await answerResidentQuestion('Where can I find rental assistance in Tampa?',{...options,jurisdictionId:'st-petersburg'});
  assert.equal(conflict.needsJurisdiction,true);
  assert.ok(!conflict.evidence.some(item=>item.source_id==='demo-clearwater'));
});
test('casual replies preserve the active compact context and do not consume follow-up turns',async()=>{
  const seed=await answerResidentQuestion('Where can I find rental assistance in Tampa?',{...options,jurisdictionId:'tampa'});
  assert.ok(seed.conversation);
  for(const question of ['hello','thank you','bye']){
    const reply=await answerResidentQuestion(question,{...options,jurisdictionId:'tampa',conversation:seed.conversation});
    assert.deepEqual(reply.conversation,seed.conversation);
    assert.equal(reply.conversationUsed,false);
    if(question==='hello')assert.match(reply.answer,/^Hi again!/);
    const followup=await answerResidentQuestion('What documents do I need?',{...options,jurisdictionId:'tampa',conversation:reply.conversation});
    assert.equal(followup.conversationUsed,true);assert.equal(followup.conversation?.turns,seed.conversation.turns+1);
  }
  const moved=await answerResidentQuestion('hello',{...options,jurisdictionId:'st-petersburg',conversation:seed.conversation});
  assert.equal(moved.conversation,null);assert.match(moved.answer,/St\. Petersburg/);
});
test('a first greeting neither fabricates a topic nor prevents a subsequent factual conversation',async()=>{
  const hello=await answerResidentQuestion('hi',{...options,jurisdictionId:'tampa'});
  assert.equal(hello.conversation,null);
  const factual=await answerResidentQuestion('Where can I find rental assistance?',{...options,jurisdictionId:'tampa',conversation:hello.conversation});
  assert.ok(factual.conversation);assert.ok(factual.evidence.length);
});
