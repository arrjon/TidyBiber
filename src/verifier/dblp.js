import { getJSON } from "./shared.js";

export function createDblpSource(){
  return {label:"DBLP", byDoi:null, byTitle};
}

async function byTitle(title){
  const j=await getJSON(`https://dblp.org/search/publ/api?q=${encodeURIComponent(title)}&format=json&h=1`);
  const hit=j&&j.result&&j.result.hits&&j.result.hits.hit&&j.result.hits.hit[0]&&j.result.hits.hit[0].info;
  if(!hit)return null;
  let fa=""; const au=hit.authors&&hit.authors.author;
  const authors=(au?(Array.isArray(au)?au:[au]):[]).map(a=>String((a&&(a.text||a))||"")).filter(Boolean);
  if(au){ const first=Array.isArray(au)?au[0]:au; fa=(first&&(first.text||first))||""; }
  return { title:(hit.title||"").replace(/\.$/,""), year:hit.year?String(hit.year):"",
    doi:hit.doi||"", firstAuthor:String(fa).split(/\s+/).pop()||"", authors:authors.join("; "),
    journal:hit.venue||"", pages:hit.pages||"", source:"DBLP",
    url:hit.ee||hit.url||"" };
}
