import { compactJoin, getJSON } from "./shared.js";

export function createCrossrefSource({mailtoParam}){
  async function byDoi(doi){
    const j=await getJSON(`https://api.crossref.org/works/${encodeURIComponent(doi)}${mailtoParam("?")}`);
    return j&&j.message?normCrossref(j.message):null;
  }
  async function byTitle(title){
    const j=await getJSON(`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(title)}&rows=1${mailtoParam("&")}`);
    const it=j&&j.message&&j.message.items&&j.message.items[0];
    return it?normCrossref(it):null;
  }
  async function candidatesByTitle(title){
    const j=await getJSON(`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(title)}&rows=5${mailtoParam("&")}`);
    const items=(j&&j.message&&j.message.items)||[];
    return items.map(m=>({...normCrossref(m), type:m.type||""}));
  }
  return {label:"Crossref", byDoi, byTitle, candidatesByTitle};
}

function normCrossref(m){
  const dp=(m.issued&&m.issued["date-parts"])||(m.published&&m.published["date-parts"]);
  const dateParts=dp&&dp[0]||[];
  const authors=((m.author||[]).map(a=>a.name||compactJoin([a.given,a.family])).filter(Boolean));
  return { title:(m.title&&m.title[0])||"", year:dateParts[0]?String(dateParts[0]):"",
    doi:m.DOI||"", firstAuthor:(m.author&&m.author[0]&&(m.author[0].family||""))||"",
    authors:authors.join("; "), journal:(m["container-title"]&&m["container-title"][0])||"", pages:m.page||"",
    volume:m.volume||"", number:m.issue||"", month:dateParts[1]?String(dateParts[1]):"",
    articleno:m["article-number"]||"", publisher:m.publisher||"",
    source:"Crossref", url:m.URL||(m.DOI?`https://doi.org/${m.DOI}`:"") };
}
