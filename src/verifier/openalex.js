import { getJSON } from "./shared.js";

export function createOpenAlexSource({mailtoParam}){
  async function byDoi(doi){
    const j=await getJSON(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}${mailtoParam("?")}`);
    return j&&j.id?normOpenAlex(j):null;
  }
  async function byTitle(title){
    const j=await getJSON(`https://api.openalex.org/works?filter=title.search:${encodeURIComponent(title)}&per-page=1${mailtoParam("&")}`);
    const it=j&&j.results&&j.results[0];
    return it?normOpenAlex(it):null;
  }
  async function candidatesByTitle(title){
    const j=await getJSON(`https://api.openalex.org/works?filter=title.search:${encodeURIComponent(title)}&per-page=5${mailtoParam("&")}`);
    return ((j&&j.results)||[]).map(w=>({...normOpenAlex(w), type:w.type||""}));
  }
  return {label:"OpenAlex", byDoi, byTitle, candidatesByTitle};
}

function normOpenAlex(w){
  const fa=w.authorships&&w.authorships[0]&&w.authorships[0].author&&w.authorships[0].author.display_name||"";
  const authors=((w.authorships||[]).map(a=>a.author&&a.author.display_name).filter(Boolean));
  const src=w.primary_location&&w.primary_location.source||{};
  const venue=src.display_name||"";
  const publisher=src.host_organization_name||"";
  const b=w.biblio||{};
  const pages=b.first_page?(b.last_page&&b.last_page!==b.first_page?`${b.first_page}-${b.last_page}`:b.first_page):"";
  return { title:w.title||w.display_name||"", year:w.publication_year?String(w.publication_year):"",
    doi:(w.doi||"").replace(/^https?:\/\/(dx\.)?doi\.org\//i,""),
    firstAuthor:fa.split(/\s+/).pop()||"", authors:authors.join("; "), journal:venue, pages, publisher,
    volume:b.volume||"", number:b.issue||"", retracted:!!w.is_retracted,
    source:"OpenAlex", url:w.doi||w.id||"" };
}
