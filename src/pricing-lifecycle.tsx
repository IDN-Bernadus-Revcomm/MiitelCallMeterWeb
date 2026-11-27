import React,{useState} from 'react';
import {CircleAlert} from 'lucide-react';
import type {CatalogKind} from './catalog-workspace';

type Row=Record<string,string|number|boolean|null>;
export const jakartaToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function PricingLifecycle({kind,row,onChanged}:{kind:CatalogKind;row:Row;onChanged:(message:string)=>void}){
  const [replace,setReplace]=useState(false),[endOn,setEndOn]=useState(jakartaToday),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const isDraft=row.status==='inactive'&&String(row.rate_code??row.discount_code??'').startsWith('APP-DRAFT-');
  const ended=Boolean(row.effective_to&&Date.parse(String(row.effective_to))<=Date.now());
  if(kind==='vendors')return null;
  if(kind==='customer-pricing')return isDraft?<div className="chart-note"><CircleAlert size={17}/> Approval requires an individually authenticated approver. This draft is not active.</div>:null;
  if(!isDraft&&(row.status!=='active'||ended))return null;
  async function change(action:'publish'|'end'){
    const confirm=action==='publish'?`Publish this rate for its selected effective period? A start date of today means effective now. ${replace?'An earlier overlapping exact-scope rate may be ended at the new start date. ':''}Historical rates are preserved.`:'End this rate on '+endOn+' (Jakarta)? Existing call-time history remains valid.';
    if(!window.confirm(confirm))return;setBusy(true);setError('');
    try{const r=await fetch('/api/master/workspace?resource=pricing-lifecycle',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,id:row.id,action,confirmed:true,replace_existing:replace,end_on:endOn})});const data=await r.json();if(!r.ok)throw new Error(data.message||'Rate lifecycle failed');onChanged(action==='publish'?'Rate published. Effective dates are preserved.':'Rate period ended. Historical rate retained.');}catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <div className="pricing-section"><h4>{isDraft?'Publish pricing':'End effective period'}</h4>{error&&<div className="error-box"><CircleAlert size={18}/><span>{error}</span></div>}{isDraft?<><p className="chart-note">Publish the vendor cost first, then its linked selling rate. The existing engine uses effective dates; no retroactive activation.</p><label className="checkbox-row"><input type="checkbox" checked={replace} onChange={e=>setReplace(e.target.checked)}/> Replace one earlier overlapping rate with the exact same scope</label><button className="primary-button" disabled={busy} onClick={()=>void change('publish')}>{busy?'Publishing…':'Publish Rate'}</button></>:<div className="number-inline-action"><label className="field"><span>End on (Jakarta)</span><input type="date" value={endOn} min={jakartaToday()} onChange={e=>setEndOn(e.target.value)}/></label><button className="outline-button" disabled={busy||!endOn} onClick={()=>void change('end')}>{busy?'Saving…':'End Rate'}</button></div>}</div>;
}
