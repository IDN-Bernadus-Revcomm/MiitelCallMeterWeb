import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, ArrowDownToLine, ArrowDownRight, ArrowUpRight, BarChart3, Building2, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, CircleAlert, ClipboardList, CloudUpload, Database,
  FileSpreadsheet, Headphones, LayoutDashboard, LockKeyhole, LogOut, Menu, PhoneCall, RefreshCw,
  Search, ShieldCheck, Wallet, X
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import './styles.css';

type Page = 'overview' | 'cdrs' | 'upload';
type Amount = string | number | null | undefined;
type Summary = {
  company_key: string; source_reference: string; first_source_call_at?: string; last_source_call_at?: string;
  total_cdr: Amount; skipped_no_usage: Amount; simulated_cdrs: Amount; held_selling_cdrs: Amount;
  simulated_vendor_cdrs: Amount; paid_source_matches: Amount; charge_mismatches: Amount;
  source_call_charge: Amount; simulated_call_charge: Amount; held_source_call_charge: Amount;
  covered_vendor_cost: Amount; covered_selling: Amount; covered_simulated_gross_profit: Amount;
  covered_simulated_gross_margin_pct: Amount; billing_status: string;
};
type Session = { authenticated:boolean; configured:boolean; demo:boolean; importEnabled:boolean };
type RatedCdr = {
  miitel_cdr_id:string; source_reference:string; source_row_number:number; call_direction:string;
  call_outcome:string; call_duration_seconds:number|null; origin_type_code:string|null; destination_code:string|null;
  discount_code:string|null; vendor_rate_code:string|null; selling_rating_status:string; vendor_rating_status:string;
  source_call_charge:Amount; simulated_call_charge:Amount; simulated_vendor_cost:Amount; simulated_gross_profit:Amount;
};

const numberFormat = new Intl.NumberFormat('en-US');
const moneyFormat = new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0});
const num=(v:Amount) => Number.isFinite(Number(v)) ? Number(v) : 0;
const count=(v:Amount) => numberFormat.format(num(v));
const money=(v:Amount) => v===null || v===undefined ? '—' : moneyFormat.format(num(v)).replace('Rp\u00a0','Rp ');
const percent=(v:number) => Number.isFinite(v) ? v.toFixed(1)+'%' : '—';
const label=(s:string|null) => s ? s.replaceAll('_',' ').toLowerCase().replace(/^./,x=>x.toUpperCase()) : '—';
const displayDate=(v?:string) => v ? new Date(v.replace(' ','T').slice(0,10)+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—';
const pageNames:Record<Page,string>={overview:'Overview',cdrs:'CDR Explorer',upload:'Upload CDR'};
const nav:{page:Page;label:string;icon:LucideIcon}[]=[
  {page:'overview',label:'Overview',icon:LayoutDashboard},
  {page:'cdrs',label:'CDR Explorer',icon:ClipboardList},
  {page:'upload',label:'Upload CDR',icon:CloudUpload},
];

async function request<T>(url:string, options:RequestInit={}):Promise<T>{
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(typeof result?.message==='string'?result.message:'Request failed. Please retry.');
  return result as T;
}

function Brand({light=false}:{light?:boolean}){
  return <div className={'brand '+(light?'brand-light':'')}>
    <div className="brand-symbol"><svg viewBox="0 0 40 40" fill="none"><path d="M8 27l8-15 6 11 6-11 6 15" stroke="currentColor" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="21" cy="31" r="2" fill="currentColor"/></svg></div>
    <div><div className="brand-name">Call<span>Meter</span></div><div className="brand-subtitle">MIITEL • REVCOMM</div></div>
  </div>;
}
function Spinner(){return <span className="spinner" aria-label="Loading"/>}
function ErrorBox({message,onRetry}:{message:string;onRetry?:()=>void}){
  return <div className="error-box"><CircleAlert size={20}/><span>{message}</span>{onRetry&&<button className="text-button" onClick={onRetry}>Retry</button>}</div>;
}

function Login({configured,onLogin}:{configured:boolean;onLogin:()=>void}){
  const [token,setToken]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');
    try{await request('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});setToken('');onLogin();}
    catch(err){setError(err instanceof Error?err.message:'Unable to sign in');}finally{setBusy(false);}
  }
  return <main className="login-page">
    <section className="login-art"><Brand light/><div className="login-art-content"><div className="login-kicker">CALL CHARGE INTELLIGENCE</div><h1>Every call.<br/>Every charge.<br/><span>Clearly accounted for.</span></h1><p>A focused workspace for MiiTel CDR processing, rating and billing insights.</p><div className="login-orbit"><PhoneCall size={72} strokeWidth={1.3}/></div></div><div className="login-footnote"><ShieldCheck size={17}/> Private team workspace</div></section>
    <section className="login-form-area"><div className="login-card"><div className="login-icon"><LockKeyhole size={26}/></div><h2>Welcome back</h2><p>Enter your workspace access key to continue.</p>
      {!configured&&<ErrorBox message="Application access is not configured. Set the server environment variables first."/>}
      {error&&<ErrorBox message={error}/>}
      <form onSubmit={submit}><label htmlFor="access">Workspace access key</label><input id="access" type="password" autoComplete="current-password" placeholder="Enter your access key" value={token} onChange={e=>setToken(e.target.value)} required/><button className="primary-button full-width" disabled={busy||!configured||!token}>{busy?<Spinner/>:'Sign in'}</button></form>
      <div className="login-note"><ShieldCheck size={16}/> Secure access. Backend credentials stay on the server.</div>
    </div></section>
  </main>;
}

function MetricCard({title,value,detail,icon:Icon,tone}:{title:string;value:string;detail:string;icon:LucideIcon;tone:string}){
  return <article className={'metric-card '+tone}><div className="metric-top"><span>{title}</span><div className="metric-icon"><Icon size={21} strokeWidth={1.9}/></div></div><div className="metric-value" title={value}>{value}</div><div className="metric-detail">{detail}</div></article>;
}
function Hero({company,demo}:{company:string;demo:boolean}){
  return <section className="hero"><div className="hero-copy"><div className="hero-tag"><Activity size={14}/> CALL CHARGE WORKSPACE</div><h1>Welcome to CallMeter</h1><p>Monitor CDR rating, customer charges, vendor costs and margin — all in one place.</p><div className="hero-badges"><span><Building2 size={15}/>{company==='all'?'All customers':company}</span><span><ShieldCheck size={15}/>{demo?'Local design preview':'Simulation only'}</span></div></div>
    <div className="hero-art" aria-hidden="true"><svg viewBox="0 0 260 180" fill="none"><circle cx="143" cy="89" r="96" fill="white" opacity=".11"/><circle cx="143" cy="89" r="70" stroke="white" strokeOpacity=".24" strokeWidth="1.4"/><circle cx="143" cy="89" r="46" fill="white" opacity=".13"/><path d="M42 121l27-18 27 12 38-37 29 15 40-43" stroke="#c0edff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><circle cx="203" cy="50" r="5" fill="white"/><g transform="translate(125 53) rotate(12)"><rect width="62" height="100" rx="12" fill="#fff"/><rect x="7" y="10" width="48" height="77" rx="7" fill="#e0f5ff"/><path d="M18 61v-15m12 15V32m12 29V20" stroke="#0ea5e9" strokeLinecap="round" strokeWidth="6"/><circle cx="31" cy="94" r="2" fill="#0ea5e9"/></g><rect x="61" y="40" width="71" height="46" rx="10" fill="white" opacity=".98"/><path d="M75 64l7 7 13-15" stroke="#0eb59b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><path d="M101 58h20m-20 10h15" stroke="#a5c5d7" strokeWidth="3" strokeLinecap="round"/></svg></div>
  </section>;
}

function Overview({rows,loading,error,company,demo,onRetry,onExplore}:{rows:Summary[];loading:boolean;error:string;company:string;demo:boolean;onRetry:()=>void;onExplore:(company:string)=>void}){
  const sum=(key:keyof Summary)=>rows.reduce((a,r)=>a+num(r[key] as Amount),0);
  const total= sum('total_cdr'), simulated=sum('simulated_cdrs'), held=sum('held_selling_cdrs'), skipped=sum('skipped_no_usage');
  const source=sum('source_call_charge'), selling=sum('simulated_call_charge'), cost=sum('covered_vendor_cost'), profit=sum('covered_simulated_gross_profit');
  const eligible=simulated+held, coverage=eligible?simulated/eligible*100:0, margin= sum('covered_selling')?profit/sum('covered_selling')*100:0;
  const bars=[{label:'Reported source charge',value:source,color:'#0ea5e9'},
    {label:'Simulated call charge',value:selling,color:'#54b7ed'},
    {label:'Covered vendor cost',value:cost,color:'#f2ae58'},
    {label:'Simulated gross profit',value:profit,color:'#15b8a1'}];
  const max=Math.max(1,...bars.map(b=>b.value));
  return <div className="page-stack"><Hero company={company} demo={demo}/>
    {error&&<ErrorBox message={error} onRetry={onRetry}/>}
    {loading?<div className="loading-card"><Spinner/> Loading call charge summary…</div>:null}
    {!loading&&!error&&!rows.length&&<div className="empty-card"><Database/><h3>No CDR summary yet</h3><p>Upload a MiiTel CDR file or check the selected customer.</p></div>}
    {rows.length>0&&<>
      <div className="section-heading"><div><h2>Billing overview</h2><p>Reported amounts and simulated rating results</p></div><span className="section-label"><Activity size={15}/> {count(total)} CDR records</span></div>
      <div className="metrics-grid">
        <MetricCard title="Source call charge" value={money(source)} detail="Reported by MiiTel" icon={Wallet} tone="blue"/>
        <MetricCard title="Simulated selling" value={money(selling)} detail={count(simulated)+' rated CDRs'} icon={PhoneCall} tone="sky"/>
        <MetricCard title="Covered vendor cost" value={money(cost)} detail="Simulated matched calls only" icon={ArrowDownRight} tone="amber"/>
        <MetricCard title="Simulated gross profit" value={money(profit)} detail={percent(margin)+' covered margin'} icon={ArrowUpRight} tone="teal"/>
      </div>
      <div className="chart-grid">
        <section className="card"><div className="card-title"><div><h3>Call charge breakdown</h3><p>Amounts in Indonesian rupiah</p></div><div className="small-icon"><BarChart3 size={20}/></div></div><div className="bar-chart">{bars.map(b=><div key={b.label} className="bar-row"><div className="bar-meta"><span>{b.label}</span><strong>{money(b.value)}</strong></div><div className="bar-track"><div className="bar-fill" style={{width:`${b.value/max*100}%`,background:b.color}}/></div></div>)}</div><div className="chart-note"><CircleAlert size={16}/> Costs and gross profit cover matched calls only.</div></section>
        <section className="card coverage-card"><div className="card-title"><div><h3>Rating coverage</h3><p>CDRs eligible for rating</p></div><div className="small-icon"><Activity size={20}/></div></div><div className="donut" style={{background:`conic-gradient(#0ea5e9 0 ${coverage}%, #f8bb72 ${coverage}% 100%)`}}><div className="donut-center"><strong>{percent(coverage)}</strong><span>Rated</span></div></div><div className="coverage-legend"><div><span><i style={{background:'#0ea5e9'}}/>Simulated</span><strong>{count(simulated)}</strong></div><div><span><i style={{background:'#f8bb72'}}/>Held for review</span><strong>{count(held)}</strong></div><div><span><i style={{background:'#d7e4eb'}}/>No billable usage</span><strong>{count(skipped)}</strong></div></div></section>
      </div>
      <section className="card table-card"><div className="card-title"><div><h3>Customer billing preview</h3><p>Source files and call charge totals</p></div><span className="badge blue">Simulation</span></div><div className="table-scroll"><table><thead><tr><th>Customer / source file</th><th>CDRs</th><th>Source charge</th><th>Simulated charge</th><th>Held charge</th><th></th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.company_key+r.source_reference+i}><td><div className="customer-cell"><div className="customer-avatar">{r.company_key.slice(0,2).toUpperCase()}</div><div><strong>{r.company_key}</strong><span>{r.source_reference}</span></div></div></td><td>{count(r.total_cdr)}</td><td>{money(r.source_call_charge)}</td><td><strong>{money(r.simulated_call_charge)}</strong></td><td className="held-amount">{money(r.held_source_call_charge)}</td><td><button className="outline-button small" onClick={()=>onExplore(r.company_key)}>Inspect</button></td></tr>)}</tbody></table></div><div className="table-footer"><span>{rows.length} source file{rows.length!==1?'s':''}</span><span>Not an invoice or posted charge</span></div></section>
    </>}
  </div>;
}

function StatusBadge({status}:{status:string}){
  const tone=status.startsWith('SIMULATED')?'green':status.startsWith('SKIP')?'gray':'amber';
  return <span className={'badge '+tone}>{label(status).replace('Simulated ','')}</span>;
}
function CdrExplorer({companies,company,demo}:{companies:string[];company:string;demo:boolean}){
  const [selected,setSelected]=useState(company!=='all'?company:companies[0]||'');
  const [status,setStatus]=useState('SIMULATED_SPECIAL_RATE'),[offset,setOffset]=useState(0),[rows,setRows]=useState<RatedCdr[]>([]);
  const [error,setError]=useState(''),[loading,setLoading]=useState(false);
  const limit=25;
  useEffect(()=>{setSelected(company!=='all'?company:companies[0]||'');setOffset(0)},[company,companies.join('|')]);
  useEffect(()=>{if(!selected)return;let valid=true;setLoading(true);setError('');
    const params=new URLSearchParams({company:selected,status,limit:String(limit),offset:String(offset)});
    request<RatedCdr[]>('/api/cdrs?'+params).then(data=>{if(valid)setRows(data)}).catch(err=>{if(valid){setError(err.message);setRows([])}}).finally(()=>{if(valid)setLoading(false)});
    return()=>{valid=false};
  },[selected,status,offset]);
  return <div className="page-stack"><div className="page-intro"><div><h1>CDR Explorer</h1><p>Inspect rating results, special prices and held calls.</p></div><span className="badge blue"><ShieldCheck size={15}/> Simulation only</span></div>
    <section className="card"><div className="filters"><div className="field"><label>Customer</label><select value={selected} onChange={e=>{setSelected(e.target.value);setOffset(0)}}><option value="">Select customer</option>{companies.map(c=><option key={c}>{c}</option>)}</select></div><div className="field"><label>Selling rating status</label><select value={status} onChange={e=>{setStatus(e.target.value);setOffset(0)}}><option value="">All statuses</option><option value="SIMULATED_SPECIAL_RATE">Customer special rate</option><option value="SIMULATED_STANDARD_RATE">Standard rate</option><option value="HOLD_INBOUND_POLICY">Held inbound</option><option value="HOLD_ROUTE">Held route</option><option value="HOLD_STANDARD_PRICE">Held standard price</option><option value="SKIP_NO_BILLABLE_USAGE">No billable usage</option></select></div></div>
    {error&&<ErrorBox message={error}/>}
    {loading?<div className="loading-card"><Spinner/> Loading CDR ratings…</div>:null}
    {!loading&&rows.length===0&&<div className="empty-card"><Search/><h3>No records to show</h3><p>{demo?'Local demo shows aggregate data only. Connect the live API for individual CDRs.':'Select a customer or adjust the rating status filter.'}</p></div>}
    {rows.length>0&&<><div className="table-scroll"><table><thead><tr><th>Source row</th><th>Route</th><th>Duration</th><th>Source charge</th><th>Simulated</th><th>Cost</th><th>Rating</th></tr></thead><tbody>{rows.map(r=><tr key={r.miitel_cdr_id}><td><strong>#{r.source_row_number}</strong><span className="cell-sub">{label(r.call_direction)}</span></td><td><strong>{label(r.destination_code)}</strong><span className="cell-sub">{label(r.origin_type_code)}</span></td><td>{r.call_duration_seconds??'—'}s</td><td>{money(r.source_call_charge)}</td><td><strong>{money(r.simulated_call_charge)}</strong></td><td>{money(r.simulated_vendor_cost)}</td><td><StatusBadge status={r.selling_rating_status}/></td></tr>)}</tbody></table></div><div className="table-footer"><span>Rows {offset+1}–{offset+rows.length}</span><div className="pagination"><button disabled={!offset||loading} className="icon-button" aria-label="Previous page" onClick={()=>setOffset(Math.max(0,offset-limit))}><ChevronLeft size={18}/></button><button disabled={rows.length<limit||loading} className="icon-button" aria-label="Next page" onClick={()=>setOffset(offset+limit)}><ChevronRight size={18}/></button></div></div></>}
    </section></div>;
}

type UploadPreview={companyKey:string;sourceReference:string;cdrCount:number;byDirection:{inbound:number;outbound:number;internal:number};missingCharge:number;sourceCharge:string};
function Upload({company,importEnabled,demo,onComplete}:{company:string;importEnabled:boolean;demo:boolean;onComplete:()=>void}){
  const [key,setKey]=useState(company!=='all'?company:'');
  const [file,setFile]=useState<File|null>(null),[drag,setDrag]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<UploadPreview|null>(null),[message,setMessage]=useState('');
  function selectFile(f?:File){setError('');setPreview(null);setMessage('');if(!f)return;setFile(null);if(!/\.(xlsx|csv)$/i.test(f.name)){setError('Choose an XLSX or CSV file.');return;}if(f.size>32*1024*1024){setError('Maximum file size is 32 MB.');return;}setFile(f);}
  async function send(mode:'preview-upload'|'import-upload'){
    if(!file||!key){setError('Choose a company and CDR file.');return;}
    setBusy(true);setError('');setMessage('');
    try{const body=new FormData();body.append('companyKey',key);body.append('file',file);
      if(mode==='preview-upload')setPreview(await request<UploadPreview>('/api/cdr/preview-upload',{method:'POST',body}));
      else{const result=await request<{inserted:number;duplicateSkipped:number}>('/api/cdr/import-upload',{method:'POST',body});setMessage(`${count(result.inserted)} imported; ${count(result.duplicateSkipped)} duplicates skipped.`);onComplete();}
    }catch(err){setError(err instanceof Error?err.message:'Upload failed')}finally{setBusy(false);}
  }
  return <div className="page-stack"><div className="page-intro"><div><h1>Upload MiiTel CDR</h1><p>Validate a source file before importing it to CallMeter.</p></div><span className="badge blue"><FileSpreadsheet size={15}/> Excel / CSV</span></div>
    <section className="card upload-card"><div className="card-title"><div><h3>CDR source file</h3><p>Original MiiTel export; duplicate worksheets are ignored.</p></div><div className="small-icon"><CloudUpload size={23}/></div></div><div className="field"><label htmlFor="company-key">MiiTel company key</label><input id="company-key" value={key} onChange={e=>{setKey(e.target.value);setPreview(null)}} placeholder="e.g. company-id"/></div><div className={'dropzone '+(drag?'dragging':'')} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);selectFile(e.dataTransfer.files[0])}}><div className="upload-circle"><CloudUpload size={34} strokeWidth={1.7}/></div><h3>{file?file.name:'Drag and drop your CDR file'}</h3><p>{file?(file.size/1024/1024).toFixed(2)+' MB':'XLSX or CSV, up to 32 MB'}</p><label className="outline-button file-button">Choose file<input type="file" accept=".xlsx,.csv" onChange={e=>selectFile(e.target.files?.[0])}/></label>{file&&<button className="text-button" onClick={()=>{setFile(null);setPreview(null)}}>Remove</button>}</div>
    {error&&<ErrorBox message={error}/>}
    <div className="upload-actions"><span><ShieldCheck size={16}/> Preview does not save data.</span><button className="primary-button" disabled={busy||!file||!key||demo} onClick={()=>send('preview-upload')}>{busy?<Spinner/>:<><CheckCircle2 size={18}/> Preview file</>}</button></div>
    {demo&&<div className="chart-note">Local design demo: configure the live backend to process uploads.</div>}
    </section>
    {preview&&<section className="card"><div className="card-title"><div><h3>Validation successful</h3><p>{preview.sourceReference}</p></div><span className="badge green"><CheckCircle2 size={15}/> Ready</span></div><div className="upload-stats"><div><span>CDR rows</span><strong>{count(preview.cdrCount)}</strong></div><div><span>Source call charge</span><strong>{money(preview.sourceCharge)}</strong></div><div><span>Missing charge</span><strong>{count(preview.missingCharge)}</strong></div></div><div className="chart-note">Upload preview verified. Import is {importEnabled?'available after confirmation':'disabled on this deployment'}.</div><button className="primary-button" disabled={!importEnabled||busy} onClick={()=>{if(window.confirm('Import these CDR records into the database?'))send('import-upload')}}>Import CDR</button>{message&&<div className="success-box">{message}</div>}</section>}
  </div>;
}

function Workspace({session,onExit}:{session:Session;onExit:()=>void}){
  const initial=window.location.hash.replace('#','') as Page;
  const [page,setPage]=useState<Page>(pageNames[initial]?initial:'overview');
  const [summary,setSummary]=useState<Summary[]>([]),[company,setCompany]=useState('all'),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [mobileOpen,setMobileOpen]=useState(false);
  const refresh=useCallback(async()=>{setLoading(true);setError('');try{setSummary(await request<Summary[]>('/api/summary'));}catch(err){setError(err instanceof Error?err.message:'Unable to load summary')}finally{setLoading(false)}},[]);
  useEffect(()=>{void refresh()},[refresh]);
  const companies=useMemo(()=>[...new Set(summary.map(r=>r.company_key))],[summary]);
  const filtered=company==='all'?summary:summary.filter(r=>r.company_key===company);
  function go(next:Page){setPage(next);window.location.hash=next;setMobileOpen(false);window.scrollTo(0,0)}
  async function logout(){try{await request('/api/auth/logout',{method:'POST'});}finally{onExit()}}
  return <div className="app-shell">
    {mobileOpen&&<button className="mobile-overlay" aria-label="Close menu" onClick={()=>setMobileOpen(false)}/>}
    <aside className={'sidebar '+(mobileOpen?'sidebar-open':'')}><Brand/><div className="sidebar-group"><span className="sidebar-label">WORKSPACE</span>{nav.map(item=><button key={item.page} className={'nav-item '+(page===item.page?'nav-active':'')} onClick={()=>go(item.page)}><item.icon size={21} strokeWidth={1.8}/><span>{item.label}</span>{page===item.page&&<span className="nav-dot"/>}</button>)}</div><div className="sidebar-bottom"><div className="side-info"><div className="side-info-icon"><Headphones size={20}/></div><div><strong>Call charge</strong><span>Focused workspace</span></div></div><div className="sidebar-mode"><span className="status-dot"/>{session.demo?'Local design demo':'Simulation only'}</div>{!session.demo&&<button className="nav-item logout-link" onClick={logout}><LogOut size={20}/>Sign out</button>}</div></aside>
    <div className="main-shell"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={()=>setMobileOpen(true)}><Menu size={24}/></button><span className="breadcrumbs">CallMeter <span>/</span> <strong>{pageNames[page]}</strong></span></div><div className="topbar-right"><div className="mode-pill"><ShieldCheck size={16}/><span>{session.demo?'Demo data':'Simulation'}</span></div><button className="icon-button refresh-button" title="Refresh data" aria-label="Refresh data" onClick={refresh}><RefreshCw size={20} className={loading?'spin':''}/></button><div className="profile-avatar">CM</div></div></header><main className="content"><div className="toolbar"><div><span className="eyebrow">MIITEL CALLMETER</span><h2>{pageNames[page]}</h2></div><div className="company-control"><Building2 size={18}/><select aria-label="Filter customer" value={company} onChange={e=>setCompany(e.target.value)}><option value="all">All customers</option>{companies.map(c=><option key={c}>{c}</option>)}</select><ChevronDown size={16}/></div></div>
      {page==='overview'&&<Overview rows={filtered} loading={loading} error={error} company={company} demo={session.demo} onRetry={refresh} onExplore={c=>{setCompany(c);go('cdrs')}}/>}
      {page==='cdrs'&&<CdrExplorer companies={companies} company={company} demo={session.demo}/>}
      {page==='upload'&&<Upload company={company} importEnabled={session.importEnabled} demo={session.demo} onComplete={refresh}/>}
      <footer className="app-footer"><span>MiiTel CallMeter · Call charge management</span><span>Preview only · No invoice posting</span></footer>
    </main></div>
  </div>;
}

function App(){
  const [session,setSession]=useState<Session|null>(null),[error,setError]=useState('');
  const load=useCallback(async()=>{setError('');try{setSession(await request<Session>('/api/session'))}catch(err){setError(err instanceof Error?err.message:'Could not start workspace')}},[]);
  useEffect(()=>{void load()},[load]);
  if(error)return <div className="boot-screen"><Brand/><ErrorBox message={error} onRetry={load}/></div>;
  if(!session)return <div className="boot-screen"><Brand/><Spinner/></div>;
  return session.authenticated?<Workspace session={session} onExit={load}/>:<Login configured={session.configured} onLogin={load}/>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
