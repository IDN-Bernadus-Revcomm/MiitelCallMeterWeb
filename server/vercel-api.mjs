import { createSession, equalSecret, verifySession } from './auth.mjs';

const cookieName='callmeter_session';
const attempts=new Map();
const expires=8*60*60;
const baseHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
function reply(data,status=200,headers={}){
  return Response.json(data,{status,headers:{...baseHeaders,...headers}});
}
function cookieValue(request){
  return (request.headers.get('cookie')||'').split(';').map(v=>v.trim())
    .find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
}
function sessionHeader(value,maxAge){
  return `${cookieName}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}
function config(){
  const secret=process.env.APP_ACCESS_TOKEN||'';
  const apiToken=process.env.BACKEND_API_TOKEN||'';
  const admin=process.env.ADMIN_ACCESS_TOKEN||'';
  return {
    secret,apiToken,admin:admin.length>=32&&admin!==secret&&admin!==apiToken?admin:'',configured:secret.length>=32&&apiToken.length>=32,
    backend:process.env.BACKEND_URL||'https://miitelcallmeterapi.onrender.com',
    importEnabled:process.env.ENABLE_CDR_IMPORT==='true',
    // Reserve space for multipart overhead below Vercel's request limit.
    maxUploadBytes:process.env.VERCEL_SUPPORT_LARGE_REQUEST_BODY==='1' ? 19*1024*1024 : 4*1024*1024
  };
}
async function proxy(cfg,path,options={}){
  try{
    const destination=new URL(path,cfg.backend.endsWith('/')?cfg.backend:cfg.backend+'/');
    if(destination.protocol!=='https:')return reply({message:'Backend URL must use HTTPS'},503);
    const response=await fetch(destination,{
      ...options,headers:{...options.headers,Authorization:`Bearer ${cfg.apiToken}`},
      redirect:'error',signal:AbortSignal.timeout(110000)
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok)return reply({
      message:typeof data?.message==='string'&&data.message.length<180?data.message:'Backend request failed'
    },response.status);
    if(data===null)return reply({message:'Backend returned an invalid response'},502);
    return reply(data);
  }catch{return reply({message:'Could not reach CallMeter API. Please retry.'},502);}
}

// Each Vercel function supplies a fixed route; there is no open proxy.
export async function handleVercelRequest(request,route){
  const cfg=config();
  const url=new URL(request.url);
  const isAdmin=cfg.configured&&Boolean(cfg.admin)&&verifySession(cookieValue(request),cfg.admin);
  const authed=cfg.configured&&(isAdmin||verifySession(cookieValue(request),cfg.secret));
  const isPost=request.method==='POST';
  const origin=request.headers.get('origin');
  if(isPost&&origin&&origin!==url.origin)return reply({message:'Origin not allowed'},403);
  if(route==='session'&&request.method==='GET')return reply({
    authenticated:authed,configured:cfg.configured,demo:false, masterWriteEnabled:isAdmin,
    importEnabled:cfg.importEnabled,maxUploadBytes:cfg.maxUploadBytes,deployment:'vercel'
  });
  if(route==='health'&&request.method==='GET')return reply({status:'ok',configured:cfg.configured,ratingMode:'SIMULATION_ONLY'});
  if(route==='login'&&isPost){
    if(!cfg.configured)return reply({message:'Application access is not configured'},503);
    const key=(request.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim();
    const now=Date.now();
    const previous=attempts.get(key);
    const record=previous&&previous.until>now?previous:{count:0,until:now+10*60*1000};
    if(record.count>=5)return reply({message:'Too many attempts. Try again in 10 minutes.'},429);
    const body=await request.json().catch(()=>null);
    const adminLogin=Boolean(cfg.admin)&&equalSecret(body?.token,cfg.admin);
    if(!adminLogin&&!equalSecret(body?.token,cfg.secret)){
      record.count++;attempts.set(key,record);
      return reply({message:'Invalid access key'},401);
    }
    attempts.delete(key);
    return reply({authenticated:true},200,{'Set-Cookie':sessionHeader(createSession(adminLogin?cfg.admin:cfg.secret),expires)});
  }
  if(route==='logout'&&isPost)return reply({authenticated:false},200,{'Set-Cookie':sessionHeader('',0)});
  if(!authed)return reply({message:'Please sign in'},401);
  if(route==='master-workspace'){
    const resource=url.searchParams.get('resource');
    if(['number-actions','vendor-save'].includes(resource)&&isPost){
      if(!isAdmin)return reply({message:'Admin access required'},403);
      const body=await request.json().catch(()=>null);if(!body||typeof body!=='object'||Array.isArray(body))return reply({message:'Invalid number data'},400);
      return proxy(cfg,'master/'+resource,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    }
    if(request.method!=='GET'||!['number-options','area-options','catalog'].includes(resource))return reply({message:'Method not allowed'},405);
    const query=new URLSearchParams();for(const key of ['q','country','kind','status','limit','offset']){const value=url.searchParams.get(key);if(value!==null)query.set(key,value);}
    return proxy(cfg,'master/'+resource+'?'+query);
  }
  if(route==='number-details'&&request.method==='GET'){
    const query=new URLSearchParams();const id=url.searchParams.get('id');if(id!==null)query.set('id',id);
    return proxy(cfg,'master/number-details?'+query);
  }
  if(route==='customers'&&isPost){
    if(!isAdmin)return reply({message:'Admin access required'},403);
    const body=await request.json().catch(()=>null);
    if(!body||typeof body!=='object'||Array.isArray(body))return reply({message:'Invalid customer data'},400);
    return proxy(cfg,'master/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  }
  if((route==='customers'||route==='numbers')&&request.method==='GET'){
    const query=new URLSearchParams();
    for(const key of ['q','limit','offset','status',...(route==='numbers'?['vendor','type','country','area','ownership','condition','availability','usage','migration','sli','variant','grade']:[])]){const value=url.searchParams.get(key);if(value!==null)query.set(key,value);}
    return proxy(cfg,'master/'+route+'?'+query);
  }
  if(route==='summary'&&request.method==='GET'){
    const query=new URLSearchParams();
    const company=url.searchParams.get('company');if(company)query.set('company',company);
    return proxy(cfg,'call-charge/summary?'+query);
  }
  if(route==='cdrs'&&request.method==='GET'){
    const query=new URLSearchParams();
    for(const key of ['company','status','limit','offset']){
      const value=url.searchParams.get(key);if(value!==null)query.set(key,value);
    }
    return proxy(cfg,'call-charge/cdrs?'+query);
  }
  if((route==='preview-upload'||route==='import-upload')&&isPost){
    if(route==='import-upload'&&!cfg.importEnabled)return reply({message:'Import is disabled for this deployment'},403);
    const form=await request.formData().catch(()=>null);
    const file=form?.get('file'),company=form?.get('companyKey');
    if(!(file instanceof File)||typeof company!=='string'||!/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(company))
      return reply({message:'Company key and CDR file required'},400);
    if(file.size>cfg.maxUploadBytes)return reply({message:'File exceeds this deployment upload limit'},413);
    const outgoing=new FormData();outgoing.append('companyKey',company);outgoing.append('file',file,file.name);
    return proxy(cfg,'cdr/'+route,{method:'POST',body:outgoing});
  }
  return reply({message:'Method not allowed'},405);
}
