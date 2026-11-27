import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, ArrowDownToLine, ArrowDownRight, ArrowUpRight, BarChart3, Building2, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, CircleAlert, ClipboardList, CloudUpload, Database,
  FileSpreadsheet, Headphones, LayoutDashboard, LockKeyhole, LogOut, Menu, PhoneCall, RefreshCw,
  Search, ShieldCheck, Users, Wallet, X
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NumberCreate,NumberAdminActions,NumberFilters } from './number-workspace';
import { CatalogWorkspace,type CatalogKind } from './catalog-workspace';
import { RatingSimulation } from './rating-simulation';
import { ActiveCdrPreview } from './active-cdr-preview';
import { ImportHistory } from './import-history';
import './styles.css';

type Page = 'overview' | 'cdrs' | 'upload' | 'customers' | 'numbers' | 'rating-simulation' | 'import-history' | CatalogKind;
type Amount = string | number | null | undefined;
type Summary = {
  company_key: string; source_reference: string; first_source_call_at?: string; last_source_call_at?: string;
  total_cdr: Amount; skipped_no_usage: Amount; simulated_cdrs: Amount; held_selling_cdrs: Amount;
  simulated_vendor_cdrs: Amount; paid_source_matches: Amount; charge_mismatches: Amount;
  source_call_charge: Amount; simulated_call_charge: Amount; held_source_call_charge: Amount;
  covered_vendor_cost: Amount; covered_selling: Amount; covered_simulated_gross_profit: Amount;
  covered_simulated_gross_margin_pct: Amount; billing_status: string;
  registered_vendor_cost?:Amount; missing_vendor_cost_cdrs?:Amount; vendor_cost_priced_cdrs?:Amount;
};
type Session = { authenticated:boolean; configured:boolean; demo:boolean; importEnabled:boolean; masterWriteEnabled?:boolean; maxUploadBytes?:number; directUploadBase?:string|null; deployment?:string };
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
const pageNames:Record<Page,string>={overview:'Overview',cdrs:'CDR Explorer',upload:'Upload CDR',customers:'Customers',numbers:'Number Inventory',vendors:'Vendors','vendor-rates':'Vendor Cost Rate Cards','selling-rates':'MiiTel Selling Rate Cards','customer-pricing':'Customer Special Pricing','rating-simulation':'Rating Simulation','import-history':'Import History'};
const nav:{page:Page;label:string;icon:LucideIcon}[]=[
  {page:'overview',label:'Overview',icon:LayoutDashboard},
  {page:'cdrs',label:'CDR Explorer',icon:ClipboardList},
  {page:'upload',label:'Upload CDR',icon:CloudUpload},
  {page:'customers',label:'Customers',icon:Users},
  {page:'numbers',label:'Number Inventory',icon:PhoneCall},
  {page:'vendors',label:'Vendors',icon:Building2},
  {page:'vendor-rates',label:'Vendor Cost Rates',icon:Wallet},
  {page:'selling-rates',label:'MiiTel Selling Rates',icon:BarChart3},
  {page:'customer-pricing',label:'Customer Pricing',icon:ClipboardList},
  {page:'rating-simulation',label:'Rating Simulation',icon:Activity},
  {page:'import-history',label:'Import History',icon:FileSpreadsheet},
];

type CustomerMaster={id:string;customer_code:string;customer_name:string;legal_company_name:string|null;miitel_company_code:string|null;miitel_company_id:string|null;status:string;billing_cycle:string;activation_date:string|null;currency:string;default_billing_increment_seconds:number;address:string|null;remarks:string|null};
type NumberMaster={id:string;phone_number:string;normalized_number:string;number_type_code:string;number_type:string;vendor_code:string;vendor_name:string;country_name:string;area_code:string|null;status:string;ownership:string;assignment_status:string|null;customer_name:string|null;translation_numbers:unknown;translation_count:Amount;billing_increment_seconds:number|null};

function masterStatus(status:string|null){return <span className={'badge '+(status==='active'||status==='assigned'?'green':'gray')}>{label(status)}</span>}
function translationText(value:unknown):string {
  if(value==null)return '—';
  if(Array.isArray(value))return value.map(translationText).join(', ')||'—';
  if(typeof value==='object'){const row=value as Record<string,unknown>;return String(row.translation_number??row.normalized_translation_number??row.phone_number??'—');}
  return String(value)||'—';
}

function CustomerForm({record,canEdit,onClose,onSaved}:{record?:CustomerMaster;canEdit:boolean;onClose:()=>void;onSaved:(row:CustomerMaster)=>void}){
  const [form,setForm]=useState({customer_code:record?.customer_code??'',customer_name:record?.customer_name??'',legal_company_name:record?.legal_company_name??'',miitel_company_code:record?.miitel_company_code??'',miitel_company_id:String(record?.miitel_company_id??''),address:record?.address??'',remarks:record?.remarks??''});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(e:React.FormEvent){e.preventDefault();if(!canEdit||busy)return;setBusy(true);setError('');try{const row=await request<CustomerMaster>('/api/master/customers',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,...(record?{id:record.id}:{})})});onSaved(row);}catch(err){setError(err instanceof Error?err.message:'Save failed')}finally{setBusy(false)}}
  const fields:[keyof typeof form,string,number,boolean][]=[['customer_code','Customer code',100,true],['customer_name','Customer name',200,true],['legal_company_name','Legal company name',200,false],['miitel_company_code','MiiTel company code',100,true],['miitel_company_id','MiiTel company ID',19,false],['address','Address',2000,false],['remarks','Remarks',2000,false]];
  return <section className="card customer-form"><div className="card-title"><div><h3>{record?'Customer details':'New Customer'}</h3><p>{record?'Identity and billing history are preserved.':'Register a customer before processing CDRs.'}</p></div><button className="icon-button" aria-label="Close customer form" onClick={onClose} disabled={busy}><X size={20}/></button></div>
    <form onSubmit={submit}><div className="customer-form-grid">{fields.map(([k,title,max,required])=><div className={'field '+(k==='address'||k==='remarks'?'wide-field':'')} key={k}><label htmlFor={'customer-'+k}>{title}</label><input id={'customer-'+k} value={form[k]} maxLength={max} required={required} readOnly={!canEdit||Boolean(record&&(['customer_code','miitel_company_code'].includes(k)||(k==='miitel_company_id'&&record.miitel_company_id!=null)))} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} placeholder={k==='miitel_company_code'?'e.g. company-id':undefined}/></div>)}</div>
    {record&&<div className="customer-meta"><span>Status: {label(record.status)}</span><span>Billing: {label(record.billing_cycle)}</span><span>Currency: {record.currency}</span><span>Default billing increment: {record.default_billing_increment_seconds}s</span></div>}
    {error&&<ErrorBox message={error}/>}
    <div className="upload-actions"><button type="button" className="outline-button" onClick={onClose} disabled={busy}>Cancel</button>{canEdit&&<button className="primary-button" type="submit" disabled={busy}>{busy?<Spinner/>:'Save Customer'}</button>}</div></form></section>;
}

type DetailRow=Record<string,string|number|boolean|null>;
type NumberDetail={number:DetailRow;translations:DetailRow[];assignments:DetailRow[];vendorHistory:DetailRow[];migrations:DetailRow[];statusHistory:DetailRow[]};
function NumberDetails({id,onClose,canEdit,onChanged}:{id:string;onClose:()=>void;canEdit:boolean;onChanged:()=>void}){
  const [details,setDetails]=useState<NumberDetail|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{let current=true;setError('');setDetails(null);request<NumberDetail>('/api/master/number-details?'+new URLSearchParams({id})).then(v=>{if(current)setDetails(v)}).catch(e=>{if(current)setError(e.message)});return()=>{current=false}},[id,revision]);
  const value=(v:DetailRow[string])=>v===null||v===undefined?'—':typeof v==='boolean'?(v?'Yes':'No'):String(v);
  const sets:{key:Exclude<keyof NumberDetail,'number'>;title:string;fields:[string,string][]}[]=[
    {key:'translations',title:'Number Translation',fields:[['translation_number','Translation'],['vendor_name','Vendor'],['call_direction','Direction'],['is_primary','Primary'],['status','Status'],['effective_from','From'],['effective_to','To']]},
    {key:'assignments',title:'Number Assignment',fields:[['usage_type','Usage'],['customer_name','Customer'],['effective_from','From'],['effective_to','To'],['release_reason','Release reason']]},
    {key:'vendorHistory',title:'Vendor History',fields:[['vendor_name','Vendor'],['effective_from','From'],['effective_to','To'],['remarks','Remarks']]},
    {key:'migrations',title:'Number Migration',fields:[['source_vendor','Source vendor'],['target_vendor','Target vendor'],['migration_status','Status'],['requested_date','Requested'],['completed_date','Completed']]},
    {key:'statusHistory',title:'Number History',fields:[['field_name','Field'],['old_value','Previous'],['new_value','New'],['changed_at','Changed']]}
  ];
  const general:[string,string][]=[['number_type','Number type'],['vendor_name','Vendor'],['country_name','Country'],['area_code','Area code'],['ownership','Ownership'],['status','Status'],['number_condition','Condition'],['availability_status','Availability'],['usage_type','Usage'],['customer_name','Customer'],['internal_team','Internal team'],['migration_eligibility','Migration eligibility'],['sli_enabled','SLI enabled'],['billing_increment_seconds','Billing increment (s)']];
  return <section className="card number-detail"><div className="card-title"><div><h3>{details?value(details.number.phone_number):'Number details'}</h3><p>Inventory profile and latest 100 events per history type.</p></div><button className="icon-button" aria-label="Close number details" onClick={onClose}><X size={20}/></button></div>{error&&<ErrorBox message={error}/>} {!error&&!details&&<div className="loading-card"><Spinner/> Loading number details…</div>}{details&&<><div className="number-detail-grid">{general.map(([k,title])=><div key={k}><span>{title}</span><strong>{value(details.number[k])}</strong></div>)}</div>{canEdit&&<NumberAdminActions id={id} number={details.number} assignments={details.assignments} translations={details.translations} onChanged={()=>{setRevision(n=>n+1);onChanged()}}/>}{sets.map(s=><details className="number-history" key={s.key} open={s.key==='translations'}><summary>{s.title} <span className="badge gray">{details[s.key].length}</span></summary>{details[s.key].length===0?<p>No records.</p>:<div className="table-scroll"><table><thead><tr>{s.fields.map(([k,title])=><th key={k}>{title}</th>)}</tr></thead><tbody>{details[s.key].map((r,i)=><tr key={i}>{s.fields.map(([k])=><td key={k}>{value(r[k])}</td>)}</tr>)}</tbody></table></div>}</details>)}</>}</section>;
}

function MasterList({kind,demo,revision,canEdit}:{kind:'customers'|'numbers';demo:boolean;revision:number;canEdit:boolean}){
  const isCustomers=kind==='customers',limit=25;
  const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[offset,setOffset]=useState(0);
  const [status,setStatus]=useState('');
  const [rows,setRows]=useState<(CustomerMaster|NumberMaster)[]>([]),[hasMore,setHasMore]=useState(false);
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
  const [editor,setEditor]=useState<CustomerMaster|'new'|null>(null),[notice,setNotice]=useState('');
  const [numberDetail,setNumberDetail]=useState<string|null>(null);
  const [newNumber,setNewNumber]=useState(false);
  const [inventoryFilters,setInventoryFilters]=useState<Record<string,string>>({});
  useEffect(()=>{let current=true;setLoading(true);setError('');setRows([]);setHasMore(false);
    const params=new URLSearchParams({q:search,limit:String(limit),offset:String(offset)});
    if(isCustomers&&status)params.set('status',status);
    if(!isCustomers)for(const [key,value] of Object.entries(inventoryFilters))params.set(key,value);
    request<{rows:(CustomerMaster|NumberMaster)[];hasMore:boolean}>('/api/master/'+kind+'?'+params).then(result=>{if(current){setRows(result.rows);setHasMore(result.hasMore)}}).catch(err=>{if(current)setError(err instanceof Error?err.message:'Unable to load master data')}).finally(()=>{if(current)setLoading(false)});
    return()=>{current=false};
  },[kind,search,offset,retry,revision,status,inventoryFilters]);
  function submit(e:React.FormEvent){e.preventDefault();setOffset(0);setSearch(query.trim());setRetry(n=>n+1)}
  const columns=isCustomers?['Customer','MiiTel company','Billing cycle','Activation','Status','Details']:['Number','Type / vendor','Customer / assignment','Translation number','Billing unit','Status','Details'];
  return <div className="page-stack"><div className="page-intro"><div><h1>{pageNames[kind]}</h1><p>{isCustomers?'Registered customer accounts and MiiTel company mapping.':'Registered numbers, vendor ownership, and translation mappings.'}</p></div><span className="badge blue"><Database size={15}/> Master data</span></div>
    {editor&&<CustomerForm key={editor==='new'?'new':editor.id} record={editor==='new'?undefined:editor} canEdit={canEdit} onClose={()=>setEditor(null)} onSaved={()=>{setEditor(null);setNotice('Customer saved.');setRetry(n=>n+1)}}/>}
    {newNumber&&<NumberCreate onClose={()=>setNewNumber(false)} onSaved={id=>{setNewNumber(false);setNumberDetail(id);setRetry(n=>n+1);setNotice('Number registered. Ready status requires verification.')}}/>}
    {numberDetail&&<NumberDetails key={numberDetail} id={numberDetail} onClose={()=>setNumberDetail(null)} canEdit={canEdit} onChanged={()=>setRetry(n=>n+1)}/>}
    {notice&&<div className="success-box">{notice}</div>}
    <section className="card table-card master-card"><div className="card-title"><div><h3>{isCustomers?'Customer directory':'Registered numbers'}</h3><p>Live records from the existing inventory.</p></div>{canEdit?<button className="primary-button" onClick={()=>{if(isCustomers)setEditor('new');else{setNewNumber(true);setNumberDetail(null)}setNotice('')}}>{isCustomers?'+ New Customer':'+ New Number'}</button>:<span className="badge gray">Read only</span>}</div>
      <form className="master-search" onSubmit={submit}><div className="master-search-input"><Search size={18}/><input aria-label="Search master data" maxLength={100} value={query} onChange={e=>setQuery(e.target.value)} placeholder={isCustomers?'Search name, code or MiiTel company':'Search number, vendor or customer'}/></div>{isCustomers&&<div className="field"><select aria-label="Customer status" value={status} onChange={e=>{setStatus(e.target.value);setOffset(0)}}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>}<button className="primary-button" type="submit">Search</button>{search&&<button type="button" className="outline-button" onClick={()=>{setQuery('');setSearch('');setOffset(0)}}>Clear</button>}</form>
      {!isCustomers&&<NumberFilters onChange={v=>{setInventoryFilters(v);setOffset(0)}}/>}
      {error&&<div className="master-state"><ErrorBox message={error} onRetry={()=>setRetry(n=>n+1)}/></div>}
      {loading&&<div className="master-state loading-card"><Spinner/> Loading master data…</div>}
      {!loading&&!error&&!rows.length&&<div className="master-state empty-card"><Search/><h3>No {isCustomers?'customers':'numbers'} found</h3><p>{demo?'Connect the live API to view registered master data.':'Try a different search or check your existing master records.'}</p></div>}
      {rows.length>0&&<div className="table-scroll"><table><thead><tr>{columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{isCustomers?(rows as CustomerMaster[]).map(r=><tr key={r.id}><td><div className="customer-cell"><div className="customer-avatar">{(r.customer_name||r.customer_code).slice(0,2).toUpperCase()}</div><div><strong>{r.customer_name}</strong><span>{r.customer_code}{r.legal_company_name&&r.legal_company_name!==r.customer_name?' · '+r.legal_company_name:''}</span></div></div></td><td><strong>{r.miitel_company_code||'—'}</strong><span className="cell-sub">{r.miitel_company_id??''}</span></td><td>{label(r.billing_cycle)}</td><td>{displayDate(r.activation_date??undefined)}</td><td>{masterStatus(r.status)}</td><td><button className="outline-button small" onClick={()=>setEditor(r)}>{canEdit?'Edit':'View'}</button></td></tr>):(rows as NumberMaster[]).map((r,i)=><tr key={r.id+'-'+i}><td><strong>{r.phone_number}</strong><span className="cell-sub">{r.country_name||'—'}{r.area_code?' · '+r.area_code:''}</span></td><td><strong>{r.number_type||label(r.number_type_code)}</strong><span className="cell-sub">{r.vendor_name||r.vendor_code||'—'}</span></td><td><strong>{r.customer_name||'Unassigned'}</strong><span className="cell-sub">{label(r.assignment_status)}</span></td><td className="master-translation">{translationText(r.translation_numbers)}<span className="cell-sub">{num(r.translation_count)>0?count(r.translation_count)+' mapping(s)':''}</span></td><td>{r.billing_increment_seconds?`${r.billing_increment_seconds}s`:'—'}</td><td>{masterStatus(r.status)}</td><td><button className="outline-button small" onClick={()=>setNumberDetail(r.id)}>View</button></td></tr>)}</tbody></table></div>}
      <div className="table-footer"><span>{rows.length?`Rows ${offset+1}–${offset+rows.length}`:'0 records on this page'}</span><div className="pagination"><button disabled={!offset||loading} className="icon-button" aria-label="Previous page" onClick={()=>setOffset(Math.max(0,offset-limit))}><ChevronLeft size={18}/></button><button disabled={!hasMore||loading} className="icon-button" aria-label="Next page" onClick={()=>setOffset(offset+limit)}><ChevronRight size={18}/></button></div></div>
    </section></div>;
}

async function request<T>(url:string, options:RequestInit={}):Promise<T>{
  const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(typeof result?.message==='string'?result.message:'Request failed. Please retry.');
  return result as T;
}

function Brand({light=false}:{light?:boolean}){
  return <div className={'brand '+(light?'brand-light':'')}>
    <div className="brand-symbol"><img src="/miitel-symbol.png" alt="MiiTel"/></div>
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
    <section className="login-form-area"><div className="login-card"><img className="login-miitel-wordmark" src="/miitel-wordmark.png" alt="MiiTel"/><div className="login-icon"><LockKeyhole size={26}/></div><h2>Welcome back</h2><p>Enter your workspace access key to continue.</p>
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
  const source=sum('source_call_charge'), selling=sum('simulated_call_charge');
  const costReady=rows.every(r=>r.missing_vendor_cost_cdrs!=null&&r.vendor_cost_priced_cdrs!=null);
  const missingCost=sum('missing_vendor_cost_cdrs'),pricedCost=sum('vendor_cost_priced_cdrs');
  const cost=costReady&&(pricedCost>0||missingCost===0)?sum('registered_vendor_cost'):null;
  const profit=cost===null?null:source-cost;
  const eligible=simulated+held, coverage=eligible?simulated/eligible*100:0, margin=profit!==null&&source>0?profit/source*100:NaN;
  const bars=[{label:'Reported source charge',value:source,color:'#0ea5e9'},
    {label:'Simulated call charge',value:selling,color:'#54b7ed'},
    {label:'Vendor cost',value:cost,color:'#f2ae58'},
    {label:'Estimated gross profit',value:profit,color:profit!==null&&profit<0?'#d86b60':'#15b8a1'}];
  const max=Math.max(1,...bars.map(b=>Math.abs(b.value??0)));
  return <div className="page-stack"><Hero company={company} demo={demo}/>
    {error&&<ErrorBox message={error} onRetry={onRetry}/>}
    {loading?<div className="loading-card"><Spinner/> Loading call charge summary…</div>:null}
    {!loading&&!error&&!rows.length&&<div className="empty-card"><Database/><h3>No CDR summary yet</h3><p>Upload a MiiTel CDR file or check the selected customer.</p></div>}
    {rows.length>0&&<>
      <div className="section-heading"><div><h2>Billing overview</h2><p>Reported amounts and simulated rating results</p></div><span className="section-label"><Activity size={15}/> {count(total)} CDR records</span></div>
      <div className="metrics-grid">
        <MetricCard title="Source call charge" value={money(source)} detail="Reported by MiiTel" icon={Wallet} tone="blue"/>
        <MetricCard title="Simulated selling" value={money(selling)} detail={count(simulated)+' rated CDRs'} icon={PhoneCall} tone="sky"/>
        <MetricCard title="Vendor Cost" value={money(cost)} detail="Based on registered vendor rates" icon={ArrowDownRight} tone="amber"/>
        <MetricCard title="Estimated Gross Profit" value={money(profit)} detail={profit===null?'Vendor cost not available':`${percent(margin)} margin${missingCost?' · provisional':''}`} icon={ArrowUpRight} tone="teal"/>
      </div>
      <div className="chart-grid">
        <section className="card"><div className="card-title"><div><h3>Call charge breakdown</h3><p>Amounts in Indonesian rupiah</p></div><div className="small-icon"><BarChart3 size={20}/></div></div><div className="bar-chart">{bars.map(b=><div key={b.label} className="bar-row"><div className="bar-meta"><span>{b.label}</span><strong>{money(b.value)}</strong></div><div className="bar-track"><div className="bar-fill" style={{width:`${Math.abs(b.value??0)/max*100}%`,background:b.color}}/></div></div>)}</div><div className="chart-note"><CircleAlert size={16}/> {!costReady?'Vendor cost summary requires the latest API deployment.':missingCost?`GP = reported call charge − available rate-card costs. ${count(missingCost)} calls still need a cost rate, so profit is provisional.`:'GP = reported call charge − registered vendor costs. No vendor CDR reconciliation required.'}</div></section>
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
  const [mode,setMode]=useState<'legacy'|'active'>('legacy');
  const [selected,setSelected]=useState(company!=='all'?company:companies[0]||'');
  const [status,setStatus]=useState('SIMULATED_SPECIAL_RATE'),[offset,setOffset]=useState(0),[rows,setRows]=useState<RatedCdr[]>([]);
  const [error,setError]=useState(''),[loading,setLoading]=useState(false);
  const limit=25;
  useEffect(()=>{setSelected(company!=='all'?company:companies[0]||'');setOffset(0)},[company,companies.join('|')]);
  useEffect(()=>{if(!selected||mode==='active')return;let valid=true;setLoading(true);setError('');
    const params=new URLSearchParams({company:selected,status,limit:String(limit),offset:String(offset)});
    request<RatedCdr[]>('/api/cdrs?'+params).then(data=>{if(valid)setRows(data)}).catch(err=>{if(valid){setError(err.message);setRows([])}}).finally(()=>{if(valid)setLoading(false)});
    return()=>{valid=false};
  },[selected,status,offset,mode]);
  if(mode==='active')return <ActiveCdrPreview companies={companies} company={selected||company} onLegacy={()=>setMode('legacy')}/>;
  return <div className="page-stack"><div className="page-intro"><div><h1>CDR Explorer</h1><p>Inspect rating results, special prices and held calls.</p></div><button className="outline-button" onClick={()=>setMode('active')}>Active Rate Preview</button></div>
    <section className="card"><div className="filters"><div className="field"><label>Customer</label><select value={selected} onChange={e=>{setSelected(e.target.value);setOffset(0)}}><option value="">Select customer</option>{companies.map(c=><option key={c}>{c}</option>)}</select></div><div className="field"><label>Selling rating status</label><select value={status} onChange={e=>{setStatus(e.target.value);setOffset(0)}}><option value="">All statuses</option><option value="SIMULATED_SPECIAL_RATE">Customer special rate</option><option value="SIMULATED_STANDARD_RATE">Standard rate</option><option value="HOLD_INBOUND_POLICY">Held inbound</option><option value="HOLD_ROUTE">Held route</option><option value="HOLD_STANDARD_PRICE">Held standard price</option><option value="SKIP_NO_BILLABLE_USAGE">No billable usage</option></select></div></div>
    {error&&<ErrorBox message={error}/>}
    {loading?<div className="loading-card"><Spinner/> Loading CDR ratings…</div>:null}
    {!loading&&rows.length===0&&<div className="empty-card"><Search/><h3>No records to show</h3><p>{demo?'Local demo shows aggregate data only. Connect the live API for individual CDRs.':'Select a customer or adjust the rating status filter.'}</p></div>}
    {rows.length>0&&<><div className="table-scroll"><table><thead><tr><th>Source row</th><th>Route</th><th>Duration</th><th>Source charge</th><th>Simulated</th><th>Cost</th><th>Rating</th></tr></thead><tbody>{rows.map(r=><tr key={r.miitel_cdr_id}><td><strong>#{r.source_row_number}</strong><span className="cell-sub">{label(r.call_direction)}</span></td><td><strong>{label(r.destination_code)}</strong><span className="cell-sub">{label(r.origin_type_code)}</span></td><td>{r.call_duration_seconds??'—'}s</td><td>{money(r.source_call_charge)}</td><td><strong>{money(r.simulated_call_charge)}</strong></td><td>{money(r.simulated_vendor_cost)}</td><td><StatusBadge status={r.selling_rating_status}/></td></tr>)}</tbody></table></div><div className="table-footer"><span>Rows {offset+1}–{offset+rows.length}</span><div className="pagination"><button disabled={!offset||loading} className="icon-button" aria-label="Previous page" onClick={()=>setOffset(Math.max(0,offset-limit))}><ChevronLeft size={18}/></button><button disabled={rows.length<limit||loading} className="icon-button" aria-label="Next page" onClick={()=>setOffset(offset+limit)}><ChevronRight size={18}/></button></div></div></>}
    </section></div>;
}

type UploadPreview={companyKey:string;sourceReference:string;cdrCount:number;byDirection:{inbound:number;outbound:number;internal:number};missingCharge:number;sourceCharge:string;fileSha256?:string;sourceTimezone?:string|null;sourceCurrency?:string|null};
function Upload({company,importEnabled,demo,maxUploadBytes,directUploadBase,onComplete,canEdit,onHistory}:{company:string;importEnabled:boolean;demo:boolean;maxUploadBytes:number;directUploadBase?:string|null;onComplete:()=>void;canEdit:boolean;onHistory:()=>void}){
  const [key,setKey]=useState(company!=='all'?company:'');
  const [customerSearch,setCustomerSearch]=useState(''),[customers,setCustomers]=useState<CustomerMaster[]>([]),[selectedCustomer,setSelectedCustomer]=useState<CustomerMaster|null>(null),[customerError,setCustomerError]=useState(''),[adding,setAdding]=useState(false),[customerLoading,setCustomerLoading]=useState(false);
  useEffect(()=>{let current=true;setCustomerLoading(true);setCustomerError('');const timer=window.setTimeout(()=>{
    request<{rows:CustomerMaster[]}>('/api/master/customers?'+new URLSearchParams({q:customerSearch,limit:'100',offset:'0',status:'active'})).then(result=>{if(current)setCustomers(result.rows.filter(r=>r.status==='active'&&Boolean(r.miitel_company_code)))}).catch(err=>{if(current)setCustomerError(err instanceof Error?err.message:'Unable to load customers')}).finally(()=>{if(current)setCustomerLoading(false)});
  },250);return()=>{current=false;window.clearTimeout(timer)};},[customerSearch]);
  const options=[...customers,...(selectedCustomer&&!customers.some(c=>c.id===selectedCustomer.id)?[selectedCustomer]:[])];
  const validCustomer=options.some(c=>c.miitel_company_code===key);
  const [file,setFile]=useState<File|null>(null),[drag,setDrag]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<UploadPreview|null>(null),[message,setMessage]=useState('');
  const [sourceTimezone,setSourceTimezone]=useState('unknown'),[sourceCurrency,setSourceCurrency]=useState('IDR'),[imported,setImported]=useState(false);
  const fileLimit=directUploadBase?32*1024*1024:maxUploadBytes,uploadLimitMb=Math.floor(fileLimit/1024/1024);
  function resetPreview(){setPreview(null);setMessage('');setImported(false);}
  function selectFile(f?:File){if(busy)return;setError('');resetPreview();if(!f)return;setFile(null);if(!/\.(xlsx|csv)$/i.test(f.name)){setError('Choose an XLSX or CSV file.');return;}if(f.size>fileLimit||!f.size){setError(`Choose a non-empty file up to ${uploadLimitMb} MB.`);return;}setFile(f);}
  async function send(mode:'preview-upload'|'import-upload'){
    if(!file||!key||!validCustomer){setError('Choose a registered customer and CDR file.');return;}
    if(mode==='import-upload'&&(!importEnabled||!canEdit||!preview?.fileSha256||imported)){setError('Preview the file first and use an admin account with import enabled.');return;}
    setBusy(true);setError('');setMessage('');
    try{const body=new FormData();body.append('companyKey',key);body.append('file',file);body.append('sourceTimezone',sourceTimezone);body.append('sourceCurrency',sourceCurrency);if(mode==='import-upload'&&preview?.fileSha256)body.append('previewHash',preview.fileSha256);
      let result:unknown;
      if(file.size>maxUploadBytes&&directUploadBase){
        const permit=await request<{token:string}>('/api/master/workspace?resource=cdr-upload-permit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,companyKey:key,filename:file.name,size:file.size,sourceTimezone,sourceCurrency,previewHash:mode==='import-upload'?preview?.fileSha256:undefined})});
        const response=await fetch(new URL('/cdr/'+mode,directUploadBase),{method:'POST',credentials:'omit',cache:'no-store',headers:{Authorization:'Bearer '+permit.token},body});const data=await response.json().catch(()=>null);if(!response.ok)throw new Error(typeof data?.message==='string'?data.message:'Direct upload failed');result=data;
      }else result=await request('/api/cdr/'+mode,{method:'POST',body});
      if(mode==='preview-upload'){setPreview(result as UploadPreview);setImported(false);}
      else{const batch=result as {batchId:string;inserted:number;duplicateSkipped:number};setMessage(`${count(batch.inserted)} imported; ${count(batch.duplicateSkipped)} duplicates skipped.`);setImported(true);onComplete();}
    }catch(err){setError(err instanceof Error?err.message:'Upload failed')}finally{setBusy(false);}
  }
  return <div className="page-stack"><div className="page-intro"><div><h1>Upload MiiTel CDR</h1><p>Validate a source file before importing it to CallMeter.</p></div><button className="outline-button" onClick={onHistory} disabled={busy}>Import History</button></div>
    {adding&&<CustomerForm canEdit={canEdit} onClose={()=>setAdding(false)} onSaved={row=>{setSelectedCustomer(row);setKey(row.miitel_company_code||'');setCustomerSearch('');setAdding(false);resetPreview()}}/>}
    <section className="card upload-card"><div className="card-title"><div><h3>CDR source file</h3><p>Original MiiTel export; duplicate worksheets are ignored.</p></div><div className="small-icon"><CloudUpload size={23}/></div></div><div className="field customer-picker"><label htmlFor="customer-search">Find customer</label><input id="customer-search" disabled={busy} maxLength={100} value={customerSearch} onChange={e=>setCustomerSearch(e.target.value)} placeholder="Search customer name or company code"/><label htmlFor="company-key">Registered customer</label><select id="company-key" disabled={busy} value={validCustomer?key:''} onChange={e=>{setKey(e.target.value);setSelectedCustomer(options.find(c=>c.miitel_company_code===e.target.value)||null);resetPreview()}}><option value="">{customerLoading?'Loading customers…':'Select customer'}</option>{options.map(c=><option key={c.id} value={c.miitel_company_code||''}>{c.customer_name} · {c.miitel_company_code}</option>)}</select>{canEdit&&<button className="outline-button" disabled={busy} onClick={()=>setAdding(true)}>+ New Customer</button>}{customerError&&<ErrorBox message={customerError}/>}</div><div className="customer-form-grid upload-metadata"><label className="field"><span>Source timezone</span><select disabled={busy} value={sourceTimezone} onChange={e=>{setSourceTimezone(e.target.value);resetPreview()}}><option value="unknown">Unconfirmed</option><option value="Asia/Jakarta">Asia/Jakarta (WIB)</option><option value="UTC">UTC</option></select></label><label className="field"><span>Source currency (ISO code)</span><input disabled={busy} value={sourceCurrency} maxLength={3} onChange={e=>{setSourceCurrency(e.target.value.toUpperCase());resetPreview()}} placeholder="IDR"/></label></div><p className="chart-note upload-metadata-note">Choose the source metadata only if known. Existing records are never overwritten on re-import.</p><div className={'dropzone '+(drag?'dragging':'')} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);if(!busy)selectFile(e.dataTransfer.files[0])}}><div className="upload-circle"><CloudUpload size={34} strokeWidth={1.7}/></div><h3>{file?file.name:'Drag and drop your CDR file'}</h3><p>{file?(file.size/1024/1024).toFixed(2)+' MB':`XLSX or CSV, up to ${uploadLimitMb} MB`}</p><label className="outline-button file-button">Choose file<input type="file" disabled={busy} accept=".xlsx,.csv" onChange={e=>selectFile(e.target.files?.[0])}/></label>{file&&<button className="text-button" disabled={busy} onClick={()=>{setFile(null);resetPreview()}}>Remove</button>}</div>
    {error&&<ErrorBox message={error}/>}
    <div className="upload-actions"><span><ShieldCheck size={16}/> Preview does not save data.</span><button className="primary-button" disabled={busy||!file||!validCustomer||demo} onClick={()=>send('preview-upload')}>{busy?<Spinner/>:<><CheckCircle2 size={18}/> Preview file</>}</button></div>
    {demo&&<div className="chart-note">Local design demo: configure the live backend to process uploads.</div>}
    </section>
    {preview&&<section className="card"><div className="card-title"><div><h3>Validation successful</h3><p>{preview.sourceReference}</p></div><span className="badge green"><CheckCircle2 size={15}/> Ready</span></div><div className="upload-stats"><div><span>CDR rows</span><strong>{count(preview.cdrCount)}</strong></div><div><span>Source call charge</span><strong>{preview.sourceCurrency==='IDR'?money(preview.sourceCharge):`${preview.sourceCurrency||'Unknown currency'} ${new Intl.NumberFormat('en-US',{maximumFractionDigits:8}).format(Number(preview.sourceCharge))}`}</strong></div><div><span>Missing charge</span><strong>{count(preview.missingCharge)}</strong></div></div><div className="chart-note">Inbound {count(preview.byDirection.inbound)} · Outbound {count(preview.byDirection.outbound)} · Internal {count(preview.byDirection.internal)}. Import stores raw CDRs in batches; active-rate preview is separate.</div><div className="action-buttons"><button className="primary-button" disabled={!importEnabled||!canEdit||busy||imported||!preview.fileSha256} onClick={()=>{if(window.confirm('Import these CDR records into the database?'))send('import-upload')}}>{busy?'Importing…':imported?'Imported':'Import CDR'}</button>{imported&&<button className="outline-button" onClick={onHistory}>View Import History</button>}</div>{!importEnabled&&<p className="chart-note">Admin import is disabled on this deployment.</p>}{message&&<div className="success-box">{message}</div>}</section>}
  </div>;
}

function Workspace({session,onExit}:{session:Session;onExit:()=>void}){
  const initial=window.location.hash.replace('#','') as Page;
  const [page,setPage]=useState<Page>(pageNames[initial]?initial:'overview');
  const [summary,setSummary]=useState<Summary[]>([]),[company,setCompany]=useState('all'),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [mobileOpen,setMobileOpen]=useState(false);
  const [masterRevision,setMasterRevision]=useState(0);
  const masterPage=page==='customers'||page==='numbers';
  const catalogPage=page==='vendors'||page==='vendor-rates'||page==='selling-rates'||page==='customer-pricing';
  const refresh=useCallback(async()=>{setLoading(true);setError('');try{setSummary(await request<Summary[]>('/api/summary'));}catch(err){setError(err instanceof Error?err.message:'Unable to load summary')}finally{setLoading(false)}},[]);
  useEffect(()=>{void refresh()},[refresh]);
  const companies=useMemo(()=>[...new Set(summary.map(r=>r.company_key))],[summary]);
  const filtered=company==='all'?summary:summary.filter(r=>r.company_key===company);
  function go(next:Page){setPage(next);window.location.hash=next;setMobileOpen(false);window.scrollTo(0,0)}
  async function logout(){try{await request('/api/auth/logout',{method:'POST'});}finally{onExit()}}
  return <div className="app-shell">
    {mobileOpen&&<button className="mobile-overlay" aria-label="Close menu" onClick={()=>setMobileOpen(false)}/>}
    <aside className={'sidebar '+(mobileOpen?'sidebar-open':'')}><Brand/>{[{label:'DASHBOARD',items:nav.filter(n=>n.page==='overview')},{label:'CUSTOMER MANAGEMENT',items:nav.filter(n=>n.page==='customers')},{label:'NUMBER MANAGEMENT',items:nav.filter(n=>n.page==='numbers')},{label:'VENDOR MANAGEMENT',items:nav.filter(n=>n.page==='vendors')},{label:'PRICING MANAGEMENT',items:nav.filter(n=>['vendor-rates','selling-rates','customer-pricing'].includes(n.page))},{label:'CDR MANAGEMENT',items:nav.filter(n=>['cdrs','upload','import-history'].includes(n.page))},{label:'RATING ENGINE',items:nav.filter(n=>n.page==='rating-simulation')}].map(group=><div className="sidebar-group" key={group.label}><span className="sidebar-label">{group.label}</span>{group.items.map(item=><button key={item.page} className={'nav-item '+(page===item.page?'nav-active':'')} onClick={()=>go(item.page)}><item.icon size={21} strokeWidth={1.8}/><span>{item.label}</span>{page===item.page&&<span className="nav-dot"/>}</button>)}</div>)}<div className="sidebar-bottom"><div className="side-info"><div className="side-info-icon"><Headphones size={20}/></div><div><strong>Call charge</strong><span>Focused workspace</span></div></div><div className="sidebar-mode"><span className="status-dot"/>{session.demo?'Local design demo':'Simulation only'}</div>{!session.demo&&<button className="nav-item logout-link" onClick={logout}><LogOut size={20}/>Sign out</button>}</div></aside>
    <div className="main-shell"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={()=>setMobileOpen(true)}><Menu size={24}/></button><span className="breadcrumbs">CallMeter <span>/</span> <strong>{pageNames[page]}</strong></span></div><div className="topbar-right"><div className="mode-pill"><ShieldCheck size={16}/><span>{session.demo?'Demo data':'Simulation'}</span></div><button className="icon-button refresh-button" title="Refresh data" aria-label="Refresh data" onClick={()=>(masterPage||catalogPage||page==='import-history')?setMasterRevision(n=>n+1):void refresh()}><RefreshCw size={20} className={!masterPage&&!catalogPage&&page!=='import-history'&&loading?'spin':''}/></button><div className="profile-avatar">CM</div></div></header><main className="content"><div className="toolbar"><div><span className="eyebrow">MIITEL CALLMETER</span><h2>{pageNames[page]}</h2></div>{!masterPage&&!catalogPage&&page!=='rating-simulation'&&page!=='import-history'&&<div className="company-control"><Building2 size={18}/><select aria-label="Filter customer" value={company} onChange={e=>setCompany(e.target.value)}><option value="all">All customers</option>{companies.map(c=><option key={c}>{c}</option>)}</select><ChevronDown size={16}/></div>}</div>
      {page==='overview'&&<Overview rows={filtered} loading={loading} error={error} company={company} demo={session.demo} onRetry={refresh} onExplore={c=>{setCompany(c);go('cdrs')}}/>}
      {page==='cdrs'&&<CdrExplorer companies={companies} company={company} demo={session.demo}/>}
      {page==='upload'&&<Upload company={company} importEnabled={session.importEnabled} demo={session.demo} maxUploadBytes={session.maxUploadBytes??32*1024*1024} directUploadBase={session.directUploadBase} onComplete={refresh} canEdit={Boolean(session.masterWriteEnabled)} onHistory={()=>go('import-history')}/>}
      {page==='import-history'&&<ImportHistory companies={companies} company={company} revision={masterRevision} onUpload={()=>go('upload')}/>}
      {masterPage&&<MasterList key={page} kind={page} demo={session.demo} revision={masterRevision} canEdit={Boolean(session.masterWriteEnabled)}/>}
      {catalogPage&&<CatalogWorkspace key={page} kind={page} revision={masterRevision} canEdit={Boolean(session.masterWriteEnabled)}/>}
      {page==='rating-simulation'&&<RatingSimulation demo={session.demo}/>}
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
