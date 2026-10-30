import {createHash,randomUUID} from 'node:crypto';
import {createAiService,validateFacts,validateCoachContext,AiError} from './hoop-forge/ai.mjs';
import {REPORT_PROMPT_VERSION,COACH_PROMPT_VERSION} from './hoop-forge/ai-prompts.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const digest=value=>createHash('sha256').update(value).digest('hex');
const int=(value,fallback,max)=>{const n=Number(value);return Number.isInteger(n)&&n>0&&n<=max?n:fallback;};
export function reviewSettings(env){return{session:env.REVIEW_SESSION_ID||'interview-v1',enabled:env.REVIEW_ENABLED==='true',expires:Date.parse(env.REVIEW_EXPIRES_AT||''),total:int(env.REVIEW_TOTAL_LIMIT,500,2000),daily:int(env.REVIEW_DAILY_LIMIT,100,500),deviceDaily:int(env.REVIEW_DEVICE_DAILY_LIMIT,30,100),minute:6,concurrent:3,model:env.DEEPSEEK_MODEL||'deepseek-flash'};}
function access(request,env,now){
 const cfg=reviewSettings(env);
 if(!cfg.enabled)throw new AiError('DEMO_DISABLED',503);
 if(!Number.isFinite(cfg.expires)||now>=cfg.expires)throw new AiError('DEMO_EXPIRED',403);
 const build=request.headers.get('x-hoop-forge-build')||'';
 if(!env.REVIEW_BUILD_ID||!build||digest(build)!==digest(env.REVIEW_BUILD_ID))throw new AiError('DEMO_ACCESS_DENIED',403);
 if(!env.DB||!env.DEEPSEEK_API_KEY)throw new AiError('SHARED_UNAVAILABLE',503);
 return cfg;
}
async function readJson(request){
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AiError('INVALID_REQUEST',415);
 const reader=request.body?.getReader();if(!reader)throw new AiError('INVALID_REQUEST',400);
 const chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>24576){await reader.cancel();throw new AiError('INVALID_REQUEST',413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new AiError('INVALID_REQUEST',400);}
}
export async function reserveRequest(db,{cfg,clientHash,fingerprint,now,id}){
 const day=Math.floor(now/86400000)*86400000,minute=now-60000,lease=now-90000;
 const sql=`INSERT INTO review_requests (id,session,client_hash,fingerprint,created_at)
 SELECT ?,?,?,?,? WHERE
 (SELECT COUNT(*) FROM review_requests WHERE session=?) < ? AND
 (SELECT COUNT(*) FROM review_requests WHERE session=? AND created_at>=?) < ? AND
 (SELECT COUNT(*) FROM review_requests WHERE session=? AND client_hash=? AND created_at>=?) < ? AND
 (SELECT COUNT(*) FROM review_requests WHERE session=? AND client_hash=? AND created_at>=?) < ? AND
 (SELECT COUNT(*) FROM review_requests WHERE session=? AND finished_at IS NULL AND created_at>?) < ? AND
 NOT EXISTS (SELECT 1 FROM review_requests WHERE session=? AND fingerprint=? AND finished_at IS NULL AND created_at>?)`;
 const r=await db.prepare(sql).bind(id,cfg.session,clientHash,fingerprint,now,cfg.session,cfg.total,cfg.session,day,cfg.daily,cfg.session,clientHash,day,cfg.deviceDaily,cfg.session,clientHash,minute,cfg.minute,cfg.session,lease,cfg.concurrent,cfg.session,fingerprint,lease).run();
 if(r.meta?.changes===1)return true;
 const counts=await db.prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(created_at>=?),0) AS daily,COALESCE(SUM(client_hash=? AND created_at>=?),0) AS device_daily FROM review_requests WHERE session=?`).bind(day,clientHash,day,cfg.session).first();
 if(counts.total>=cfg.total||counts.daily>=cfg.daily)throw new AiError('DEMO_LIMIT_REACHED',429);
 if(counts.device_daily>=cfg.deviceDaily)throw new AiError('DEMO_DEVICE_LIMIT',429);
 throw new AiError('BUSY',429);
}
export async function handleReviewRequest(request,env,{now=()=>Date.now(),fetchImpl=fetch}={}){
 let requestId=null,metrics=null,outcome='SHARED_UNAVAILABLE';
 try{
  const time=now(),cfg=access(request,env,time),path=new URL(request.url).pathname;
  if(path==='/api/ai/status'&&request.method==='GET')return json({configured:true,model:cfg.model,mode:'shared',expiresAt:new Date(cfg.expires).toISOString()});
  const kind=path==='/api/ai/coach'?'coach':path==='/api/ai/career-report'?'report':null;
  if(!kind)return json({error:'NOT_FOUND'},404);
  if(request.method!=='POST')return json({error:'METHOD_NOT_ALLOWED'},405);
  const device=request.headers.get('x-hoop-forge-device')||'';
  if(!/^[a-zA-Z0-9-]{16,100}$/.test(device))throw new AiError('INVALID_REQUEST',400);
  const body=await readJson(request),context=kind==='coach'?validateCoachContext(body?.context):validateFacts(body?.facts);
  const promptVersion=kind==='coach'?COACH_PROMPT_VERSION:REPORT_PROMPT_VERSION;
  const fingerprint=digest(JSON.stringify({session:cfg.session,kind,model:cfg.model,promptVersion,context}));
  const stored=await env.DB.prepare('SELECT payload FROM review_cache WHERE key=? AND expires_at>?').bind(fingerprint,time).first();
  if(stored){try{const saved=JSON.parse(stored.payload);return json({...saved,...(kind==='coach'?{context}:{facts:context}),servedFromCache:true});}catch{await env.DB.prepare('DELETE FROM review_cache WHERE key=?').bind(fingerprint).run();}}
  const id=randomUUID();await reserveRequest(env.DB,{cfg,clientHash:digest(cfg.session+':'+device),fingerprint,now:time,id});requestId=id;
  const service=createAiService({env:{DEEPSEEK_API_KEY:env.DEEPSEEK_API_KEY,DEEPSEEK_MODEL:cfg.model},fetchImpl});
  let result;
  try{result=kind==='coach'?await service.coach(context):await service.generate(context);}finally{metrics=service.metrics().events.at(-1)?.metrics??null;}
  outcome='ok';
  const {facts:unusedFacts,context:unusedContext,...cachePayload}=result;
  try{await env.DB.prepare('INSERT INTO review_cache (key,payload,expires_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at').bind(fingerprint,JSON.stringify(cachePayload),Math.min(cfg.expires,time+86400000)).run();}catch{/* A cache failure must not discard a paid successful response. */}
  return json(result);
 }catch(error){
  outcome=error instanceof AiError?error.code:'SHARED_UNAVAILABLE';
  const safe=['AUTH_FAILED','PAYMENT_REQUIRED','KEY_MISSING'].includes(outcome)?'SHARED_UNAVAILABLE':outcome;
  return json({error:safe},error instanceof AiError?error.status:503);
 }finally{
  if(requestId){try{await env.DB.prepare('UPDATE review_requests SET finished_at=?,outcome=?,input_tokens=?,output_tokens=?,total_tokens=? WHERE id=?').bind(now(),outcome,metrics?.inputTokens??null,metrics?.outputTokens??null,metrics?.totalTokens??null,requestId).run();}catch{/* The reservation remains counted and its concurrency lease expires automatically. */}}
 }
}
