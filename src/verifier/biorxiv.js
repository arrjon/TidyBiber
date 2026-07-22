import { getJSON } from "./shared.js";

/* openRxiv (bioRxiv/medRxiv) preprint→published resolver.

   Their `details` endpoint records the *published* journal DOI a preprint became, so a single
   DOI-anchored call replaces a fuzzy title search — a higher-confidence path to
   the published version. bioRxiv and medRxiv share the 10.1101 DOI prefix and
   can't be told apart from the DOI alone, so we try both. */
const SERVERS = ["biorxiv", "medrxiv"];

export function createBioRxivSource(){
  // Given an openRxiv preprint DOI (10.1101/*), return the journal DOI the server
  // records it was published as — or "" when unknown / not yet published.
  async function publishedDoi(doi){
    const d = String(doi || "").trim();
    if(!/^10\.1101\//i.test(d)) return "";
    for(const server of SERVERS){
      let j = null;
      // A wrong-server or unknown DOI answers 200 with an empty collection, so a
      // throw here is a genuine transient failure — try the other server, don't
      // conclude "not published".
      try{ j = await getJSON(`https://api.${server}.org/details/${server}/${d}`); }
      catch(err){ continue; }
      const coll = (j && j.collection) || [];
      // Newest version first — later versions carry the published DOI once linked.
      for(let i = coll.length - 1; i >= 0; i--){
        const pub = String((coll[i] && coll[i].published) || "").trim();
        if(pub && pub.toLowerCase() !== "na") return pub;
      }
    }
    return "";
  }
  return { label: "bioRxiv/medRxiv", publishedDoi };
}
