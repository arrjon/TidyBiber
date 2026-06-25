export async function getJSON(url){
  const r=await fetch(url,{headers:{Accept:"application/json"}});
  return r.ok?r.json():null;
}

export async function getText(url){
  const r=await fetch(url,{headers:{Accept:"text/plain, text/html"}});
  return r.ok?r.text():null;
}

export function compactJoin(parts){
  return parts.map(x=>String(x||"").trim()).filter(Boolean).join(" ");
}
