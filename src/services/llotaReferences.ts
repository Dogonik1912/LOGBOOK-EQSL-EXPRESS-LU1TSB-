/**
 * Catálogo oficial de referencias LLOTA.
 * La lista se obtiene del endpoint público de llota.app y se cachea localmente.
 */
export interface LLOTAReference { code: string; name: string; country: string; }
const API_URL = 'https://llota.app/api/public/references?version=lite';
const CACHE_KEY = 'logbook_llota_reference_catalog_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const OFFICIAL_REFERENCE_PATTERN = /^LL[A-Z]{2}-\d{4,5}$/i;
const asText = (v: unknown): string => typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '';
function candidateArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  return [payload?.items,payload?.references,payload?.results,payload?.data,payload?.data?.items,payload?.data?.references,payload?.data?.results].find(Array.isArray) || [];
}
function normalize(payload: unknown): LLOTAReference[] {
  const rows=candidateArray(payload).map((row:any)=>{
    const code=asText(row?.reference_code??row?.referenceCode??row?.reference??row?.ref_code??row?.ref??row?.code??row?.llota_ref??row?.llotaReference).toUpperCase();
    const name=asText(row?.name??row?.reference_name??row?.referenceName??row?.lake_name??row?.lakeName??row?.title??row?.nombre);
    const country=asText(row?.country_name??row?.countryName??row?.country??row?.pais);
    return {code,name,country};
  }).filter((item:LLOTAReference)=>OFFICIAL_REFERENCE_PATTERN.test(item.code));
  const unique=new Map<string,LLOTAReference>();
  rows.forEach((item:LLOTAReference)=>{if(!unique.has(item.code))unique.set(item.code,item);});
  return Array.from(unique.values()).sort((a,b)=>a.code.localeCompare(b.code));
}
function readCache():LLOTAReference[]{
  try{const parsed=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(Array.isArray(parsed?.items))return normalize(parsed.items);}catch{}
  return [];
}
export async function loadLLOTAReferences():Promise<LLOTAReference[]>{
  const cached=readCache();let cachedAt=0;
  try{cachedAt=Number(JSON.parse(localStorage.getItem(CACHE_KEY)||'null')?.savedAt||0);}catch{}
  if(cached.length&&Date.now()-cachedAt<CACHE_TTL_MS)return cached;
  const controller=new AbortController();const timeout=window.setTimeout(()=>controller.abort(),15000);
  try{
    const response=await fetch(API_URL,{method:'GET',headers:{Accept:'application/json'},cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error(`LLOTA catalogue HTTP ${response.status}`);
    const fresh=normalize(await response.json());
    if(!fresh.length)throw new Error('El catálogo oficial LLOTA no devolvió referencias reconocibles.');
    try{localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),items:fresh}));}catch{}
    return fresh;
  }catch(error){if(cached.length)return cached;throw error;}
  finally{window.clearTimeout(timeout);}
}
