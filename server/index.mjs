import express from 'express';
import multer from 'multer';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSession, equalSecret, verifySession } from './auth.mjs';

const app=express();
const host=process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
const port=Number(process.env.PORT || 4173);
const secret=process.env.APP_ACCESS_TOKEN || '';
const apiToken=process.env.BACKEND_API_TOKEN || '';
const backend=process.env.BACKEND_URL || 'https://miitelcallmeterapi.onrender.com';
const demo=process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production' && host === '127.0.0.1';
const configured=secret.length>=32 && apiToken.length>=32;
const adminCandidate=process.env.ADMIN_ACCESS_TOKEN||'';
const admin=adminCandidate.length>=32&&adminCandidate!==secret&&adminCandidate!==apiToken?adminCandidate:'';
const importEnabled=process.env.ENABLE_CDR_IMPORT === 'true' && !demo;
const cookieName='callmeter_session';
const secureCookie=process.env.NODE_ENV==='production' || Boolean(process.env.RENDER);
const cookieOptions={httpOnly:true,sameSite:'strict',secure:secureCookie,path:'/',maxAge:8*60*60*1000};
const loginAttempts=new Map();
app.disable('x-powered-by');
app.set('trust proxy',1);
app.use(express.json({limit:'64kb'}));
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'");
  if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
  next();
});
function readCookie(req){
  return (req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
}
function adminIn(req){return configured&&Boolean(admin)&&verifySession(readCookie(req),admin);}
function signedIn(req){return demo || (configured && (adminIn(req)||verifySession(readCookie(req),secret)));}
function requireAuth(req,res,next){if(!signedIn(req))return res.status(401).json({message:'Please sign in'});next();}
function sameOrigin(req,res,next){
  if(demo || !req.headers.origin)return next();
  if(req.headers.origin!==`${req.protocol}://${req.get('host')}`)return res.status(403).json({message:'Origin not allowed'});
  next();
}
app.get('/health',(_req,res)=>res.json({status:'ok',configured,ratingMode:'SIMULATION_ONLY'}));
app.get('/api/session',(req,res)=>res.json({authenticated:signedIn(req),configured:configured||demo,demo,importEnabled,masterWriteEnabled:!demo&&adminIn(req),maxUploadBytes:32*1024*1024,deployment:'node'}));
app.post('/api/auth/login',sameOrigin,(req,res)=>{
  if(!configured)return res.status(503).json({message:'Application access is not configured'});
  const key=req.ip||'unknown', now=Date.now();
  const old=loginAttempts.get(key);
  const record=old && old.until>now ? old : {count:0,until:now+10*60*1000};
  if(record.count>=5)return res.status(429).json({message:'Too many attempts. Try again in 10 minutes.'});
  const adminLogin=Boolean(admin)&&equalSecret(req.body?.token,admin);
  if(!adminLogin&&!equalSecret(req.body?.token,secret)){
    record.count++; loginAttempts.set(key,record);
    return res.status(401).json({message:'Invalid access key'});
  }
  loginAttempts.delete(key);
  res.cookie(cookieName,createSession(adminLogin?admin:secret),cookieOptions);
  res.json({authenticated:true});
});
app.post('/api/auth/logout',sameOrigin,(_req,res)=>{
  res.clearCookie(cookieName,{httpOnly:true,sameSite:'strict',secure:secureCookie,path:'/'});
  res.json({authenticated:false});
});

// Synthetic aggregate for design preview. No customer data in the repository.
// Only explicitly enabled local demo mode displays it.
const snapshot=[{
  company_key:'demo-company',source_reference:'sample-cdr.xlsx',
  first_source_call_at:'2026-08-01T09:00:00',last_source_call_at:'2026-08-31T16:00:00',
  total_cdr:28000,skipped_no_usage:22600,simulated_cdrs:5100,held_selling_cdrs:300,
  simulated_vendor_cdrs:5100,paid_source_matches:5100,charge_mismatches:0,
  source_call_charge:'12600000.00000000',simulated_call_charge:'11900000.00000000',
  held_source_call_charge:'700000.00000000',covered_vendor_cost:'3900000.00000000',
  covered_selling:'11900000.00000000',covered_simulated_gross_profit:'8000000.00000000',
  registered_vendor_cost:'3900000.00000000',missing_vendor_cost_cdrs:300,vendor_cost_priced_cdrs:5100,
  covered_simulated_gross_margin_pct:'67.23',billing_status:'SIMULATION_ONLY'
}];

async function proxy(res,path,options={}){
  if(!configured)return res.status(503).json({message:'Backend connection is not configured'});
  try{
    const target=new URL(path,backend.endsWith('/')?backend:backend+'/');
    if(target.protocol!=='https:' && !(target.protocol==='http:' && ['localhost','127.0.0.1'].includes(target.hostname)))
      return res.status(503).json({message:'Backend URL must use HTTPS'});
    const response=await fetch(target,{
      ...options,
      headers:{...options.headers,Authorization:`Bearer ${apiToken}`},
      redirect:'error',signal:AbortSignal.timeout(120000)
    });
    const parsed=await response.json().catch(()=>null);
    if(!response.ok){
      const safe=typeof parsed?.message==='string' && parsed.message.length<180 ? parsed.message : 'Backend request failed';
      return res.status(response.status).json({message:safe});
    }
    if(parsed===null)return res.status(502).json({message:'Backend returned an invalid response'});
    res.json(parsed);
  }catch{return res.status(502).json({message:'Could not reach CallMeter API. Please retry.'});}
}
app.get('/api/summary',requireAuth,(req,res)=>{
  const company=typeof req.query.company==='string'?req.query.company:'';
  if(demo)return res.json(snapshot.filter(row=>!company||row.company_key===company));
  const qs=new URLSearchParams();if(company)qs.set('company',company);
  return proxy(res,'call-charge/summary?'+qs);
});
app.get('/api/cdrs',requireAuth,(req,res)=>{
  if(demo)return res.json([]);
  const qs=new URLSearchParams();
  for(const key of ['company','status','limit','offset'])if(typeof req.query[key]==='string')qs.set(key,req.query[key]);
  return proxy(res,'call-charge/cdrs?'+qs);
});
for(const resource of ['customers','numbers']){
  app.get('/api/master/'+resource,requireAuth,(req,res)=>{
    if(demo)return res.json({rows:[],hasMore:false});
    const qs=new URLSearchParams();
    for(const key of ['q','limit','offset','status',...(resource==='numbers'?['vendor','type','country','area','ownership','condition','availability','usage','migration','sli','variant','grade']:[])])if(typeof req.query[key]==='string')qs.set(key,req.query[key]);
    return proxy(res,'master/'+resource+'?'+qs);
  });
}
app.post('/api/master/customers',sameOrigin,requireAuth,(req,res)=>{
  if(demo||!adminIn(req))return res.status(403).json({message:'Admin access required'});
  return proxy(res,'master/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req.body)});
});
app.get('/api/master/number-details',requireAuth,(req,res)=>{
  if(demo)return res.status(404).json({message:'Number not found'});
  const qs=new URLSearchParams();if(typeof req.query.id==='string')qs.set('id',req.query.id);
  return proxy(res,'master/number-details?'+qs);
});
app.get('/api/master/workspace',requireAuth,(req,res)=>{
  const resource=req.query.resource;
  if(!['number-options','area-options','catalog','pricing-options','pricing-record','active-cdrs'].includes(resource))return res.status(405).json({message:'Method not allowed'});
  if(demo)return res.json(resource==='catalog'||resource==='active-cdrs'?{rows:[],hasMore:false}:resource==='area-options'?[]:resource==='pricing-record'?null:{vendors:[],types:[],countries:[],variants:[],grades:[],customers:[],teams:[],migrationOptions:[],destinations:[],zones:[],numbers:[],areas:[],sources:[],standard:[],draftProtectionReady:false});
  const qs=new URLSearchParams();for(const key of ['q','country','kind','status','limit','offset','id','company','assume_jakarta','direction'])if(typeof req.query[key]==='string')qs.set(key,req.query[key]);
  return proxy(res,'master/'+resource+'?'+qs);
});
app.post('/api/master/workspace',sameOrigin,requireAuth,(req,res)=>{
  if(demo||(req.query.resource!=='rating-simulate'&&!adminIn(req)))return res.status(403).json({message:'Admin access required'});
  if(!['number-actions','vendor-save','pricing-save','pricing-lifecycle','rating-simulate'].includes(req.query.resource))return res.status(405).json({message:'Method not allowed'});
  return proxy(res,'master/'+req.query.resource,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req.body)});
});
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:32*1024*1024,files:1,fields:2}});
function uploadProxy(mode){
  return (req,res)=>{
    if(demo)return res.status(503).json({message:'Connect the live API to preview an upload'});
    if(mode==='import-upload' && !importEnabled)return res.status(403).json({message:'Import is disabled for this deployment'});
    if(!req.file || !req.body?.companyKey || !/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(req.body.companyKey))
      return res.status(400).json({message:'Company key and CDR file required'});
    const form=new FormData();
    form.append('companyKey',req.body.companyKey);
    form.append('file',new Blob([req.file.buffer]),req.file.originalname);
    return proxy(res,'cdr/'+mode,{method:'POST',body:form});
  };
}
app.post('/api/cdr/preview-upload',sameOrigin,requireAuth,upload.single('file'),uploadProxy('preview-upload'));
app.post('/api/cdr/import-upload',sameOrigin,requireAuth,upload.single('file'),uploadProxy('import-upload'));
app.use('/api',(_req,res)=>res.status(404).json({message:'Unknown endpoint'}));
const dist=resolve(fileURLToPath(new URL('../dist',import.meta.url)));
app.use(express.static(dist,{index:false}));
app.get(/.*/,(req,res)=>res.sendFile(resolve(dist,'index.html')));
app.use((err,_req,res,_next)=>{
  if(err instanceof multer.MulterError)return res.status(400).json({message:'Invalid upload or file exceeds 32 MB'});
  res.status(500).json({message:'Unexpected server error'});
});
app.listen(port,host,()=>console.log(`CallMeter Web listening on http://${host}:${port}`));
