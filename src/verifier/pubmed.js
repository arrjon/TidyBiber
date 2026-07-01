import { getJSON } from "./shared.js";

export function createPubMedSource(){
  async function search(term){
    const j=await getJSON(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=1&term=${encodeURIComponent(term)}`);
    return j&&j.esearchresult&&j.esearchresult.idlist&&j.esearchresult.idlist[0]||null;
  }
  async function summary(id){
    if(!id) return null;
    const j=await getJSON(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${encodeURIComponent(id)}`);
    const r=j&&j.result&&j.result[id];
    return r&&r.uid?normPubMed(r):null;
  }
  return {
    label:"PubMed",
    byDoi: async doi=>summary(await search(`${doi}[doi]`)),
    byTitle: async title=>summary(await search(`${title}[Title]`))
  };
}

function normPubMed(p){
  const articleIds=p.articleids||[];
  const doi=((articleIds.find(x=>String(x.idtype||"").toLowerCase()==="doi")||{}).value)||"";
  const fa=p.authors&&p.authors[0]&&p.authors[0].name||"";
  const authors=((p.authors||[]).map(a=>a.name).filter(Boolean));
  return { title:(p.title||"").replace(/\.$/,""), year:p.pubdate?String(p.pubdate).match(/\d{4}/)?.[0]||"":"",
    doi, firstAuthor:fa.split(/\s+/)[0]||"", authors:authors.join("; "), journal:p.fulljournalname||p.source||"",
    pages:p.pages||"", volume:p.volume||"", number:p.issue||"",
    source:"PubMed", url:p.uid?`https://pubmed.ncbi.nlm.nih.gov/${p.uid}/`:(doi?`https://doi.org/${doi}`:"") };
}
