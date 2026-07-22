import { getJSON } from "./shared.js";

export function createDblpSource(){
  return {label:"DBLP", byDoi:null, byTitle};
}

// DBLP disambiguates homonymous authors by appending a 4-digit id ("Yu Sun 0020");
// strip it so the trailing token isn't mistaken for the surname in author matching.
function stripDblpSuffix(name){ return String(name||"").replace(/\s+\d{4}$/,"").trim(); }

async function byTitle(title){
  const j=await getJSON(`https://dblp.org/search/publ/api?q=${encodeURIComponent(title)}&format=json&h=1`);
  const hit=j&&j.result&&j.result.hits&&j.result.hits.hit&&j.result.hits.hit[0]&&j.result.hits.hit[0].info;
  if(!hit)return null;
  let fa=""; const au=hit.authors&&hit.authors.author;
  const authors=(au?(Array.isArray(au)?au:[au]):[]).map(a=>stripDblpSuffix(String((a&&(a.text||a))||""))).filter(Boolean);
  if(au){ const first=Array.isArray(au)?au[0]:au; fa=stripDblpSuffix((first&&(first.text||first))||""); }
  return { title:(hit.title||"").replace(/\.$/,""), year:hit.year?String(hit.year):"",
    doi:hit.doi||"", firstAuthor:String(fa).split(/\s+/).pop()||"", authors:authors.join("; "),
    journal:hit.venue||"", pages:hit.pages||"", volume:hit.volume||"", number:hit.number||"",
    publisher:hit.publisher||"", source:"DBLP",
    url:hit.ee||hit.url||"" };
}
