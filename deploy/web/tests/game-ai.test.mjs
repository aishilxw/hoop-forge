import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forwardGameAi } from '../lib/game-ai.mjs';
const origin='https://game.example';
const make=(path='/coach',body='{"context":{}}',headers={})=>new Request(origin+'/api/ai'+path,{method:'POST',headers:{origin,'content-type':'application/json',...headers},body});
test('fixed relay, cookie device and no model credentials are forwarded',async()=>{
 let init;
 const response=await forwardGameAi(make('/coach',undefined,{cookie:'hf_review_device=device-1234567890123456',authorization:'Bearer never-forward'}),{REVIEW_BUILD_ID:'review-identifier'},{fetchImpl:async(url,options)=>{assert.equal(url,'https://hoop-forge-interview-ai.artfulpika132.chatgpt.site/api/ai/coach');init=options;return Response.json({advice:{headline:'建议'}});}});
 assert.equal(response.status,200);assert.equal(init.headers['x-hoop-forge-device'],'device-1234567890123456');assert.equal(init.headers.Authorization,undefined);assert.equal(init.headers.authorization,undefined);assert.equal(init.redirect,'manual');assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
});
test('cross origin and oversized requests never reach upstream',async()=>{
 let calls=0;const options={fetchImpl:async()=>{calls++;return Response.json({});}};
 assert.equal((await forwardGameAi(make('/coach',undefined,{origin:'https://evil.example'}),{REVIEW_BUILD_ID:'review'},options)).status,403);
 assert.equal((await forwardGameAi(make('/coach','x'.repeat(24577)),{REVIEW_BUILD_ID:'review'},options)).status,413);
 assert.equal(calls,0);
});
test('upstream JSON limits are retained and HTML cannot masquerade as AI',async()=>{
 const env={REVIEW_BUILD_ID:'review'};
 const r=await forwardGameAi(make(),env,{fetchImpl:async()=>Response.json({error:'DEMO_EXPIRED'},{status:403})});assert.equal(r.status,403);assert.equal((await r.json()).error,'DEMO_EXPIRED');
 const bad=await forwardGameAi(make(),env,{fetchImpl:async()=>new Response('<html>sign in</html>',{headers:{'content-type':'text/html'}})});assert.equal(bad.status,503);
 const redirect=await forwardGameAi(make(),env,{fetchImpl:async()=>Response.json({},{status:307,headers:{location:'https://other.example'}})});assert.equal(redirect.status,503);
});
test('status creates a device cookie and unavailable configuration is explicit',async()=>{
 const request=new Request(origin+'/api/ai/status');assert.equal((await forwardGameAi(request,{})).status,503);
 const r=await forwardGameAi(request,{REVIEW_BUILD_ID:'review'},{fetchImpl:async()=>Response.json({configured:true,mode:'shared'})});assert.match(r.headers.get('set-cookie'),/hf_review_device=[0-9a-f-]{36}/);
});
