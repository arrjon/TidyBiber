import { createCrossrefSource } from "./crossref.js";
import { createDataCiteSource } from "./datacite.js";
import { createDblpSource } from "./dblp.js";
import { createOpenAlexSource } from "./openalex.js";
import { createPmlrSource } from "./pmlr.js";
import { createPubMedSource } from "./pubmed.js";
import { createSemanticScholarSource } from "./semantic-scholar.js";

export const SOURCE_DESCRIPTIONS = {
  crossref: "journals, books, conferences — the broadest source",
  pubmed: "biomedical and life-science literature",
  openalex: "open scholarly index, very broad coverage",
  semanticscholar: "strong CS / AI / biomed coverage",
  datacite: "datasets, software & preprints with DOIs (DOI only)",
  dblp: "computer-science bibliography (title only)",
  pmlr: "Proceedings of Machine Learning Research (title only)"
};

export function createSources(deps){
  return {
    crossref: createCrossrefSource(deps),
    pubmed: createPubMedSource(deps),
    openalex: createOpenAlexSource(deps),
    semanticscholar: createSemanticScholarSource(deps),
    datacite: createDataCiteSource(deps),
    dblp: createDblpSource(deps),
    pmlr: createPmlrSource(deps)
  };
}
