/* 404/400 mean "no such record" — a genuine not-found. Anything else non-OK
   (429 rate limit, 5xx outage) is thrown so callers can report a source error
   instead of silently treating the entry as unverifiable. */
export async function getJSON(url){
  const r=await fetch(url,{headers:{Accept:"application/json"}});
  if(r.ok) return r.json();
  if(r.status===404||r.status===400) return null;
  throw new Error(`HTTP ${r.status}`);
}

export async function getText(url){
  const r=await fetch(url,{headers:{Accept:"text/plain, text/html"}});
  if(r.ok) return r.text();
  if(r.status===404||r.status===400) return null;
  throw new Error(`HTTP ${r.status}`);
}

export function compactJoin(parts){
  return parts.map(x=>String(x||"").trim()).filter(Boolean).join(" ");
}
