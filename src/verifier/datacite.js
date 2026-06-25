import { compactJoin, getJSON } from "./shared.js";

export function createDataCiteSource(){
  return {label:"DataCite", byDoi, byTitle:null};
}

async function byDoi(doi){
  const j=await getJSON(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`);
  const a=j&&j.data&&j.data.attributes;
  if(!a)return null;
  const fa=a.creators&&a.creators[0]&&(a.creators[0].familyName||a.creators[0].name||"")||"";
  const authors=((a.creators||[]).map(c=>c.name||compactJoin([c.givenName,c.familyName])).filter(Boolean));
  return { title:(a.titles&&a.titles[0]&&a.titles[0].title)||"", year:a.publicationYear?String(a.publicationYear):"",
    doi:a.doi||"", firstAuthor:fa.split(/[\s,]+/).filter(Boolean)[0]||"", authors:authors.join("; "),
    journal:(a.container&&a.container.title)||a.publisher||"", pages:"", source:"DataCite",
    url:a.url||(a.doi?`https://doi.org/${a.doi}`:"") };
}
