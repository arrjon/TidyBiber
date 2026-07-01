import { getText } from "./shared.js";

const PMLR_BASE="https://proceedings.mlr.press";

export function createPmlrSource({getConfig, parseBib, titleSimilarity}){
  const cache={volumes:null, records:new Map()};

  async function volumeIds(){
    if(cache.volumes) return cache.volumes;
    cache.volumes=(async()=>{
      const html=await getText(`${PMLR_BASE}/`);
      const ids=[]; const seen=new Set();
      const re=/href=["']\/?((?:v|r)\d+)\/?["']/gi;
      let m;
      while((m=re.exec(html||""))){
        const id=m[1].toLowerCase();
        if(!seen.has(id)){ seen.add(id); ids.push(id); }
      }
      return ids;
    })();
    return cache.volumes;
  }

  async function volumeRecords(id){
    if(cache.records.has(id)) return cache.records.get(id);
    const promise=(async()=>{
      try{
        const bib=await getText(`${PMLR_BASE}/${id}/assets/bib/bibliography.bib`);
        if(!bib) return [];
        return parseBib(bib).entries
          .filter(e=>e.type==="inproceedings" && e.fields.title)
          .map(normPmlrEntry);
      }catch(err){ return []; }
    })();
    cache.records.set(id,promise);
    return promise;
  }

  async function byTitle(title){
    const ids=await volumeIds();
    const threshold=Math.max(0.75,getConfig().verification.titleSimThreshold||0);
    for(let i=0;i<ids.length;i+=6){
      const batches=await Promise.all(ids.slice(i,i+6).map(volumeRecords));
      const hits=batches.flat()
        .map(r=>({...r,_sim:titleSimilarity(title,r.title).score,_passes:titleSimilarity(title,r.title).passes(threshold)}))
        .filter(r=>r._passes)
        .sort((a,b)=>b._sim-a._sim);
      if(hits[0]){ const {_sim,_passes,...rec}=hits[0]; return rec; }
    }
    return null;
  }

  return {label:"PMLR", byDoi:null, byTitle};
}

function cleanPmlrValue(s){ return String(s||"").replace(/[{}]/g,"").replace(/\s+/g," ").trim(); }
function pmlrFirstAuthor(author){
  const first=String(author||"").split(/\s+and\s+/i)[0].trim();
  return first.includes(",") ? first.split(",")[0].trim() : first.split(/\s+/).pop()||"";
}
function normPmlrEntry(e){
  const f=e.fields;
  const authors=String(f.author||"").split(/\s+and\s+/i).map(cleanPmlrValue).filter(Boolean);
  return {
    title:cleanPmlrValue(f.title),
    year:cleanPmlrValue(f.year),
    doi:"",
    firstAuthor:pmlrFirstAuthor(f.author),
    authors:authors.join("; "),
    journal:cleanPmlrValue(f.booktitle||f.series||"Proceedings of Machine Learning Research"),
    pages:cleanPmlrValue(f.pages).replace(/--/g,"-"),
    publisher:cleanPmlrValue(f.publisher||"PMLR"),
    source:"PMLR",
    url:cleanPmlrValue(f.url||f.pdf)
  };
}
