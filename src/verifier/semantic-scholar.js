import { getJSON } from "./shared.js";

export function createSemanticScholarSource(){
  async function byDoi(doi){
    const j=await getJSON(`https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=title,year,externalIds,authors,venue,journal`);
    return j&&j.title?normS2(j):null;
  }
  async function byTitle(title){
    const j=await getJSON(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(title)}&limit=1&fields=title,year,externalIds,authors,venue,journal`);
    const it=j&&j.data&&j.data[0];
    return it?normS2(it):null;
  }
  return {label:"Semantic Scholar", byDoi, byTitle};
}

function normS2(p){
  const fa=p.authors&&p.authors[0]&&p.authors[0].name||"";
  const authors=((p.authors||[]).map(a=>a.name).filter(Boolean));
  return { title:p.title||"", year:p.year?String(p.year):"",
    doi:(p.externalIds&&p.externalIds.DOI)||"", firstAuthor:fa.split(/\s+/).pop()||"", authors:authors.join("; "),
    journal:(p.journal&&p.journal.name)||p.venue||"", pages:(p.journal&&p.journal.pages)||"",
    source:"Semantic Scholar", url:p.externalIds&&p.externalIds.DOI?`https://doi.org/${p.externalIds.DOI}`:"" };
}
