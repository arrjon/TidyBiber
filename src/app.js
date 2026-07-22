import { createSources, SOURCE_DESCRIPTIONS } from "./verifier/sources.js";
import { createBioRxivSource } from "./verifier/biorxiv.js";

/* ============================================================
   TidyBiber — app logic. No third-party dependencies; no network except
   the optional verifier (Crossref, OpenAlex, PMLR, and friends).
   ============================================================ */

/* ---------- 1. DEFAULT CONFIG ------------------------------ */
const DEFAULT_CONFIG = {
  // Bump when the bundled field schema below changes, so older saved configs
  // pick up the new requiredFields / optionalFields / fieldOrder on next load.
  schemaVersion: 2,
  // Required fields per entry type. "OR" groups: use "a|b" meaning at least one.
  // Tuned to this library's biblatex style: `year` OR `date`, `journal` OR `journaltitle`.
  requiredFields: {
    article:       ["author","title","journal|journaltitle","year|date"],
    book:          ["author|editor","title","publisher","year|date"],
    inproceedings: ["author","title","booktitle","year|date"],
    conference:    ["author","title","booktitle","year|date"],
    incollection:  ["author","title","booktitle","publisher","year|date"],
    inbook:        ["author","title","chapter|booktitle","publisher","year|date"],
    phdthesis:     ["author","title","school|institution","year|date"],
    techreport:    ["author","title","institution|organization","year|date"],
  },
  // Fields allowed but optional; anything else triggers an "unexpected field" warning.
  optionalFields: ["volume","number","pages","month","doi","url","editor",
    "publisher","series","address","edition","organization","school","institution","type","keywords",
    "booktitle","journal","location","articleno","numpages","issue","chapter"],
  // Words that must keep exact casing — protected with {braces} in titles.
  protectedWords: ["Bayesian","Gaussian","Markov","Monte Carlo","Euler","Newton",
    "Fourier","Hilbert","Lipschitz","Gibbs","Poisson","Laplace","Hessian","Jacobian",
    "Riemann","Lagrangian","Hamiltonian","COVID-19","DNA","RNA","mRNA","CRISPR","Akaike",
    "AIC","BIC","AI","ML","GPU","CPU","GPT","CNN","RNN","LSTM",
    "SIAM","JMLR","ICML","ICLR","MCMC","IEEE"],
  // Citation key style: default = LastnameYEARword ; templated otherwise.
  keyStyle: {
    mode: "default",            // "default" | "template" | "off"
    template: "{authorlast}{year}{word}",  // tokens: {authorlast}{authorlasts}{year}{word}{type}
    case: "lower",             // key case: "lower" | "title" | "upper" | "asis"
    separator: "",             // between tokens, e.g. Author_2021_word
    stripStopwords: true       // drop the/a/an/on/of/for… for {word}
  },
  formatting: {
    indent: 2,                 // spaces inside an entry
    fieldOrder: ["author","editor","title","booktitle","journal","journaltitle",
      "year","date","month","volume","number","issue","pages","publisher","series",
      "address","location","edition","chapter","doi","url","keywords"],
                               // canonical field order; unlisted appended alphabetically
    alignEquals: true,         // line up = signs
    quoteStyle: "braces",      // "braces" -> field = {..}  |  "quotes" -> field = ".."
    lowercaseType: true,       // @Article -> @article
    lowercaseFieldNames: true, // Author= -> author=
    trailingComma: true,
    dropFields: ["abstract", "rating", "read", "issn", "isbn", "langid", "language", "eprint", "elocation-id", "mesh", "annote",
      "pubstate", "eprinttype", "eprintclass", "primaryclass", "shortjournal", "shorttitle", "pmid", "pst", "pmc", "copyright",
      "timestamp"],  // remove these fields from the working copy
    dropUrlWhenDoi: true,      // remove url when doi is present
    titlecaseTitles: false,    // Preserve title spelling by default; opt in to Title-Case
    stripDoubleBraces: true,   // {{Journal of Tea}} → {Journal of Tea} on import
    dropAllCaps: true          // suggest Title Case for ALL-CAPS titles (fix suggestion only, never applied on import)
  },
  ordering: {
    sortBy: "key",             // "key" | "year" | "author" | "type" | "none"
    direction: "asc"           // "asc" | "desc"
  },
  checks: {
    requirePageRangeDash: true,   // 12-34 should be 12--34
    fourDigitYear: true,
    doiFormat: true,              // doi must not be a full URL
    detectDuplicateKeys: true,
    detectDuplicateDOIs: true,
    detectDuplicateEntries: true, // same first author + similar title under two keys
    warnUnknownFields: true,
    monthAbbrev: true,            // month should be an integer 1..12
    dateToYear: true              // biblatex date should be reduced to a plain year
  },
  autofix: {
    renameKeys: false,             // allow Auto-fix to rename citation keys
    fixDoi: false                  // allow Auto-fix to apply DOI values found by online verification
  },
  verification: {
    // Sources are tried in this order. Disable or reorder them in Config.
    //   crossref | pubmed | openalex | semanticscholar | datacite | dblp | pmlr
    sourceOrder: ["crossref","pubmed","openalex","semanticscholar","datacite","dblp","pmlr"],
    sources: ["crossref","pubmed","openalex","semanticscholar","datacite","dblp","pmlr"],
    mailto: "",                   // optional: your email for Crossref/OpenAlex "polite pool" (faster, nicer). Blank = anonymous access.
    titleSimThreshold: 0.6,       // below this Jaccard similarity → flag possible mismatch
                                  // (published-version lookup and title-only DOI suggestions
                                  //  additionally enforce a stricter 0.75 minimum)
    delayMs: 120,                 // pause between entries to stay polite to the APIs
    checkUrls: true,              // ping the url field to detect dead links
    urlTimeoutMs: 8000,           // give up on a url after this long
    findPublished: true           // for arXiv/preprints, look for a published (peer-reviewed) version
  }
};
const ENTRY_TYPES=["article","book","inproceedings","conference","incollection","inbook","phdthesis","techreport","misc"];

const STOPWORDS = new Set(("a an and are as at be by de do does die for from has he in is it its of on or "+
  "that the to was were will with we our this these those an via using toward towards "+
  "into over under about between among").split(" "));
// Common misspelled field names → their correct name (for one-click autocorrect).
const FIELD_TYPOS = { dio:"doi", doy:"doi", tolume:"volume", vol:"volume", months:"month",
  jounal:"journal", jornal:"journal", titel:"title", autor:"author", auther:"author",
  adress:"address", yr:"year", pp:"pages", page:"pages", keyword:"keywords", url1:"url",
  editors:"editor", publishers:"publisher", abstrac:"abstract" };
const MONTHMAP = { jan:"1", january:"1", feb:"2", february:"2", mar:"3", march:"3",
  apr:"4", april:"4", may:"5", jun:"6", june:"6", jul:"7", july:"7",
  aug:"8", august:"8", sep:"9", sept:"9", september:"9", oct:"10", october:"10",
  nov:"11", november:"11", dec:"12", december:"12" };

let CONFIG = structuredClone(DEFAULT_CONFIG);  // session-only; persist via Export/Import JSON
const SOURCES = createSources({mailtoParam, parseBib, titleSimilarity, getConfig:()=>CONFIG});
// Not a cascade source — a DOI-anchored preprint→published resolver used only by
// the published-version lookup, so it stays out of CONFIG.verification.sources.
const OPENRXIV = createBioRxivSource();
let ENTRIES = [];        // parsed entries with diagnostics
let RAW_PREAMBLE = "";   // @string / @preamble / @comment kept verbatim
let CURRENT_FILE_NAME = "";
let CUR_FILTER = "all";
let CUR_SEARCH = "";
let CUR_ISSUE = "";      // active dynamic issue-category filter ("" = none)

/* ---------- 2. CONFIG ------------------------------------- */
/* The config lives only for the session. To keep it, use Export JSON; to reuse
   it, Import JSON. "Re-lint" applies the current settings to the loaded file. */
// merge a saved/imported object onto defaults, applying the schema migration
function migrateConfig(saved){
  const cfg = mergeDeep(structuredClone(DEFAULT_CONFIG), saved||{});
  cfg.verification.sourceOrder = normalizeSourceOrder(cfg.verification.sourceOrder, cfg.verification.sources);
  cfg.verification.sources = (cfg.verification.sources||[])
    .filter((s,i,a)=>SOURCES[s] && a.indexOf(s)===i);
  if((saved&&saved.schemaVersion||0) < DEFAULT_CONFIG.schemaVersion){
    cfg.requiredFields = structuredClone(DEFAULT_CONFIG.requiredFields);
    cfg.optionalFields = structuredClone(DEFAULT_CONFIG.optionalFields);
    cfg.formatting.fieldOrder = structuredClone(DEFAULT_CONFIG.formatting.fieldOrder);
    cfg.schemaVersion = DEFAULT_CONFIG.schemaVersion;
  }
  return cfg;
}
function mergeDeep(t,s){
  for(const k in s){
    if(s[k]&&typeof s[k]==="object"&&!Array.isArray(s[k])) t[k]=mergeDeep(t[k]||{},s[k]);
    else t[k]=s[k];
  }
  return t;
}

/* ---------- 3. BIBTEX PARSER ------------------------------- */
/* Hand-written tokenizer: handles nested braces, quoted values, and
   @string/@preamble/@comment. Bare values (numbers, @string/month macros,
   and # concatenations) are tagged so the serializer re-emits them verbatim
   without braces — bracing `journal = jmlr` would turn a macro reference
   into the literal string "jmlr". */
function parseBib(text){
  const entries=[]; const preambleParts=[];
  let i=0; const n=text.length;
  function skipWs(){ while(i<n && /\s/.test(text[i])) i++; }
  while(i<n){
    skipWs();
    if(i>=n) break;
    if(text[i]!=="@"){ i++; continue; }
    const at=i; i++; // past @
    let type="";
    while(i<n && /[A-Za-z]/.test(text[i])) type+=text[i++];
    type=type.toLowerCase();
    skipWs();
    const opener=text[i];
    if(opener!=="{" && opener!=="("){ continue; }
    const closer = opener==="{" ? "}" : ")";
    i++; // past opener
    if(type==="comment"||type==="string"||type==="preamble"){
      // capture whole block verbatim, counting the SAME delimiter that opened it.
      // @string(...) is as valid as @string{...}; tracking only braces here would
      // overrun a paren-delimited block and swallow every entry after it.
      let depth=1;
      while(i<n && depth>0){
        if(text[i]===opener)depth++; else if(text[i]===closer)depth--;
        i++;
      }
      preambleParts.push(text.slice(at,i));
      continue;
    }
    // normal entry: key , field=value ...
    skipWs();
    let key="";
    while(i<n && text[i]!=="," && !/\s/.test(text[i]) && text[i]!==closer) key+=text[i++];
    const fields=[];
    skipWs();
    while(i<n && text[i]!==closer){
      if(text[i]===","){ i++; skipWs(); continue; }
      let fname="";
      while(i<n && /[^=\s,}]/.test(text[i])) fname+=text[i++];
      skipWs();
      if(text[i]!=="="){ // malformed; bail this field
        while(i<n && text[i]!=="," && text[i]!==closer) i++;
        continue;
      }
      i++; skipWs(); // past =
      let val="", kind="bare";
      if(text[i]==="{"){
        kind="brace";
        let depth=0, rawval="";
        do{
          if(text[i]==="{")depth++; else if(text[i]==="}")depth--;
          rawval+=text[i]; i++;
        }while(i<n && depth>0);
        val=rawval.slice(1,-1);
      }else if(text[i]==='"'){
        kind="quote";
        i++; let depth=0;
        while(i<n){
          if(text[i]==="{")depth++; else if(text[i]==="}")depth--;
          else if(text[i]==='"'&&depth===0){ i++; break; }
          val+=text[i]; i++;
        }
      }else{ // bareword / number / macro / # concatenation — read to a top-level comma
        // or the entry closer; commas inside quoted or braced concat parts don't count.
        let inQuote=false, depth=0;
        while(i<n){
          const c=text[i];
          if(inQuote){
            if(c==="{")depth++; else if(c==="}")depth--;
            else if(c==='"'&&depth===0) inQuote=false;
          }
          else if(c==='"') inQuote=true;
          else if(c==="{") depth++;
          else if(c==="}"){ if(depth===0) break; depth--; }
          else if(depth===0 && (c===","||c===closer)) break;
          val+=c; i++;
        }
        val=val.trim();
      }
      const fn=fname.trim().toLowerCase();
      if(fn) fields.push({name:fn, value:val.trim(), kind});
      skipWs();
    }
    if(text[i]===closer) i++;
    const fmap={}, bmap={};
    for(const f of fields) if(!(f.name in fmap)){
      fmap[f.name]=f.value;
      if(f.kind==="bare") bmap[f.name]=true;
    }
    const raw=text.slice(at,i);
    // _orig = pristine source, never mutated (shown in the "Original" pane).
    // bare  = fields whose value was a bareword/macro/concat; serialized without braces.
    entries.push({type, key:key.trim(), fields:fmap, bare:bmap, _orig:raw});
  }
  return {entries, preamble:preambleParts.join("\n\n")};
}

/* ---------- 4. LINTER -------------------------------------- */
function lintAll(entries){
  const keySeen={}, doiSeen={};
  // Fuzzy duplicate detection (computed first — it feeds the key suggestions
  // below): same first author + near-identical title means the same work is
  // probably cited under two keys. Distinct `number` fields exempt numbered
  // reports/parts that legitimately share a title; conflicting first names
  // ("Smith, Ann" vs "Smith, Bob") exempt homonymous authors.
  const DUP_TITLE_SIM=0.85;
  const dupOf=new Map();   // later entry → earlier entry it duplicates
  if(CONFIG.checks.detectDuplicateEntries){
    const buckets=new Map();   // first-author last name → entries seen so far
    for(const x of entries){
      const first=authorPartsFromBib(x.fields.author||x.fields.editor||"")[0]||null;
      const title=cleanField(x.fields.title);
      if(!first || !title) continue;
      const num=cleanField(x.fields.number);
      const bucket=buckets.get(first.last)||[];
      for(const prev of bucket){
        if(prev.num && num && prev.num!==num) continue;
        if(!authorFirstMatches(prev.first,first)) continue;
        if(titleSimilarity(prev.title,title).passes(DUP_TITLE_SIM)){ dupOf.set(x,prev.e); break; }
      }
      bucket.push({e:x,first,title,num});
      buckets.set(first.last,bucket);
    }
  }
  // Collision-free styled-key suggestions (JabRef-style disambiguation): an
  // entry whose key already matches its generated key keeps it; every other
  // suggestion gets a/b/c… appended until it clashes with neither an existing
  // key nor another suggestion. Entries flagged as possible duplicates get NO
  // suggestion — disambiguating a duplicate's key would entrench it (merge or
  // delete is the fix); the survivor gets a clean suggestion on the next pass.
  const suggestedKey=new Map();
  if(CONFIG.keyStyle.mode!=="off"){
    const taken=new Set(entries.map(x=>x.key.toLowerCase()));
    const claimed=new Set();
    const pending=[];
    for(const x of entries){
      const base=makeKey(x);
      if(!base) continue;
      if(x.key.toLowerCase()===base.toLowerCase()){ claimed.add(base.toLowerCase()); suggestedKey.set(x,x.key); }
      else if(!dupOf.has(x)) pending.push([x,base]);
    }
    for(const [x,base] of pending){
      let cand=base;
      for(let i=0; claimed.has(cand.toLowerCase()) ||
            (taken.has(cand.toLowerCase()) && cand.toLowerCase()!==x.key.toLowerCase()); i++){
        cand=base+(i<26?String.fromCharCode(97+i):String(i+1));
      }
      claimed.add(cand.toLowerCase());
      suggestedKey.set(x,cand);
    }
  }
  for(const e of entries){
    e.issues=[];
    const C=CONFIG, ch=C.checks;
    // actions: array of {label, kind, field?, value?, to?, auto?} for one-click autocorrect
    const add=(sev,msg,fix,actions)=>e.issues.push({sev,msg,fix:fix||"",actions:actions||[]});

    // entry type known?
    if(!C.requiredFields[e.type] && e.type!=="misc"){
      add("warn",`Unknown entry type @${e.type}`);
    }
    // required fields
    const req=C.requiredFields[e.type]||C.requiredFields.misc||[];
    for(const r of req){
      const alts=r.split("|");
      if(!alts.some(a=>e.fields[a]&&e.fields[a].length)){
        const arxivJournal=alts.includes("journal") ? arxivPreprintJournal(e) : "";
        if(arxivJournal){
          add("warn",`Missing journal; DOI/URL looks like arXiv`,arxivJournal,
            [{label:"Set journal → arXiv preprint",kind:"setField",field:"journal",value:arxivJournal,auto:true}]);
        }else if(alts.includes("booktitle") && isProceedingsEventTitleAlias(e,"eventtitle")){
          add("warn","Use booktitle instead of eventtitle for proceedings entries","booktitle",
            [{label:"Rename eventtitle → booktitle",kind:"renameField",field:"eventtitle",to:"booktitle",auto:true}]);
        }else{
          add("err",`Missing required field: ${alts.join(" or ")}`);
        }
      }
    }
    // unknown fields
    if(ch.warnUnknownFields){
      const CORE=["author","editor","title","year"]; // always valid
      const known=new Set([...CORE,...(req.flatMap(r=>r.split("|"))),...C.optionalFields]);
      for(const f in e.fields) if(!known.has(f)){
        if(isProceedingsEventTitleAlias(e,f)) continue;
        const to=FIELD_TYPOS[f];
        const acts = to
          ? [{label:`Rename → ${to}`,kind:"renameField",field:f,to,auto:true}]
          : [{label:"Remove field",kind:"removeField",field:f},
             {label:"Remove from all entries",kind:"removeFieldAll",field:f},
             {label:"Allow this field",kind:"allowField",field:f}];
        add("warn",`Unexpected field: ${f}`,"",acts);
      }
    }
    // year
    if(ch.fourDigitYear && e.fields.year && !/^\d{4}$/.test(e.fields.year.replace(/[{}]/g,"").trim())){
      const y=(e.fields.year.match(/\d{4}/)||[])[0];
      add("warn",`Year is not a 4-digit number: "${e.fields.year}"`, y||"",
        y?[{label:`Fix → ${y}`,kind:"setField",field:"year",value:y,auto:true}]:[]);
    }
    // biblatex date → plain year
    if(ch.dateToYear && e.fields.date){
      const dRaw=e.fields.date.replace(/[{}]/g,"").trim();
      const dy=(dRaw.match(/\d{4}/)||[])[0];
      const yRaw=(e.fields.year||"").replace(/[{}]/g,"").trim();
      if(dy){
        if(!yRaw)
          add("warn",`Use year instead of date field: "${dRaw}"`,dy,
            [{label:`Convert date → year ${dy}`,kind:"convertDateToYear",auto:true}]);
        else if(yRaw!==dy)
          // A genuine conflict (often print-edition vs online-first year) — let the user pick, don't auto-apply.
          add("warn",`year (${yRaw}) and date (${dRaw}) disagree`,dy,
            [{label:`Use date's year ${dy}`,kind:"convertDateToYear"},
             {label:"Remove date field",kind:"removeField",field:"date"}]);
        else
          add("warn",`Redundant date field duplicates year (${yRaw})`,"",
            [{label:"Remove date field",kind:"removeField",field:"date",auto:true}]);
      }
    }
    // pages
    if(ch.requirePageRangeDash && e.fields.pages){
      const p=cleanField(e.fields.pages);
      const fixed=canonicalPages(p);
      if(fixed!==p){
        add("warn",`Page range should use BibTeX double dash: ${fixed}`,fixed,
          [{label:`Fix → ${fixed}`,kind:"setField",field:"pages",value:fixed,auto:true}]);
      }
    }
    // doi
    if(ch.doiFormat && e.fields.doi){
      if(doiNeedsBareFix(e.fields.doi)){
        const bare=normDoi(e.fields.doi);
        add("warn","DOI should be bare (10.xxxx/...)",bare,
          [{label:"Fix → bare DOI",kind:"setField",field:"doi",value:bare,auto:true}]);
      }
    }
    if(ch.doiFormat && !e.fields.doi){
      const arxivDoi=arxivDoiFor(e);
      if(arxivDoi && !preprintDoiBlockedByVenue(e,arxivDoi)){
        add("warn","arXiv URL/preprint can use canonical DOI",arxivDoi,
          [{label:`Add DOI ${arxivDoi}`,kind:"setField",field:"doi",value:arxivDoi,auto:true}]);
      }
    }
    // month
    if(ch.monthAbbrev && e.fields.month){
      const raw=e.fields.month.replace(/[{}"]/g,"").trim().toLowerCase().replace(/\.+$/,"");
      const n=/^\d+$/.test(raw) ? parseInt(raw,10) : NaN;
      const fixed=MONTHMAP[raw]||"";
      if(!(n>=1 && n<=12)){
        add("warn",`Month must be an integer from 1 to 12: "${e.fields.month}"`, fixed,
          fixed?[{label:`Fix → ${fixed}`,kind:"setField",field:"month",value:fixed,auto:true}]:[]);
      }
    }
    // ALL-CAPS titles are suggested into Title Case, never rewritten on import —
    // acronyms ("CRISPR", "DNA") would be mangled, so the user reviews each one.
    // A fully {braced} title comes back unchanged from titleCase and stays quiet.
    if(C.formatting.dropAllCaps && e.fields.title && !(e.bare&&e.bare.title)){
      const t=e.fields.title;
      if(/[A-Z]/.test(t) && !/[a-z]/.test(t)){
        const fixed=titleCase(t);
        if(fixed!==t)
          add("warn","Title is ALL-CAPS",fixed,
            [{label:"Convert to Title Case",kind:"setField",field:"title",value:fixed}]);
      }
    }
    // protected words not braced in title — case-insensitive, matching what the
    // formatter (protectWordsInTitle) rewrites, so every silent casing change
    // the export would make is also surfaced as a lint issue
    if(e.fields.title){
      for(const w of CONFIG.protectedWords){
        const re=new RegExp(`(^|[^{\\w])(${escapeRe(w)})([^}\\w]|$)`,"gi");
        if(re.test(e.fields.title))
          add("warn",`"${w}" in title is not brace-protected (casing may be lost)`,"{"+w+"}",
            [{label:"Brace it",kind:"setField",field:"title",value:protectWordsInTitle(e.fields.title),auto:true}]);
      }
    }
    // citation key style — the suggested key is pre-disambiguated, so renaming
    // (manually or via Auto-fix) can never collide with another entry's key
    if(CONFIG.keyStyle.mode!=="off"){
      const want=suggestedKey.get(e)||"";
      if(want && want.toLowerCase()!==e.key.toLowerCase())
        add("warn",`Key "${e.key}" ≠ expected style "${want}"`,want,
          [{label:`Rename key → ${want}`,kind:"setKey",value:want,auto:!!CONFIG.autofix.renameKeys}]);
    }
    if(ch.detectDuplicateKeys){
      const lk=e.key.toLowerCase();
      if(keySeen[lk]) add("err",`Duplicate citation key "${e.key}"`);
      keySeen[lk]=true;
    }
    if(ch.detectDuplicateDOIs && e.fields.doi){
      const d=normDoi(e.fields.doi);
      if(doiSeen[d]) add("warn",`Duplicate DOI "${d}" (also in ${doiSeen[d]})`);
      else doiSeen[d]=e.key;
    }
    if(ch.detectDuplicateEntries && dupOf.has(e)){
      const other=dupOf.get(e);
      add("warn",`Possible duplicate of "${other.key}" (same first author, similar title)`,"",
        [{label:`Merge into "${other.key}"`,kind:"mergeInto",target:other.key},
         {label:"Delete this entry",kind:"deleteEntry"}]);
    }
    const vIssue=verificationIssue(e);
    if(vIssue) add(vIssue.sev,vIssue.msg);
    e.errCount=e.issues.filter(x=>x.sev==="err").length;
    e.warnCount=e.issues.filter(x=>x.sev==="warn").length;
  }
  return entries;
}
const VERIFY_PROBLEM_RE=/mismatch|differs|fabrication|resolves to a different|Missing|Year:|author:|Author list|Journal\/venue:|abbreviated|Pages:|unreachable|timed out|Published version|Preprint|RETRACTED/i;
const REPORT_CACHE_START="-----BEGIN TIDYBIBER VERIFICATION CACHE-----";
const REPORT_CACHE_END="-----END TIDYBIBER VERIFICATION CACHE-----";
function verificationIssue(e){
  const v=e._verify;
  if(!v || v.status==="unchecked") return null;
  if(v.status==="error") return {sev:"err",msg:`Verification error: ${(v.notes&&v.notes[0])||"check failed"}`};
  // A retracted work is the most serious finding — flag it as an error regardless
  // of how well the other fields match.
  if(v.retracted) return {sev:"err",msg:`Verification: RETRACTED — this reference is marked retracted${v.source?` (${v.source})`:""}`};
  // "not found" is not an error — it's its own status, surfaced as a category/badge, not a lint issue.
  if(v.status==="notfound") return null;
  const hasProblem=v.notes&&v.notes.some(n=>VERIFY_PROBLEM_RE.test(n));
  const badUrl=v.urlStatus&&!v.urlStatus.ok;
  if(v.status==="found" && (hasProblem||badUrl)){
    const note=(v.notes&&v.notes.find(n=>VERIFY_PROBLEM_RE.test(n))) ||
      (badUrl?`URL ${v.urlStatus.reason}`:"verification warning");
    return {sev:"warn",msg:`Verification: ${note}`};
  }
  return null;
}
function isProceedingsEventTitleAlias(e,f){
  return f==="eventtitle" && ["inproceedings","conference"].includes(e.type) && !e.fields.booktitle && !!e.fields.eventtitle;
}
function arxivPreprintJournal(e){
  const id=arxivId(e);
  return id ? `arXiv preprint arXiv:${id}` : "";
}
function arxivDoiFor(e){
  const id=arxivId(e);
  return id ? `10.48550/arxiv.${id.replace(/v\d+$/i,"").toLowerCase()}` : "";
}
function escapeRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
function normDoi(d){
  let s=String(d||"").replace(/[{}]/g,"").trim();
  const m=s.match(/10\.\d{4,9}\/[^\s"'<>]+/i);
  if(m) s=m[0];
  s=s
    .replace(/^doi\s*:\s*/i,"")
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i,"")
    .replace(/[?#].*$/,"")
    .replace(/[),.;:]+$/,"")
    .trim();
  try{ s=decodeURIComponent(s); }catch(_){}
  return s.toLowerCase();
}
function doiNeedsBareFix(d){
  const raw=String(d||"").replace(/[{}]/g,"").trim().toLowerCase();
  return !!raw && normDoi(d)!==raw;
}

/* ---------- 5. CITATION KEY GENERATOR ---------------------- */
function firstAuthorLast(authorStr){
  if(!authorStr) return "anon";
  let a=authorStr.split(/\s+and\s+/i)[0].trim().replace(/[{}]/g,"");
  if(a.includes(",")) return keyNamePart(a.split(",")[0]);
  const parts=a.split(/\s+/); return parts[parts.length-1];
}
function keyNamePart(s){
  return translitKey(s).trim().replace(/[^A-Za-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}
function firstMeaningfulWord(title){
  if(!title) return "";
  const words=title.replace(/[{}]/g,"").replace(/[^A-Za-z0-9\s-]/g," ").split(/\s+/).filter(Boolean);
  for(const w of words){
    if(CONFIG.keyStyle.stripStopwords && STOPWORDS.has(w.toLowerCase())) continue;
    return w;
  }
  return words[0]||"";
}
function applyCase(s,mode){
  if(mode==="lower")return s.toLowerCase();
  if(mode==="upper")return s.toUpperCase();
  if(mode==="title")return s.charAt(0).toUpperCase()+s.slice(1).toLowerCase();
  return s;
}
/* Transliterate accented / LaTeX-escaped letters to plain ASCII for citation keys.
   German convention: ü→ue, ö→oe, ä→ae, ß→ss; ø→oe, å→aa, æ→ae, œ→oe;
   any other diacritic is stripped (é→e, ñ→n, ç→c). LaTeX macros (\"u, \o, \'e,
   \c{c}, …) are resolved first. Used for key generation only. */
function deLatex(s){
  return s
    .replace(/\\"\s*\{?([aouAOU])\}?/g,(m,c)=>({a:"ae",o:"oe",u:"ue",A:"Ae",O:"Oe",U:"Ue"}[c])) // umlaut macros
    // control-word macros — also swallow the single space that terminates them in TeX
    .replace(/\{?\\ss\}? ?/g,"ss")
    .replace(/\\AE\b ?/g,"Ae").replace(/\\ae\b ?/g,"ae").replace(/\\OE\b ?/g,"Oe").replace(/\\oe\b ?/g,"oe")
    .replace(/\\AA\b ?/g,"Aa").replace(/\\aa\b ?/g,"aa").replace(/\\O\b ?/g,"Oe").replace(/\\o\b ?/g,"oe")
    .replace(/\\L\b ?/g,"L").replace(/\\l\b ?/g,"l").replace(/\\i\b ?/g,"i").replace(/\\j\b ?/g,"j")
    // generic accent macros: keep the base letter, drop the accent
    .replace(/\\[`'^~="vcuHrkbd.]\s*\{?([A-Za-z])\}?/g,"$1");
}
function translitKey(s){
  if(!s) return s;
  s=deLatex(s);
  s=s.replace(/[äöüÄÖÜßøØåÅæÆœŒłŁđĐðÐþÞ]/g,c=>({"ä":"ae","ö":"oe","ü":"ue","Ä":"Ae","Ö":"Oe","Ü":"Ue",
    "ß":"ss","ø":"oe","Ø":"Oe","å":"aa","Å":"Aa","æ":"ae","Æ":"Ae","œ":"oe","Œ":"Oe",
    "ł":"l","Ł":"L","đ":"d","Đ":"D","ð":"d","Ð":"D","þ":"th","Þ":"Th"}[c]));
  s=s.normalize("NFD").replace(/[̀-ͯ]/g,"");      // strip remaining diacritics
  return s.replace(/[{}\\]/g,"");                            // drop any leftover TeX braces/slashes
}
function makeKey(e){
  const ks=CONFIG.keyStyle;
  // transliterate the source fields FIRST, so accented first letters survive word extraction
  const authors=translitKey(e.fields.author||e.fields.editor||"");
  const last=firstAuthorLast(authors);
  const lasts=authors.split(/\s+and\s+/i).map(firstAuthorLastFromName).join("");
  const year=(e.fields.year||e.fields.date||"").replace(/[^\d]/g,"").slice(0,4)||"0000";
  const word=firstMeaningfulWord(translitKey(e.fields.title||""));
  let out;
  if(ks.mode==="default"){
    const L=applyCase(last,ks.case);
    const W=applyCase(word,ks.case);
    out=[L,year,W].filter(Boolean).join(ks.separator);
  }else{
    // template mode
    out=applyCase(ks.template
      .replace(/{authorlasts}/g,lasts)
      .replace(/{authorlast}/g,last)
      .replace(/{year}/g,year)
      .replace(/{word}/g,word)
      .replace(/{type}/g,e.type), ks.case);
  }
  return out;
}
function firstAuthorLastFromName(a){
  a=a.trim().replace(/[{}]/g,""); if(!a)return"";
  if(a.includes(","))return keyNamePart(a.split(",")[0]);
  return a.split(/\s+/).pop();
}

/* ---------- 6. FORMATTER / SERIALIZER ---------------------- */
function protectWordsInTitle(title){
  let t=title;
  for(const w of CONFIG.protectedWords){
    // case-insensitive match, but always write back the canonical casing of the
    // protected word — so Title-casing can never alter it (DNA stays DNA, not Dna)
    const re=new RegExp(`(^|[^{\\w])(${escapeRe(w)})([^}\\w]|$)`,"gi");
    t=t.replace(re,(m,a,b,c)=>a+"{"+w+"}"+c);
  }
  return t;
}
function orderedFieldNames(e){
  const fo=CONFIG.formatting.fieldOrder;
  const present=Object.keys(e.fields).filter(f=>!shouldDropField(e,f));
  const inOrder=fo.filter(f=>present.includes(f));
  const rest=present.filter(f=>!fo.includes(f)).sort();
  return [...inOrder,...rest];
}
function shouldDropField(e,f){
  const name=f.toLowerCase();
  if((CONFIG.formatting.dropFields||[]).some(x=>x.toLowerCase()===name)) return true;
  return CONFIG.formatting.dropUrlWhenDoi && name==="url" && !!e.fields.doi;
}
function applyDropFields(entries){
  const drops=new Set(CONFIG.formatting.dropFields.map(f=>f.toLowerCase()));
  const dropUrlWhenDoi=!!CONFIG.formatting.dropUrlWhenDoi;
  if(!drops.size && !dropUrlWhenDoi) return 0;
  let removed=0;
  for(const e of entries){
    let removedFromEntry=0;
    for(const f of Object.keys(e.fields)){
      const name=f.toLowerCase();
      if(drops.has(name) || (dropUrlWhenDoi && name==="url" && !!e.fields.doi)){
        delete e.fields[f]; if(e.bare) delete e.bare[f]; removed++; removedFromEntry++;
      }
    }
    if(removedFromEntry){ e._dirty=true; delete e._verify; }
  }
  return removed;
}
/* Value normalizations applied on import and re-lint (Formatting toggles):
   peel redundant whole-value double braces ({{X}} → {X}). Bare values
   (macros/concats) are never touched. ALL-CAPS values are never rewritten
   here — an ALL-CAPS title gets a lint suggestion instead (see lintAll). */
function applyImportNormalizations(entries){
  const F=CONFIG.formatting;
  if(!F.stripDoubleBraces) return 0;
  let changed=0;
  for(const e of entries){
    let entryChanged=0;
    for(const f of Object.keys(e.fields)){
      if(e.bare&&e.bare[f]) continue;
      let v=e.fields[f];
      // {{Journal of Tea}} parses to "{Journal of Tea}" — peel brace layers
      // that span the WHOLE value (the serializer re-adds the outer pair).
      // Partial groups like "{Bayesian} inference" are protection, not waste,
      // and so is a braced single word ({JMLR}, {CRISPR}): even words missing
      // from the protected list are usually deliberate case protection.
      while(wholeValueBraceGroup(v) && /\s/.test(v.slice(1,-1))) v=v.slice(1,-1);
      if(v!==e.fields[f]){ e.fields[f]=v; entryChanged++; }
    }
    if(entryChanged){ e._dirty=true; changed+=entryChanged; }
  }
  return changed;
}
// true when the value is one balanced {…} group covering the entire string
function wholeValueBraceGroup(v){
  if(v.length<2 || v[0]!=="{" || v[v.length-1]!=="}") return false;
  let depth=0;
  for(let i=0;i<v.length;i++){
    if(v[i]==="{") depth++;
    else if(v[i]==="}"){ depth--; if(depth===0) return i===v.length-1; }
  }
  return false;
}
// drop configured fields, then normalize values — the standard import pipeline
function normalizeEntries(list){ applyDropFields(list); applyImportNormalizations(list); }
function serializeEntry(e,useFixedKey,overrideKey){
  const F=CONFIG.formatting;
  const type=F.lowercaseType?e.type.toLowerCase():e.type;
  const key=overrideKey || (useFixedKey&&CONFIG.keyStyle.mode!=="off"?makeKey(e):e.key);
  const names=orderedFieldNames(e);
  const ind=" ".repeat(F.indent);
  const pad=F.alignEquals?Math.max(0,...names.map(x=>x.length)):0;
  const open=F.quoteStyle==="quotes"?'"':"{";
  const close=F.quoteStyle==="quotes"?'"':"}";
  const lines=names.map((fn,idx)=>{
    let v=e.fields[fn];
    // bare values (numbers, @string/month macros, # concatenations) are kept
    // verbatim and unquoted — bracing them would change their meaning.
    const bare=!!(e.bare&&e.bare[fn]);
    if(!bare){
      if(fn==="title"){
        if(F.titlecaseTitles) v=titleCase(v);
        v=protectWordsInTitle(v);
      }
      if(fn==="doi" && CONFIG.checks.doiFormat) v=normDoi(v);
      if(fn==="pages" && CONFIG.checks.requirePageRangeDash)
        v=canonicalPages(v);
    }
    const name=F.lowercaseFieldNames?fn.toLowerCase():fn;
    const namePadded=F.alignEquals?name.padEnd(pad):name;
    const comma=(idx<names.length-1||F.trailingComma)?",":"";
    return bare
      ? `${ind}${namePadded} = ${v}${comma}`
      : `${ind}${namePadded} = ${open}${v}${close}${comma}`;
  });
  return `@${type}{${key},\n${lines.join("\n")}\n}`;
}
function titleCase(s){
  // Leave {braced} segments untouched; Title-Case the rest. Stopwords stay lowercase
  // except the very first word. (Protected words are then re-cased by protectWordsInTitle.)
  let first=true;
  return s.replace(/(\{[A-Za-z]\}[A-Za-z]+(?:['’\-][A-Za-z]+)*)|(\{[^{}]*\})|([^{}]+)/g,(m,protectedHead,braced,free)=>{
    if(protectedHead){ first=false; return protectedHead; }
    if(braced){ first=false; return braced; }
    return free.replace(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g,(w)=>{
      const lw=w.toLowerCase();
      const out=(!first && STOPWORDS.has(lw)) ? lw : titleCaseWord(w);
      first=false;
      return out;
    });
  });
}
function titleCaseWord(w){
  return w.split("-").map(part=>{
    if(isRomanNumeral(part)) return part;   // PART III stays III, not Iii
    return part.charAt(0).toUpperCase()+part.slice(1).toLowerCase();
  }).join("-");
}
function isRomanNumeral(s){
  return /^[MDCLXVI]+$/.test(s) &&
    /^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(s);
}
function sortEntries(entries){
  const o=CONFIG.ordering; if(o.sortBy==="none")return entries;
  const dir=o.direction==="desc"?-1:1;
  const keyf={
    key:e=>e.key.toLowerCase(),
    // reportYear handles braces and biblatex date-only entries ("{2020}", date={2020-01})
    year:e=>reportYear(e)||"0000",
    author:e=>firstAuthorLast(e.fields.author||e.fields.editor||"").toLowerCase(),
    type:e=>e.type
  }[o.sortBy]||(e=>e.key);
  return [...entries].sort((a,b)=>{const x=keyf(a),y=keyf(b);return x<y?-1*dir:x>y?1*dir:0;});
}
// "modified" = the user edited / autofixed / added this entry (beyond auto-formatting).
function isChanged(e){ return !!e._dirty; }
// "not found" = online verification ran but no enabled database had a match. Its own
// category next to "clean"/"modified", not an error. Hidden while an entry is resolved.
function isNotFound(e){ return !e._resolved && !!e._verify && e._verify.status==="notfound"; }
function visibleErrCount(e){ return e._resolved ? 0 : e.errCount; }
function visibleWarnCount(e){ return e._resolved ? 0 : e.warnCount; }
function exportBib(){
  // Entries sorted, fields ordered & formatted — but citation KEYS are kept as-is
  // (never auto-renamed), since changing them would break \cite in the document.
  // Use the per-entry "Rename key → …" fix to change a key on purpose.
  const sorted=sortEntries(ENTRIES);
  const body=sorted.map(e=>serializeEntry(e,false)).join("\n\n");
  return (RAW_PREAMBLE?RAW_PREAMBLE+"\n\n":"")+body+"\n";
}
function exportReport(){
  const sorted=sortEntries(ENTRIES);
  const checked=sorted.filter(e=>e._verify&&e._verify.status!=="unchecked").length;
  const problemEntries=sorted.filter(reportEntryHasProblem);
  const lines=[
    "TidyBiber offline report",
    `Generated: ${new Date().toLocaleString()}`,
    CURRENT_FILE_NAME?`Source file: ${CURRENT_FILE_NAME}`:"",
    "",
    "Summary",
    `- Entries: ${sorted.length}`,
    `- Entries with open problems: ${problemEntries.length}`,
    `- Verification checked: ${checked}`,
    `- Verification unchecked: ${sorted.length-checked}`,
    ""
  ].filter((line,i,a)=>line!=="" || a[i-1]!=="");
  if(!problemEntries.length){
    lines.push("No open lint or verification problems are currently visible in TidyBiber.");
    if(sorted.length-checked) lines.push("Some entries have not been verified online yet.");
    appendReportCache(lines,sorted);
    return lines.join("\n")+"\n";
  }
  lines.push("Entries needing attention");
  for(const e of problemEntries){
    lines.push("", reportEntryHeader(e));
    const issues=(e._resolved?[]:e.issues||[]);
    if(issues.length){
      lines.push("Open lint issues:");
      for(const issue of issues){
        lines.push(`- ${issue.sev==="err"?"Error":"Warning"}: ${plain(issue.msg)}`);
        if(issue.fix) lines.push(`  Suggested value: ${plain(issue.fix)}`);
        for(const action of issue.actions||[]) lines.push(`  Possible action: ${plain(action.label)}`);
      }
    }
    appendVerificationReport(lines,e);
    lines.push("Current formatted BibTeX:");
    lines.push(indentBlock(serializeEntry(e,false).trim(),2));
  }
  appendReportCache(lines,sorted);
  return lines.join("\n")+"\n";
}
function appendReportCache(lines,entries){
  const cached=entries
    .filter(e=>e._verify&&e._verify.status&&e._verify.status!=="unchecked")
    .map(e=>({...reportEntryIdentity(e), verify:e._verify}));
  lines.push(
    "",
    "Verification cache",
    "The block below lets TidyBiber import these online verification results later.",
    REPORT_CACHE_START,
    JSON.stringify({version:1, generatedAt:new Date().toISOString(), entries:cached},null,2),
    REPORT_CACHE_END
  );
}
function importReport(text){
  const payload=readReportCache(text);
  if(!payload) return {ok:false, reason:"No TidyBiber verification cache found in this report."};
  const cached=(payload.entries||[]).filter(x=>x&&x.verify&&x.verify.status);
  if(!cached.length) return {ok:false, reason:"This report does not contain any saved verification results."};
  const used=new Set();
  let matched=0, cleared=0;
  for(const item of cached){
    const e=findReportImportMatch(item,used);
    if(!e) continue;
    const fresh=refreshImportedVerify(e,JSON.parse(JSON.stringify(item.verify)));
    e._verify=fresh.verify;
    cleared+=fresh.cleared;
    used.add(e);
    matched++;
  }
  if(!matched) return {ok:false, reason:"No saved verification results matched the currently loaded entries."};
  if(matched){
    lintAll(ENTRIES);
    render();
  }
  return {ok:true, matched, total:cached.length, cleared};
}
function readReportCache(text){
  const start=String(text||"").indexOf(REPORT_CACHE_START);
  const end=String(text||"").indexOf(REPORT_CACHE_END);
  if(start<0 || end<0 || end<=start) return null;
  const json=String(text).slice(start+REPORT_CACHE_START.length,end).trim();
  try{return JSON.parse(json);}catch(_){return null;}
}
function findReportImportMatch(item,used){
  const unused=ENTRIES.filter(e=>!used.has(e));
  const key=String(item.key||"").toLowerCase();
  if(key){
    const byKey=unused.find(e=>e.key.toLowerCase()===key);
    if(byKey) return byKey;
  }
  const doi=String(item.doi||"");
  if(doi){
    const byDoi=unused.find(e=>e.fields.doi && normDoi(e.fields.doi)===doi);
    if(byDoi) return byDoi;
  }
  const title=String(item.titleKey||"");
  const year=String(item.year||"");
  if(title){
    return unused.find(e=>reportTitleKey(e)===title && (!year || reportYear(e)===year)) || null;
  }
  return null;
}
function reportEntryIdentity(e){
  return {
    key:e.key,
    type:e.type,
    titleKey:reportTitleKey(e),
    year:reportYear(e),
    doi:e.fields.doi?normDoi(e.fields.doi):""
  };
}
function reportTitleKey(e){
  return String(e.fields.title||"").replace(/[{}]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}
function reportYear(e){
  return String(e.fields.year||e.fields.date||"").match(/\d{4}/)?.[0]||"";
}
/* Drop only the notes/fixes a verify record no longer needs (because the entry
   now matches the database on those points), keeping the rest of the record.
   Used both when importing a cached report and — crucially — after the user
   accepts one suggested fix, so accepting a DOI/journal/author no longer wipes
   the entry's other suggestions. Returns how many findings were cleared. */
function pruneResolvedVerify(e,v,emptyNote){
  if(!v || v.status!=="found") return 0;
  let cleared=0;
  const keep=[];
  for(const note of v.notes||[]){
    if(importedVerifyNoteResolved(e,v,note)) cleared++;
    else keep.push(note);
  }
  v.notes=keep;
  if(v.urlStatus && importedUrlIssueResolved(e,v)){
    delete v.urlStatus;
    delete v.urlChecked;
    cleared++;
  }
  if(v.published && e.fields.doi && normDoi(e.fields.doi)===normDoi(v.published.doi)){
    delete v.published;
    cleared++;
  }
  v.fixes=(v.fixes||[]).filter(f=>{
    if(importedFixResolved(e,f)){ cleared++; return false; }
    return true;
  });
  if(!v.notes.length) v.notes.push(emptyNote||`Confirmed by ${v.source||"verification"}.`);
  return cleared;
}
function refreshImportedVerify(e,v){
  if(!v || v.status!=="found") return {verify:v, cleared:0};
  const cleared=pruneResolvedVerify(e,v,`Imported cached verification${v.source?` from ${v.source}`:""}; local fields still match the saved result.`);
  return {verify:v, cleared};
}
function importedVerifyNoteResolved(e,v,note){
  const n=String(note||"");
  const curDoi=e.fields.doi?normDoi(e.fields.doi):"";
  const foundDoi=normDoi(v.matchedDoi||(v.doiPreview&&v.doiPreview.doi)||"");
  let m=n.match(/^Year: file=.* vs .*=(\d{4})/);
  if(m) return reportYear(e)===m[1];
  m=n.match(/^Missing year; found .*=(\d{4})$/);
  if(m) return reportYear(e)===m[1];
  m=n.match(/^Journal\/venue: file=".*" vs .*="(.+)"$/);
  if(m) return entryVenue(e) && journalMatch(entryVenue(e),m[1]);
  m=n.match(/^Journal abbreviated: file=".*" vs full name "(.+)"$/);
  if(m) return entryVenue(e) && journalMatch(entryVenue(e),m[1]) && !journalLooksAbbreviated(entryVenue(e));
  m=n.match(/^Missing (?:journal|journaltitle|booktitle); found .*="(.+)"$/);
  if(m) return entryVenue(e) && journalMatch(entryVenue(e),m[1]);
  m=n.match(/^Missing title; found "(.+)"$/);
  if(m){ const ct=cleanField(e.fields.title); return !!ct && titleSimilarity(ct,m[1]).passes(CONFIG.verification.titleSimThreshold); }
  m=n.match(/^Missing pages; found .*=(.+)$/);
  if(m) return e.fields.pages && !pagesDiffer(canonicalPages(e.fields.pages),canonicalPages(m[1]));
  m=n.match(/^Missing publisher; found .*="(.+)"$/);
  if(m) return !!cleanField(e.fields.publisher);   // resolved once a publisher is present
  m=n.match(/^Missing (volume|number|issue|month|articleno); found .*=(.+)$/);
  if(m) return cleanField(e.fields[m[1]])===cleanField(m[2]);
  m=n.match(/^Pages: file=.* vs .*=([^\s].*)$/);
  if(m) return e.fields.pages && !pagesDiffer(canonicalPages(e.fields.pages),canonicalPages(m[1]));
  m=n.match(/^Missing DOI; found (.+)$/);
  if(m) return curDoi && curDoi===normDoi(m[1]);
  m=n.match(/^DOI differs: file=.* vs found=(.+)$/);
  if(m) return curDoi && curDoi===normDoi(m[1]);
  m=n.match(/^Published version found: ([^\s(]+)/);
  if(m) return curDoi && curDoi===normDoi(m[1]);
  m=n.match(/^DOI is a preprint DOI \(([^)]+)\)/);
  if(m) return !curDoi || curDoi!==normDoi(m[1]) || isPreprintVenue(entryVenue(e));
  m=n.match(/^URL .*: (.+)$/);
  if(m) return cleanField(e.fields.url)!==m[1].trim();
  if(/^Low title similarity/i.test(n) && v.matchedTitle)
    return titleSimilarity(cleanField(e.fields.title),v.matchedTitle).passes(CONFIG.verification.titleSimThreshold);
  if(/^DOI resolves to a different paper/i.test(n)){
    // resolved once the doi was changed/removed, or the title now matches the record
    const sameDoi=!!(curDoi && foundDoi && curDoi===foundDoi);
    const titleNowMatches=!!(v.matchedTitle && titleSimilarity(cleanField(e.fields.title),v.matchedTitle).passes(CONFIG.verification.titleSimThreshold));
    return !sameDoi || titleNowMatches;
  }
  m=n.match(/^First author: file=.* vs .*=([^\s]+)$/);
  if(m) return authorLastMatches(normAuthorLast(entryFirstAuthorLast(e)),normAuthorLast(m[1]));
  m=n.match(/^Missing author; found (.+)$/);
  if(m) return !!cleanField(e.fields.author) && !bibAuthorsDiffer(e.fields.author,m[1]);
  if(/^Author names abbreviated; .* has fuller names:/.test(n) && v.matchedAuthors!=null)
    return !!cleanField(e.fields.author) && !bibAuthorsDiffer(e.fields.author,dbAuthorsToBib({authors:v.matchedAuthors,source:v.source}));
  if(/^Author list (overlap low|first-name conflict)/.test(n) && v.matchedAuthors!=null){
    const cmp=authorListCompare(e,{authors:v.matchedAuthors});
    return !!(cmp && cmp.ok);
  }
  if(foundDoi && /^Different DOI found but not suggested/i.test(n)) return curDoi===foundDoi;
  return false;
}
function importedUrlIssueResolved(e,v){
  if(!v.urlStatus || v.urlStatus.ok) return false;
  return cleanField(e.fields.url)!==String(v.urlChecked||"").trim();
}
function importedFixResolved(e,f){
  if(!f || !f.field) return false;
  const cur=cleanField(e.fields[f.field]);
  const val=cleanField(f.value);
  if(f.field==="doi") return cur && normDoi(cur)===normDoi(val);
  if(f.field==="pages") return cur && !pagesDiffer(canonicalPages(cur),canonicalPages(val));
  if(["journal","journaltitle","booktitle"].includes(f.field))
    // Resolved when they match AND the file isn't still the abbreviation of a spelled-out
    // target — otherwise an unapplied "Expand" fix would look already-satisfied.
    return cur && journalMatch(cur,val) && !(journalLooksAbbreviated(cur) && !journalLooksAbbreviated(val));
  if(f.field==="author") return cur && !bibAuthorsDiffer(cur,val);
  return cur && cur===val;
}
/* Compare two BibTeX author strings ignoring case, braces, punctuation and
   "First Last" vs "Last, First" ordering differences that don't change who's listed. */
function bibAuthorsDiffer(a,b){
  return authorsCompareKey(a)!==authorsCompareKey(b);
}
function authorsCompareKey(s){
  return String(s||"").split(/\s+and\s+/i)
    .map(name=>{
      const p=authorPartsFromName(name);
      return p?`${p.last} ${p.first}`.trim():"";
    })
    .filter(Boolean)
    .sort()
    .join("|");
}
function entryVenue(e){return cleanField(e.fields.journal||e.fields.journaltitle||e.fields.booktitle);}
function cleanField(s){return String(s||"").replace(/[{}]/g,"").trim();}
function reportEntryHasProblem(e){
  if(!e._resolved && (e.issues||[]).length) return true;
  const v=e._verify;
  if(!v || v.status==="unchecked") return false;
  if(v.status==="error" || v.status==="notfound") return true;
  if(v.urlStatus&&!v.urlStatus.ok) return true;
  return !!(v.notes||[]).some(n=>VERIFY_PROBLEM_RE.test(n));
}
function reportEntryHeader(e){
  const title=(e.fields.title||"").replace(/[{}]/g,"").trim()||"(no title)";
  const year=(e.fields.year||e.fields.date||"").replace(/[{}]/g,"").trim();
  return `${e.key} (${e.type}${year?`, ${year}`:""}) - ${title}`;
}
function appendVerificationReport(lines,e){
  const v=e._verify;
  if(!v || v.status==="unchecked"){
    lines.push("Verification: not checked in this session.");
    return;
  }
  lines.push(`Verification: ${v.status}${v.source?` via ${v.source}`:""}`);
  if(v.matchedTitle) lines.push(`- Matched title: ${plain(v.matchedTitle)}`);
  if(v.matchedDoi) lines.push(`- Matched DOI: ${plain(normDoi(v.matchedDoi))}`);
  if(v.matchedUrl) lines.push(`- Matched URL: ${plain(v.matchedUrl)}`);
  for(const note of v.notes||[]) lines.push(`- Note: ${plain(note)}`);
  if(v.urlStatus) lines.push(`- URL check: ${v.urlStatus.ok?"reachable":plain(v.urlStatus.reason)}${v.urlChecked?` (${plain(v.urlChecked)})`:""}`);
  if(v.published) lines.push(`- Published version: ${plain(normDoi(v.published.doi))}${v.published.year?` (${plain(v.published.year)})`:""}`);
  for(const fix of v.fixes||[]) lines.push(`- Possible action: ${plain(fix.label)} [${plain(fix.field)} = ${plain(fix.value)}]`);
}
function plain(s){return String(s||"").replace(/\s+/g," ").trim();}
function indentBlock(s,n){const pad=" ".repeat(n);return String(s||"").split("\n").map(line=>pad+line).join("\n");}

/* ---------- 7. ONLINE VERIFIER (multi-database) ------------ */
/* Each source returns a normalized record, or null. All of these send
   Access-Control-Allow-Origin:* so they work from a sandboxed page.
   Normalized record: {title, year, doi, firstAuthor, authors, source, url,
   plus optional metadata such as volume, number, month, articleno}. */

function normalizeSourceOrder(order,enabled){
  const defaults=DEFAULT_CONFIG.verification.sourceOrder||Object.keys(SOURCES);
  const merged=[...(order||[]),...(enabled||[]),...defaults];
  return merged.filter((s,i,a)=>SOURCES[s] && a.indexOf(s)===i);
}

function mailtoParam(sep){
  const m=(CONFIG.verification.mailto||"").trim();
  return m?`${sep}mailto=${encodeURIComponent(m)}`:"";
}

/* --- URL availability check ---
   Cross-origin pages can't read another site's HTTP status, so we use a
   no-cors request: it RESOLVES for any reply (even 404) and only REJECTS
   on a network-level failure (dead domain, refused connection, TLS error,
   timeout). That reliably catches the common case — link rot / dead hosts —
   but cannot distinguish a live 404 page from a real one. */
async function checkUrl(url){
  if(!url) return null;
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),CONFIG.verification.urlTimeoutMs||DEFAULT_CONFIG.verification.urlTimeoutMs);
  try{
    await fetch(url,{method:"GET",mode:"no-cors",redirect:"follow",signal:ctrl.signal});
    clearTimeout(t); return {ok:true};
  }catch(err){
    clearTimeout(t);
    return {ok:false, reason: err.name==="AbortError"?"timed out":"unreachable"};
  }
}

/* --- preprint detection & published-version lookup --- */
function arxivId(e){
  const f=e.fields;
  // explicit eprint field (with arXiv archiveprefix, or anything that looks like an id)
  if(f.eprint){
    const ap=(f.archiveprefix||f.eprinttype||"").toLowerCase();
    if(ap.includes("arxiv")||!ap) {const m=f.eprint.match(/\d{4}\.\d{4,5}(v\d+)?|[a-z-]+\/\d{7}/i); if(m)return cleanArxivId(m[0]);}
  }
  // arxiv DOI: 10.48550/arXiv.2103.12345
  if(f.doi){ const m=f.doi.match(/10\.48550\/arxiv\.([^\s"',}]+)/i); if(m)return cleanArxivId(m[1]); }
  // any url/note/howpublished pointing at arxiv.org/abs/<id>
  for(const k of ["url","note","howpublished","journal","journaltitle"]){
    if(f[k]){ const m=f[k].match(/arxiv\.org\/(?:abs|pdf)\/([^\s"',}]+)/i); if(m)return cleanArxivId(m[1]); }
  }
  return null;
}
function cleanArxivId(id){
  return String(id||"").replace(/[{}]/g,"").replace(/\.pdf$/i,"").replace(/[?#].*$/,"").replace(/[),.;:]+$/,"");
}
function isPreprint(e){
  const f=e.fields;
  // include journaltitle/booktitle — entryVenue reads them, so preprint detection must too
  const preprintText=(f.archiveprefix||"")+(f.howpublished||"")+(f.note||"")+(f.journal||"")+
    (f.journaltitle||"")+(f.booktitle||"")+(f.url||"");
  return !!arxivId(e) ||
    /arxiv|preprint|biorxiv|bioarxiv|medrxiv|openrxiv|ssrn|research\s*square/i.test(preprintText) ||
    (e.fields.doi&&isPreprintDoi(e.fields.doi));
}
function isPreprintDoi(doi){
  const d=normDoi(doi);
  return /10\.48550\/arxiv|10\.1101\/|10\.64898\/|10\.21203\/rs\.|10\.2139\/ssrn/i.test(d);
}
function isPreprintVenue(s){
  // arXiv's OpenAlex/DataCite venue name is "arXiv (Cornell University)"; some records
  // give only "Cornell University" (arXiv's host) — treat that as a preprint venue too,
  // but never "Cornell University Press", which is a genuine book publisher.
  return /arxiv|preprint|biorxiv|bioarxiv|medrxiv|openrxiv|ssrn|research\s*square|cornell\s+univ(?:ersity)?(?!\s+press)/i.test(String(s||""));
}
function preprintDoiBlockedByVenue(e,doi){
  const venue=entryVenue(e);
  return !!(isPreprintDoi(doi) && venue && !isPreprintVenue(venue));
}
// A looked-up record that is itself a preprint (arXiv/bioRxiv/SSRN/…), judged by its
// DOI, venue, or work type. Such a record must not overwrite an entry that already has
// a real published venue — "arXiv (Cornell University)" is a preprint host, not a journal.
function isPreprintRecord(r){
  if(!r) return false;
  return (r.doi && isPreprintDoi(r.doi)) || isPreprintVenue(r.journal) || /preprint|posted-content/i.test(r.type||"");
}
/* return several candidates so we can pick a *published* (non-preprint) one */
async function crossrefCandidates(title){
  return SOURCES.crossref.candidatesByTitle(title);
}
async function openalexCandidates(title){
  return SOURCES.openalex.candidatesByTitle(title);
}
function isPublishedCandidate(c){
  if(!c.doi) return false;
  if(isPreprintDoi(c.doi)) return false;                    // that's the preprint DOI
  if(/preprint|posted-content/i.test(c.type)) return false; // explicitly a preprint
  return true;
}
function publishedAuthorMatch(e,c){
  const fileAuthors=authorPartsFromBib(e.fields.author||e.fields.editor||"");
  if(!fileAuthors.length) return true;

  const entryFirst=normAuthorLast(entryFirstAuthorLast(e));
  const candidateFirst=normAuthorLast(c.firstAuthor);
  if(entryFirst && candidateFirst && !authorLastMatches(entryFirst,candidateFirst)){
    return false;
  }

  const authorList=authorListCompare(e,c);
  if(authorList) return authorList.ok;

  // If the source only gives a first author, accept that as the minimum
  // identity evidence; otherwise title-only preprint upgrades are too risky.
  return !!(entryFirst && candidateFirst);
}
function publishedTitleMatch(original,candidate){
  const sim=titleSimilarity(original,candidate||"");
  if(!sim.passes(Math.max(0.75,CONFIG.verification.titleSimThreshold))) return false;
  const A=titleTokens(original), B=titleTokens(candidate);
  const shared=A.filter(w=>B.includes(w)).length;
  const short=Math.min(A.length,B.length);
  const long=Math.max(A.length,B.length);
  // Published titles often gain/drop a subtitle, but they should not merely
  // share a generic phrase like "sequential ... likelihood-free inference".
  return short<4 ? sim.score>=0.9 : shared/short>=0.8 && shared/long>=0.85;
}
/* bioRxiv/medRxiv record the published journal DOI for a preprint, so a 10.1101
   entry resolves DOI-first with no fuzzy title search. Resolve that DOI to a full
   record (Crossref, then OpenAlex); if neither can flesh it out yet, still return
   the bare DOI — the openRxiv mapping is authoritative enough to suggest it. */
async function bioRxivPublishedRecord(e,title){
  const doi=e.fields.doi?normDoi(e.fields.doi):"";
  if(!doi) return null;
  let pubDoi="";
  try{ pubDoi=await OPENRXIV.publishedDoi(doi); }catch(err){ return null; }
  if(!pubDoi) return null;
  pubDoi=normDoi(pubDoi);
  if(pubDoi===doi || isPreprintDoi(pubDoi)) return null;   // must be a real published DOI
  let rec=null;
  for(const name of ["crossref","openalex"]){
    const s=SOURCES[name];
    if(!s||!s.byDoi) continue;
    try{ rec=await s.byDoi(pubDoi); }catch(err){}
    if(rec) break;
  }
  if(!rec) return {doi:pubDoi, title:"", year:"", firstAuthor:"", authors:"", journal:"", pages:"",
    source:"bioRxiv/medRxiv", url:`https://doi.org/${pubDoi}`, _via:"bioRxiv/medRxiv"};
  // Sanity-gate the resolved record the same way the title path does, so an
  // unexpected DOI mapping can't push an unrelated paper onto the entry.
  if(!isPublishedCandidate(rec)) return null;
  if(title && rec.title && !publishedTitleMatch(title,rec.title)) return null;
  if(!publishedAuthorMatch(e,rec)) return null;
  return {...rec, _via:"bioRxiv/medRxiv"};
}
async function findPublishedVersion(e,title){
  // High-confidence, DOI-anchored path first (works even without a title).
  try{ const direct=await bioRxivPublishedRecord(e,title); if(direct) return direct; }catch(err){}
  if(!title) return null;
  let cands=[];
  try{ cands=cands.concat(await crossrefCandidates(title)); }catch(err){}
  try{ cands=cands.concat(await openalexCandidates(title)); }catch(err){}
  const hits=cands.filter(isPublishedCandidate)
    .map(c=>({...c, sim:titleSimilarity(title,c.title||"").score}))
    .filter(c=>publishedTitleMatch(title,c.title||""))
    .filter(c=>publishedAuthorMatch(e,c))
    .sort((a,b)=>b.sim-a.sim);
  return hits[0]||null;
}

/* Query one source: prefer DOI lookup, fall back to title search. */
async function querySource(name,doi,title){
  const s=SOURCES[name]; if(!s) return null;
  if(doi && s.byDoi){ const r=await s.byDoi(doi); if(r) return {...r,_lookup:"doi"}; }
  if(title && s.byTitle){ const r=await s.byTitle(title); if(r) return {...r,_lookup:"title"}; }
  return null;
}

function lowTitleSimilarity(r,title){
  if(!title || !r.title) return false;
  return !titleSimilarity(title,r.title).passes(CONFIG.verification.titleSimThreshold);
}
function normAuthorLast(s){ return keyNamePart(translitKey(String(s||""))).toLowerCase(); }
function normAuthorFirst(s){ return keyNamePart(translitKey(String(s||""))).toLowerCase(); }
function authorLastMatches(a,b){
  return !!(a && b && (a===b || a.endsWith("-"+b) || b.endsWith("-"+a)));
}
function authorFirstMatches(a,b){
  if(!a.first || !b.first) return true;
  // Initial sequences must agree first — "J. D." vs "J. P." is a conflict even
  // though the leading token ("J") matches on both sides.
  if(a.initials && b.initials){
    const [short,long]=a.initials.length<=b.initials.length?[a.initials,b.initials]:[b.initials,a.initials];
    const initialsOk=short.length===1 ? short[0]===long[0] : long.startsWith(short);
    if(!initialsOk) return false;
  }
  if(a.first===b.first) return true;
  // Both names spelled out: same person only when one is a prefix of the other
  // (Jon/Jonathan). First-letter matching is far too lax here — "Jonathan" vs
  // "James" must count as a conflict.
  if(!a.firstInitial && !b.firstInitial)
    return a.first.startsWith(b.first) || b.first.startsWith(a.first);
  return true; // initials agree and at least one side is written as initials
}
// Whitespace/period/hyphen-separated name tokens, stripped to letters:
// "J. D." → ["J","D"], "Jon D" → ["Jon","D"], "Jean-Paul" → ["Jean","Paul"].
function firstNameTokens(raw){
  return String(raw||"").replace(/[{}]/g," ")
    .split(/[\s.\-]+/)
    .map(t=>t.replace(/[^A-Za-z]/g,""))
    .filter(Boolean);
}
// The initials of a first name: one leading letter per token.
// "J. D." → jd, "Jon D" → jd, "Jon David" → jd. A lone separator-free uppercase run
// like "JD"/"JAD" is itself a string of initials, so expand it letter-by-letter.
function authorInitials(raw){
  const tokens=firstNameTokens(raw);
  if(!tokens.length) return "";
  if(tokens.length===1 && /^[A-Z]{2,4}$/.test(tokens[0])) return tokens[0].toLowerCase();
  return tokens.map(t=>t[0].toLowerCase()).join("");
}
// True when a first name is written purely as initials ("J", "J.", "JD", "J. D."),
// not spelled out. "Jon D" is NOT initials-only — "Jon" is a real name — so a
// multi-token string qualifies only when every token is a single letter.
function isInitialsOnly(raw){
  const tokens=firstNameTokens(raw);
  if(!tokens.length) return false;
  if(tokens.length===1) return /^[A-Z]{1,4}$/.test(tokens[0]);
  return tokens.every(t=>t.length===1);
}
function authorPartsFromName(raw){
  const s=String(raw||"").trim().replace(/[{}]/g,"");
  if(!s) return null;
  let last="", first="", firstRaw="";
  if(s.includes(",")){
    const parts=s.split(",");
    last=parts[0]; firstRaw=parts.slice(1).join(" ").trim(); first=firstRaw.split(/\s+/)[0]||"";
  }else{
    const parts=s.split(/\s+/).filter(Boolean);
    const tail=parts[parts.length-1]||"";
    if(parts.length>=2 && /^[A-Z](?:\.?[A-Z]){0,3}\.?$/i.test(tail) && (/[.]/.test(tail) || /^[A-Z]{1,4}$/.test(tail))){
      last=parts[0]; firstRaw=tail; first=tail;
    }else{
      last=tail; firstRaw=parts.slice(0,-1).join(" "); first=parts[0]||"";
    }
  }
  const initials=authorInitials(firstRaw);
  const firstInitial=isInitialsOnly(firstRaw);
  last=normAuthorLast(last); first=normAuthorFirst(first);
  return last?{last,first,firstInitial,initials,display:s}:null;
}
function authorPartsFromBib(raw){
  return String(raw||"").split(/\s+and\s+/i).map(authorPartsFromName).filter(Boolean);
}
function authorPartsFromList(raw){
  return String(raw||"").split(/\s*;\s*/).map(authorPartsFromName).filter(Boolean);
}
function authorListCompare(e,r){
  const file=authorPartsFromBib(e.fields.author||e.fields.editor||"");
  const db=authorPartsFromList(r.authors||"");
  if(!file.length || !db.length) return null;
  const matched=file.filter(a=>db.some(b=>authorLastMatches(a.last,b.last) && authorFirstMatches(a,b))).length;
  const conflicts=file.map(a=>{
    const sameLast=db.filter(b=>authorLastMatches(a.last,b.last));
    if(!sameLast.length || sameLast.some(b=>authorFirstMatches(a,b))) return null;
    return {file:a.display, db:sameLast.map(b=>b.display).join(" / ")};
  }).filter(Boolean);
  const firstNameConflicts=conflicts.length;
  const unmatchedFile=file.filter(a=>!db.some(b=>authorLastMatches(a.last,b.last) && authorFirstMatches(a,b))).map(a=>a.display);
  const unmatchedDb=db.filter(b=>!file.some(a=>authorLastMatches(a.last,b.last) && authorFirstMatches(a,b))).map(b=>b.display);
  const denom=Math.min(file.length,db.length);
  const ratio=denom?matched/denom:0;
  return {
    file:file.map(a=>a.last), db:db.map(a=>a.last), matched,
    firstNameConflicts, conflicts, unmatchedFile, unmatchedDb, ratio,
    ok:matched>0 && firstNameConflicts===0 && (ratio>=0.5 || matched>=2)
  };
}
function authorExpansionCandidates(e,r){
  const file=authorPartsFromBib(e.fields.author||e.fields.editor||"");
  const db=authorPartsFromList(r.authors||"");
  if(!file.length || !db.length) return [];
  return file.map(a=>{
    const b=db.find(x=>authorLastMatches(a.last,x.last) && authorFirstMatches(a,x));
    if(!b) return null;
    const dbLooksFull=!b.firstInitial && b.first && b.first.length>1;
    if(!dbLooksFull || a.first===b.first) return null;
    // The file abbreviates the name if it's written as initials ("J.", "J-P")
    // or as a proper prefix of the database's fuller form (Jon → Jonathan).
    // A short-but-different real name (Mary vs Maria) is NOT an abbreviation.
    const fileAbbreviated=!!a.firstInitial || (b.first.startsWith(a.first) && b.first.length>a.first.length);
    return fileAbbreviated ? {file:a.display, db:b.display} : null;
  }).filter(Boolean);
}
function authorExpansionNote(expansions,source){
  const shown=expansions.slice(0,3)
    .map(x=>`file="${x.file}" vs ${source}="${x.db}"`).join("; ");
  const more=expansions.length>3?`; +${expansions.length-3} more`:"";
  return `Author names abbreviated; ${source} has fuller names: ${shown}${more}`;
}
function authorListIssueNote(authorList,source){
  if(authorList.firstNameConflicts){
    const shown=authorList.conflicts.slice(0,3)
      .map(c=>`file="${c.file}" vs ${source}="${c.db}"`).join("; ");
    const more=authorList.conflicts.length>3?`; +${authorList.conflicts.length-3} more`:"";
    return `Author list first-name conflict vs ${source}: ${shown}${more}`;
  }
  const denom=Math.min(authorList.file.length,authorList.db.length);
  const missing=authorList.unmatchedFile.slice(0,3).map(n=>`"${n}"`).join(", ");
  const extra=authorList.unmatchedDb.slice(0,3).map(n=>`"${n}"`).join(", ");
  const detail=[
    missing?`unmatched in file: ${missing}`:"",
    extra?`unmatched in ${source}: ${extra}`:""
  ].filter(Boolean).join("; ");
  return `Author list overlap low vs ${source}: matched ${authorList.matched}/${denom} authors${detail?`; ${detail}`:""}`;
}
function entryFirstAuthorLast(e){
  const raw=e.fields.author||e.fields.editor||"";
  return raw ? firstAuthorLast(raw) : "";
}
function titleAuthorMismatch(e,r){
  if(r._lookup!=="title") return false;
  const efAuthor=normAuthorLast(entryFirstAuthorLast(e));
  const dbAuthor=normAuthorLast(r.firstAuthor);
  return !!(efAuthor && dbAuthor && !authorLastMatches(efAuthor,dbAuthor));
}
function doiSuggestionConfidence(e,r,title){
  if(!r || !r.doi) return {ok:false, reason:""};
  if(preprintDoiBlockedByVenue(e,r.doi))
    return {ok:false, reason:`proposed DOI is a preprint DOI but venue is "${entryVenue(e)}"`};
  if(r._lookup==="doi") return {ok:true, reason:""};
  const sim=title&&r.title?titleSimilarity(title,r.title):{score:0, passes:()=>false};
  if(!sim.passes(0.75)) return {ok:false, reason:`title-only match is weak (${(sim.score*100|0)}%)`};

  const authorList=authorListCompare(e,r);
  const authorListOk=!!(authorList&&authorList.ok);
  const efJournal=(e.fields.journal||e.fields.journaltitle||e.fields.booktitle||"").replace(/[{}]/g,"").trim();
  const journalOk=!!(efJournal && r.journal && journalMatch(efJournal,r.journal));

  if(authorListOk || journalOk) return {ok:true, reason:""};
  return {ok:false, reason:"title-only match lacks author-list or journal confirmation"};
}

/* Turn a matched record's "First Last; First Last; …" author list into a BibTeX
   "Last, First and Last, First" string. Name order is source-dependent: PubMed
   lists "Surname Initials"; every other source lists the given name first. */
function dbAuthorToBib(name,surnameFirst){
  let s=String(name||"").replace(/\s+/g," ").trim();
  if(!s) return "";
  s=s.replace(/\s+\d{1,4}$/,"");        // strip DBLP disambiguation suffix ("Wei Wang 0001")
  if(s.includes(",")) return s;         // already "Last, First"
  const parts=s.split(" ").filter(Boolean);
  if(parts.length<2) return s;          // single token — leave as-is
  if(surnameFirst){                     // PubMed: "Smith JD" → "Smith, J. D."
    // Only the LAST token is the initials block; everything before it is the
    // surname ("van der Berg JD" → "van der Berg, J. D."). If the last token
    // doesn't look like initials (suffixes, collective names), leave as-is.
    const tail=parts[parts.length-1];
    if(!/^[A-Z][A-Z-]{0,3}$/.test(tail)) return s;
    const last=parts.slice(0,-1).join(" ");
    const given=tail.replace(/[^A-Za-z]/g,"").split("").map(c=>c+".").join(" ");
    return given?`${last}, ${given}`:last;
  }
  const last=parts[parts.length-1];     // "John A. Smith" → "Smith, John A."
  return `${last}, ${parts.slice(0,-1).join(" ")}`;
}
function dbAuthorsToBib(r){
  const list=String(r.authors||"").split(/\s*;\s*/).map(x=>x.trim()).filter(Boolean);
  if(!list.length) return "";
  const surnameFirst=/pubmed/i.test(r.source||"");
  return list.map(n=>dbAuthorToBib(n,surnameFirst)).join(" and ");
}
function authorFixLabel(verb,authors){
  const list=authors.split(/\s+and\s+/i);
  const preview=list.length>2?`${list[0]} et al. (${list.length} authors)`:authors;
  return `${verb} → ${preview}`;
}
function optionalLookupFields(e,r){
  const specs=[
    {field:"volume", value:r.volume},
    {field:(e.fields.issue!=null && e.fields.number==null)?"issue":"number", value:r.number||r.issue, present:["number","issue"]},
    {field:"month", value:r.month},
    {field:"articleno", value:r.articleno}
  ];
  return specs.map(spec=>({
    field:spec.field,
    value:cleanField(spec.value),
    present:spec.present||[spec.field]
  })).filter(spec=>spec.value && !spec.present.some(f=>cleanField(e.fields[f])));
}
function addVerifyFix(out,field,value,label){
  if(value && !out.fixes.some(f=>f.field===field)) out.fixes.push({field,value:String(value),label});
}
function safeRecordForFixes(e,r,title){
  if(!r) return false;
  if(title && r.title && !titleSimilarity(title,r.title).passes(Math.max(0.75,CONFIG.verification.titleSimThreshold))) return false;
  const efAuthor=normAuthorLast(entryFirstAuthorLast(e));
  if(r.firstAuthor && efAuthor && !authorLastMatches(efAuthor,normAuthorLast(r.firstAuthor))) return false;
  const authorList=authorListCompare(e,r);
  if(authorList && !authorList.ok) return false;
  return true;
}
function addPublishedRecordFixes(e,out,r){
  if(!safeRecordForFixes(e,r,cleanField(e.fields.title))) return;
  const jfield=venueFieldFor(e);
  const efYear=(e.fields.year||"").replace(/\D/g,"");
  const efJournal=entryVenue(e);
  const efPages=cleanField(e.fields.pages);
  const efPublisher=cleanField(e.fields.publisher);
  const source="Published version";
  const PUB_TYPES=["article","inproceedings","conference","incollection","inbook"];
  const venueExpected=e.fields.journal!=null||e.fields.journaltitle!=null||e.fields.booktitle!=null||PUB_TYPES.includes(e.type);
  const pagesExpected=e.fields.pages!=null||PUB_TYPES.includes(e.type);
  const publisherExpected=e.fields.publisher!=null||["book","incollection","inbook"].includes(e.type);

  if(r.year && efYear && r.year!==efYear){
    out.notes.push(`Year: file=${efYear} vs ${source}=${r.year} — journal-edition and online-first years can differ; use the edition year`);
    addVerifyFix(out,"year",r.year,`Set year → ${r.year}`);
  }else if(r.year && !efYear && !e.fields.year && !e.fields.date){
    out.notes.push(`Missing year; found ${source}=${r.year}`);
    addVerifyFix(out,"year",r.year,`Add year ${r.year}`);
  }
  if(r.journal && venueExpected){
    const dbJournal=cleanField(r.journal);
    if(!efJournal){
      out.notes.push(`Missing ${jfield}; found ${source}="${dbJournal}"`);
      addVerifyFix(out,jfield,dbJournal,`Add ${jfield} → ${dbJournal}`);
    }else if(!journalMatch(efJournal,dbJournal) || isPreprintVenue(efJournal)){
      out.notes.push(`Journal/venue: file="${efJournal}" vs ${source}="${dbJournal}"`);
      addVerifyFix(out,jfield,dbJournal,`Set ${jfield} → ${dbJournal}`);
    }else if(journalLooksAbbreviated(efJournal) && !journalLooksAbbreviated(dbJournal)
             && dbJournal.length>efJournal.length && dbJournal.toLowerCase()!==efJournal.toLowerCase()){
      out.notes.push(`Journal abbreviated: file="${efJournal}" vs full name "${dbJournal}"`);
      addVerifyFix(out,jfield,dbJournal,`Expand ${jfield} → ${dbJournal}`);
    }
  }
  if(r.pages && pagesExpected){
    const dbPages=canonicalPages(r.pages);
    if(!efPages){
      out.notes.push(`Missing pages; found ${source}=${dbPages}`);
      addVerifyFix(out,"pages",dbPages,`Add pages ${dbPages}`);
    }else if(pagesDiffer(efPages,dbPages)){
      out.notes.push(`Pages: file=${canonicalPages(efPages)} vs ${source}=${dbPages}`);
      addVerifyFix(out,"pages",dbPages,`Set pages → ${dbPages}`);
    }
  }
  if(r.publisher && !efPublisher && publisherExpected){
    const dbPublisher=cleanField(r.publisher);
    out.notes.push(`Missing publisher; found ${source}="${dbPublisher}"`);
    addVerifyFix(out,"publisher",dbPublisher,`Add publisher → ${dbPublisher}`);
  }
  for(const opt of optionalLookupFields(e,r)){
    out.notes.push(`Missing ${opt.field}; found ${source}=${opt.value}`);
    addVerifyFix(out,opt.field,opt.value,`Add ${opt.field} ${opt.value}`);
  }
}

async function verifyEntry(e){
  const out={status:"unchecked",notes:[],fixes:[]};
  const V=CONFIG.verification;
  const order=normalizeSourceOrder(V.sourceOrder,V.sources);
  const enabled=order.filter(s=>(V.sources||[]).includes(s));
  if(!enabled.length){ out.status="error"; out.notes.push("No verification sources enabled (see Config)."); return out; }
  const doi=e.fields.doi?normDoi(e.fields.doi):null;
  const title=e.fields.title?e.fields.title.replace(/[{}]/g,"").trim():"";

  const recs=[];
  const lowTitleRejects=[];
  const authorRejects=[];
  const sourceErrors=[];
  for(const name of enabled){
    let rec=null;
    try{
      rec=await querySource(name,doi,title);
    }catch(err){
      const label=SOURCES[name].label;
      sourceErrors.push(`${label}: ${err.message||"load failed"}`);
      continue;
    }
    if(!rec) continue;
    if(lowTitleSimilarity(rec,title)){
      // A DOI lookup that returns a different-looking paper is a finding, not a
      // miss: the entry's DOI probably points to the wrong work. Accept the
      // record so the mismatch is flagged (fixes stay blocked by the same
      // similarity check inside safeRecordForFixes).
      if(rec._lookup==="doi"){ recs.push(rec); break; }
      const sim=titleSimilarity(title,rec.title);
      lowTitleRejects.push(`${rec.source} (${(sim.score*100|0)}%${sim.reason?`, ${sim.reason}`:""})`);
      continue;
    }
    if(titleAuthorMismatch(e,rec)){
      const efAuthor=normAuthorLast(entryFirstAuthorLast(e));
      authorRejects.push(`${rec.source} (file=${efAuthor}, ${rec.source}=${normAuthorLast(rec.firstAuthor)})`);
      continue;
    }
    recs.push(rec);
    // Stop at the first acceptable source; database order controls priority.
    break;
  }

  if(!recs.length){
    out.status=sourceErrors.length===enabled.length ? "error" : "notfound";
    if(sourceErrors.length) out.notes.push(`Source unavailable: ${sourceErrors.join("; ")}.`);
    if(lowTitleRejects.length) out.notes.push(`Rejected low-title-similarity match${lowTitleRejects.length>1?"es":""}: ${lowTitleRejects.join(", ")}.`);
    if(authorRejects.length) out.notes.push(`Rejected title match${authorRejects.length>1?"es":""} with different first author: ${authorRejects.join(", ")}.`);
    out.notes.push(`No match in ${enabled.map(n=>SOURCES[n].label).join(", ")}.`);
    await augmentVerify(e,out,title);
    return out;
  }

  out.status="found";
  const primary=recs[0];
  out.source=recs.map(r=>r.source).join(" + ");
  out.matchedTitle=primary.title; out.matchedDoi=primary.doi; out.matchedUrl=primary.url;
  out.matchedAuthors=primary.authors||"";
  // Retraction is a fatal finding, not a field diff — surface it first. Only the
  // matched source(s) that carry the signal are checked (Crossref update-to /
  // OpenAlex is_retracted), so coverage tracks whichever confident source answered.
  const retractedBy=recs.filter(r=>r.retracted).map(r=>r.source);
  if(retractedBy.length){
    out.retracted=true;
    out.notes.push(`RETRACTED — ${retractedBy.join(", ")} lists this work as retracted; do not cite it as a valid reference`);
  }
  if(primary.doi) out.doiPreview=doiPreviewRecord(primary);
  const primarySafeFixes=safeRecordForFixes({fields:{...e.fields, title}},primary,title);

  const efYear=(e.fields.year||"").replace(/\D/g,"");
  const efAuthor=normAuthorLast(entryFirstAuthorLast(e));
  const efTitle=cleanField(e.fields.title);
  const jfield=venueFieldFor(e);
  const efJournal=(e.fields.journal||e.fields.journaltitle||e.fields.booktitle||"").replace(/[{}]/g,"").trim();
  const efPages=(e.fields.pages||"").replace(/[{}]/g,"").trim();
  const efPublisher=cleanField(e.fields.publisher);
  // Only propose adding a venue/pages to works that take them — avoids offering
  // "Add journal → <publisher>" on a @book from a source that reuses that field.
  const PUB_TYPES=["article","inproceedings","conference","incollection","inbook"];
  const venueExpected=e.fields.journal!=null||e.fields.journaltitle!=null||e.fields.booktitle!=null||PUB_TYPES.includes(e.type);
  const pagesExpected=e.fields.pages!=null||PUB_TYPES.includes(e.type);
  // Publisher is only required for these types; don't push it onto articles.
  const publisherExpected=e.fields.publisher!=null||["book","incollection","inbook"].includes(e.type);
  // record a one-click fix (first source to suggest a given field wins)
  const addFix=(field,value,label)=>addVerifyFix(out,field,value,label);
  // The entry already cites a real (non-preprint) venue — i.e. the paper is published.
  const entryHasPublishedVenue=!!(efJournal && !isPreprintVenue(efJournal));

  // Aggregate cross-source signals.
  for(const r of recs){
    // Don't let a preprint record (arXiv/bioRxiv/…) rewrite an already-published entry.
    const sourceIsPreprintRecord=!!(isPreprintRecord(r) && entryHasPublishedVenue);
    const safeFixes=safeRecordForFixes(e,r,title) && !sourceIsPreprintRecord;
    if(r.year && efYear && r.year!==efYear){
      out.notes.push(`Year: file=${efYear} vs ${r.source}=${r.year} — journal-edition and online-first years can differ; use the edition year`);
      if(safeFixes) addFix("year",r.year,`Set year → ${r.year}`);
    }else if(r.year && !efYear && !e.fields.year && !e.fields.date){
      // No year anywhere (and no date to derive one from locally) — propose the lookup's.
      out.notes.push(`Missing year; found ${r.source}=${r.year}`);
      if(safeFixes) addFix("year",r.year,`Add year ${r.year}`);
    }
    if(r.firstAuthor && efAuthor && !authorLastMatches(efAuthor,normAuthorLast(r.firstAuthor)))
      out.notes.push(`First author: file=${efAuthor} vs ${r.source}=${normAuthorLast(r.firstAuthor)}`);
    const authorList=authorListCompare(e,r);
    if(authorList && !authorList.ok){
      out.notes.push(authorListIssueNote(authorList,r.source));
      const dbAuthors=dbAuthorsToBib(r);
      const fileAuthors=cleanField(e.fields.author);
      if(safeFixes && !e.fields.editor && dbAuthors && (!fileAuthors || bibAuthorsDiffer(fileAuthors,dbAuthors)))
        addFix("author",dbAuthors,authorFixLabel(fileAuthors?"Set authors":"Add authors",dbAuthors));
    }
    if(r.title && title){
      const sim=titleSimilarity(title,r.title);
      if(!sim.passes(V.titleSimThreshold)){
        out.notes.push(r._lookup==="doi"
          ? `DOI resolves to a different paper: ${r.source} returns "${r.title}" (${(sim.score*100|0)}% title similarity) — check the doi field`
          : `Low title similarity vs ${r.source} (${(sim.score*100|0)}%${sim.reason?`, ${sim.reason}`:""}) — possible mismatch/fabrication`);
      }
    }
    if(r.journal && !sourceIsPreprintRecord){
      const dbJournal=cleanField(r.journal);
      if(!efJournal){
        if(venueExpected){
          out.notes.push(`Missing ${jfield}; found ${r.source}="${dbJournal}"`);
          if(safeFixes) addFix(jfield,dbJournal,`Add ${jfield} → ${dbJournal}`);
        }
      }else if(!journalMatch(efJournal,dbJournal)){
        out.notes.push(`Journal/venue: file="${efJournal}" vs ${r.source}="${dbJournal}"`);
        if(safeFixes) addFix(jfield,dbJournal,`Set ${jfield} → ${dbJournal}`);
      }else if(journalLooksAbbreviated(efJournal) && !journalLooksAbbreviated(dbJournal)
               && dbJournal.length>efJournal.length && dbJournal.toLowerCase()!==efJournal.toLowerCase()){
        // Same journal, but the file uses an abbreviation and the lookup spells it out.
        out.notes.push(`Journal abbreviated: file="${efJournal}" vs full name "${dbJournal}"`);
        if(safeFixes) addFix(jfield,dbJournal,`Expand ${jfield} → ${dbJournal}`);
      }
    }
    if(r.pages){
      const dbPages=canonicalPages(r.pages);
      if(!efPages){
        if(pagesExpected){
          out.notes.push(`Missing pages; found ${r.source}=${dbPages}`);
          if(safeFixes) addFix("pages",dbPages,`Add pages ${dbPages}`);
        }
      }else if(pagesDiffer(efPages,dbPages)){
        out.notes.push(`Pages: file=${canonicalPages(efPages)} vs ${r.source}=${dbPages}`);
        if(safeFixes) addFix("pages",dbPages,`Set pages → ${dbPages}`);
      }
    }
    if(r.publisher && !efPublisher && publisherExpected){
      const dbPublisher=cleanField(r.publisher);
      out.notes.push(`Missing publisher; found ${r.source}="${dbPublisher}"`);
      if(safeFixes) addFix("publisher",dbPublisher,`Add publisher → ${dbPublisher}`);
    }
    if(safeFixes){
      for(const opt of optionalLookupFields(e,r)){
        out.notes.push(`Missing ${opt.field}; found ${r.source}=${opt.value}`);
        addFix(opt.field,opt.value,`Add ${opt.field} ${opt.value}`);
      }
    }
  }
  // Missing title — fillable only when a DOI lookup returned one (a title-less
  // entry can't be found by title search in the first place).
  if(primary.title && !efTitle){
    const t=cleanField(primary.title);
    out.notes.push(`Missing title; found "${t}"`);
    if(primarySafeFixes) addFix("title",t,`Add title → ${t.length>60?t.slice(0,57)+"…":t}`);
  }
  // Author-list fix — offer the database's canonical author list when the file's
  // authors disagree with it. Skip editor-only entries (books/proceedings) so we
  // never overwrite an editor list with a work's authors.
  if(!e.fields.editor){
    const dbAuthors=dbAuthorsToBib(primary);
    const fileAuthors=cleanField(e.fields.author);
    if(dbAuthors){
      if(!fileAuthors){
        out.notes.push(`Missing author; found ${dbAuthors}`);
        if(primarySafeFixes) addFix("author",dbAuthors,authorFixLabel("Add authors",dbAuthors));
      }else{
        const authorList=authorListCompare(e,primary);
        const firstMismatch=primary.firstAuthor && efAuthor && !authorLastMatches(efAuthor,normAuthorLast(primary.firstAuthor));
        const listMismatch=!!(authorList && !authorList.ok);
        const expansions=authorList && authorList.ok ? authorExpansionCandidates(e,primary) : [];
        if(primarySafeFixes && (firstMismatch||listMismatch) && bibAuthorsDiffer(fileAuthors,dbAuthors))
          addFix("author",dbAuthors,authorFixLabel("Set authors",dbAuthors));
        else if(primarySafeFixes && expansions.length && bibAuthorsDiffer(fileAuthors,dbAuthors)){
          out.notes.push(authorExpansionNote(expansions,primary.source));
          addFix("author",dbAuthors,authorFixLabel("Expand authors",dbAuthors));
        }
      }
    }
  }
  // DOI suggestion if we have one and the entry doesn't.
  const doiRec=recs.find(r=>r.doi);
  const suggestDoi=doiRec&&doiRec.doi;
  const doiConfidence=doiSuggestionConfidence(e,doiRec,title);
  if(doiRec) out.doiPreview=doiPreviewRecord(doiRec);
  if(suggestDoi && !doi){
    if(primarySafeFixes && doiConfidence.ok){ out.notes.push(`Missing DOI; found ${suggestDoi}`); addFix("doi",normDoi(suggestDoi),`Add DOI ${normDoi(suggestDoi)}`); }
    else out.notes.push(`Possible DOI found but not suggested: ${suggestDoi} (${doiConfidence.reason}).`);
  }
  if(doi && suggestDoi && normDoi(suggestDoi)!==doi){
    if(primarySafeFixes && doiConfidence.ok){ out.notes.push(`DOI differs: file=${doi} vs found=${normDoi(suggestDoi)}`); addFix("doi",normDoi(suggestDoi),`Set DOI → ${normDoi(suggestDoi)}`); }
    else out.notes.push(`Different DOI found but not suggested: ${normDoi(suggestDoi)} (${doiConfidence.reason}).`);
  }

  await augmentVerify(e,out,title);
  if(out.notes.length===0) out.notes.push(`Confirmed by ${out.source}.`);
  return out;
}
function doiPreviewRecord(r){
  if(!r||!r.doi) return null;
  return {
    doi:normDoi(r.doi),
    url:r.url||`https://doi.org/${normDoi(r.doi)}`,
    title:r.title||"",
    year:r.year||"",
    firstAuthor:r.firstAuthor||"",
    authors:r.authors||"",
    journal:r.journal||"",
    pages:r.pages||"",
    volume:r.volume||"",
    number:r.number||r.issue||"",
    month:r.month||"",
    articleno:r.articleno||"",
    publisher:r.publisher||"",
    source:r.source||"",
    lookup:r._lookup||"",
    note:r.note||""
  };
}

/* URL liveness + published-version lookup, shared by found & not-found paths */
async function augmentVerify(e,out,title){
  const V=CONFIG.verification;
  // dead-link check on the url field
  if(V.checkUrls && e.fields.url){
    const u=e.fields.url.replace(/[{}]/g,"").trim();
    try{
      const r=await checkUrl(u);
      if(r){ out.urlStatus=r; out.urlChecked=u;
        if(!r.ok) out.notes.push(`URL ${r.reason}: ${u}`); }
    }catch(err){}
  }
  const curDoi=e.fields.doi?normDoi(e.fields.doi):"";
  const venue=entryVenue(e);
  if(curDoi && isPreprintDoi(curDoi) && venue && !isPreprintVenue(venue)){
    out.notes.push(`DOI is a preprint DOI (${curDoi}) but venue is "${venue}" — use the journal/conference DOI if available`);
  }
  // published version of an arXiv/preprint entry
  if(V.findPublished && isPreprint(e)){
    out.isPreprint=true;
    try{
      const pub=await findPublishedVersion(e,title);
      if(pub){ out.published=pub;
        out.notes.push(`Published version found${pub._via?` via ${pub._via}`:""}: ${pub.doi}${pub.year?` (${pub.year})`:""}`);
        const cur=e.fields.doi?normDoi(e.fields.doi):null;
        if(pub.doi && normDoi(pub.doi)!==cur){
          // the published DOI supersedes any DOI fix suggested earlier (e.g. the
          // preprint's own arXiv DOI) — replace it so the fix button and the
          // preview below always refer to the same record
          const fix={field:"doi",value:normDoi(pub.doi),label:`Use published DOI ${normDoi(pub.doi)}`};
          const idx=out.fixes.findIndex(f=>f.field==="doi");
          if(idx>=0) out.fixes[idx]=fix; else out.fixes.push(fix);
          out.doiPreview=doiPreviewRecord(pub);
        }
        addPublishedRecordFixes(e,out,pub);
      }else out.notes.push("Preprint — no published version found yet.");
    }catch(err){}
  }
}
function titleTokens(s){
  return String(s||"").toLowerCase()
    .replace(/[{}]/g,"")
    .replace(/[^a-z0-9\s]/g," ")
    .split(/\s+/)
    .filter(w=>w.length>2 && !STOPWORDS.has(w));
}
function tok(s){return new Set(titleTokens(s));}
function jaccard(a,b){const i=[...a].filter(x=>b.has(x)).length;const u=new Set([...a,...b]).size;return u?i/u:0;}
function titleSimilarity(a,b){
  const A=tok(a), B=tok(b);
  const score=jaccard(A,B);
  const leadA=titleTokens(a).slice(0,3), leadB=titleTokens(b).slice(0,3);
  const leadOverlap=leadA.some(w=>leadB.includes(w));
  const leadMismatch=leadA.length>=2 && leadB.length>=2 && !leadOverlap && score<0.8;
  return {
    score,
    reason: leadMismatch ? "lead terms differ" : "",
    passes(threshold){ return score>=threshold && !leadMismatch; }
  };
}

/* Journal/venue comparison that tolerates abbreviations:
   "J. Mach. Learn. Res." should still match "Journal of Machine Learning Research".
   We match each significant word by prefix (mach~machine), so abbreviations align. */
const JSTOP=new Set("the of and for a an on in to & proceedings annual international conference workshop on".split(" "));
function jWords(s){return s.toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w=>w&&!JSTOP.has(w));}
function journalMatch(a,b){
  if(isArxivVenue(a) && isArxivVenue(b)) return true;
  const A=jWords(a),B=jWords(b);
  // Skip when either side is a single token: it's usually an acronym (NeurIPS, JMLR,
  // PNAS) that can't be prefix-matched, and one-word names are too risky to compare.
  if(A.length===1 && B.length===1) return A[0]===B[0];
  if(A.length<2 || B.length<2) return true;
  const [short,long]=A.length<=B.length?[A,B]:[B,A];
  let hit=0;
  for(const w of short){
    if(long.some(x=>x===w||(w.length>=3&&x.startsWith(w))||(x.length>=3&&w.startsWith(x)))) hit++;
  }
  return hit/short.length>=0.6;
}
// A journal name that uses abbreviation dots ("Annu. Rev. Cell Dev. Biol.",
// "J. Mach. Learn. Res.") — a word immediately followed by a period.
function journalLooksAbbreviated(s){
  return /[A-Za-z]\.(\s|$)/.test(String(s||"").replace(/[{}]/g,""));
}
// Which field a looked-up venue should populate. Prefer whichever the entry already
// uses; when none is present, pick by type so proceedings get booktitle, not journal.
function venueFieldFor(e){
  if(e.fields.journaltitle!=null) return "journaltitle";
  if(e.fields.booktitle!=null) return "booktitle";
  if(e.fields.journal!=null) return "journal";
  return ["inproceedings","conference","incollection","inbook"].includes(e.type) ? "booktitle" : "journal";
}
function isArxivVenue(s){
  return /(^|\b)arxiv(\.org)?\b/i.test(String(s||""));
}
function canonicalPages(s){
  return cleanField(s).replace(/[—–]/g,"-").replace(/^(\d+)\s*-+\s*(\d+)$/,(_,start,end)=>`${start}--${expandAbbreviatedPageEnd(start,end)}`);
}
// Only compare purely numeric page ranges — skip eLocation/article ids like "e0123456".
function expandAbbreviatedPageEnd(start,end){
  start=String(start||""); end=String(end||"");
  if(!start || !end || end.length>=start.length) return end;
  const prefix=start.slice(0,start.length-end.length);
  let full=prefix+end;
  if(Number(full)<Number(start) && prefix) full=String(Number(prefix)+1)+end;
  return full;
}
function pageSpan(s){
  if(/[a-zA-Z]/.test(s||"")) return null;
  const m=(s||"").replace(/[—–]/g,"-").match(/\d+/g);
  if(!m) return null;
  const start=m[0];
  const end=expandAbbreviatedPageEnd(start,m[m.length-1]);
  return [start,end];
}
function pagesDiffer(a,b){
  a=canonicalPages(a); b=canonicalPages(b);
  const A=pageSpan(a),B=pageSpan(b);
  if(!A||!B) return false;                          // can't compare (e.g. article number)
  if(A[0]!==B[0]) return true;                      // different start page
  if(A[1]!==B[1] && A[0]!==A[1] && B[0]!==B[1]) return true; // both ranges, different end
  return false;
}

/* ---------- 8. UI ------------------------------------------ */
const $=s=>document.querySelector(s);
const drop=$("#drop"), fileInput=$("#file");

["dragenter","dragover"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("hot");}));
["dragleave","drop"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove("hot");}));
drop.addEventListener("drop",e=>{const f=e.dataTransfer.files[0]; if(f) readFile(f);});
$("#btnPick").onclick=()=>fileInput.click();
fileInput.onchange=e=>{const f=e.target.files[0]; if(f) readFile(f);};

function readFile(f){
  const r=new FileReader();
  r.onload=()=>{ CURRENT_FILE_NAME=f.name; loadText(r.result); toast(`Loaded ${f.name}`); };
  r.readAsText(f);
}
function loadText(text){
  const {entries,preamble}=parseBib(text);
  ENTRIES=entries; RAW_PREAMBLE=preamble;
  normalizeEntries(ENTRIES);
  lintAll(ENTRIES);
  render();
}

function render(){
  ENTRIES=sortEntries(ENTRIES);  // visual order matches export order
  const errs=ENTRIES.reduce((s,e)=>s+visibleErrCount(e),0);
  const warns=ENTRIES.reduce((s,e)=>s+visibleWarnCount(e),0);
  const notfound=ENTRIES.filter(isNotFound).length;
  const clean=ENTRIES.filter(e=>!visibleErrCount(e)&&!visibleWarnCount(e)&&!isNotFound(e)).length;
  const mod=ENTRIES.filter(isChanged).length;
  $("#summary").style.display="flex";
  $("#summary").innerHTML=
    `<span class="chip"><b>${ENTRIES.length}</b> entries</span>`+
    `<span class="chip ${errs?'err':''}"><b>${errs}</b> errors</span>`+
    `<span class="chip ${warns?'warn':''}"><b>${warns}</b> warnings</span>`+
    `<span class="chip ok"><b>${clean}</b> clean</span>`+
    (notfound?`<span class="chip nf"><b>${notfound}</b> not found</span>`:"")+
    (mod?`<span class="chip" style="border-color:var(--accent);color:var(--accent)"><b>${mod}</b> modified</span>`:"");
  $("#toolbar").style.display="flex";
  $("#entries").style.display="block";
  $("#btnReport").disabled=false;
  $("#btnImportReport").disabled=false;
  $("#btnExport").disabled=false;
  renderIssueFilters();
  renderEntries();
}
function entryLetter(e){
  const c=String(e&&e.key||"").trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(c) ? c : "#";
}
/* Dynamic issue filters: sort each lint issue into a broad, human-readable bucket.
   Only buckets actually present in the loaded library become chips beneath the
   toolbar, so a user can jump straight to e.g. every duplicate key or page-range
   problem without typing a search. First matching category wins; "other" catches
   anything unclassified. */
const ISSUE_CATEGORIES=[
  {key:"required",   label:"Missing field",          re:/^Missing required field|^Missing journal; DOI\/URL looks like arXiv/i},
  {key:"unknown",    label:"Unexpected field",       re:/^Unexpected field/i},
  {key:"dupkey",     label:"Duplicate key",          re:/^Duplicate citation key/i},
  {key:"dupdoi",     label:"Duplicate DOI",          re:/^Duplicate DOI/i},
  {key:"dupentry",   label:"Duplicate entry",        re:/^Possible duplicate/i},
  {key:"keystyle",   label:"Key style",              re:/expected style/i},
  {key:"year",       label:"Year format",            re:/^Year is not a 4-digit/i},
  {key:"date",       label:"Date field",             re:/date field|and date \(|Redundant date/i},
  {key:"pages",      label:"Page range",             re:/^Page range/i},
  {key:"doi",        label:"DOI format",             re:/^DOI should be bare|canonical DOI/i},
  {key:"month",      label:"Month format",           re:/^Month must be an integer/i},
  {key:"protected",  label:"Protected words",        re:/not brace-protected/i},
  {key:"allcaps",    label:"ALL-CAPS title",         re:/^Title is ALL-CAPS/i},
  {key:"type",       label:"Unknown type",           re:/^Unknown entry type/i},
  {key:"eventtitle", label:"eventtitle → booktitle", re:/eventtitle/i},
  {key:"retracted",  label:"Retracted",              re:/RETRACTED/},
  {key:"verify",     label:"Verification",           re:/^Verification/i},
  {key:"other",      label:"Other",                  re:/./},
];
function issueCategoryKey(issue){
  const msg=(issue&&issue.msg)||"";
  const c=ISSUE_CATEGORIES.find(c=>c.re.test(msg));
  return c?c.key:"other";
}
function entryHasIssueCategory(e,key){
  return !e._resolved && (e.issues||[]).some(is=>issueCategoryKey(is)===key);
}
/* the entries currently shown, honouring the status filter, the issue filter and the search box */
function filteredEntries(){
  const q=CUR_SEARCH.trim().toLowerCase();
  return ENTRIES.filter(e=>{
    const errCount=visibleErrCount(e), warnCount=visibleWarnCount(e);
    if(CUR_FILTER==="err" && !(errCount>0)) return false;
    if(CUR_FILTER==="warn" && !(warnCount>0&&!errCount)) return false;
    if(CUR_FILTER==="clean" && (errCount||warnCount||isNotFound(e))) return false;
    if(CUR_FILTER==="notfound" && !isNotFound(e)) return false;
    if(CUR_FILTER==="mod" && !isChanged(e)) return false;
    if(CUR_ISSUE && !entryHasIssueCategory(e,CUR_ISSUE)) return false;
    if(q){
      const issueText=(e._resolved?[]:e.issues).map(x=>{
        const sev=x.sev==="err" ? "error err" : "warning warn";
        const actions=(x.actions||[]).map(a=>a.label).join(" ");
        return `${sev} ${x.msg} ${x.fix||""} ${actions}`;
      }).join(" ");
      const hay=(e.key+" "+(e.fields.title||"")+" "+(e.fields.author||e.fields.editor||"")+" "+issueText).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
}
function verifyButtonLabel(){
  return CUR_FILTER==="all" && !CUR_ISSUE && !CUR_SEARCH.trim() ? "Verify all…" : "Verify filtered…";
}
function updateVerifyButtonLabel(){
  const btn=$("#btnVerify");
  if(btn && !btn.classList.contains("running")) btn.textContent=verifyButtonLabel();
}
function autoFixTooltip(entries){
  const types=[];
  const seen=new Set();
  const addType=t=>{ if(t&&!seen.has(t)){ seen.add(t); types.push(t); } };
  for(const e of entries){
    if(e._resolved) continue;
    for(const is of e.issues||[]){
      if(!(is.actions||[]).some(a=>a.auto)) continue;
      const msg=is.msg||"";
      if(/Missing journal; DOI\/URL looks like arXiv/i.test(msg)) addType("missing arXiv journal fields");
      else if(/Use booktitle instead of eventtitle/i.test(msg)) addType("proceedings eventtitle aliases");
      else if(/Unexpected field/i.test(msg)) addType("known field-name typos");
      else if(/Year is not a 4-digit number/i.test(msg)) addType("year formatting");
      else if(/Use year instead of date field|date .* disagree|Redundant date field/i.test(msg)) addType("date → year");
      else if(/Page range (uses single dash|should use BibTeX double dash)/i.test(msg)) addType("page-range dashes");
      else if(/DOI should be bare/i.test(msg)) addType("DOI URL/prefix cleanup");
      else if(/Month must be an integer/i.test(msg)) addType("month names/abbreviations");
      else if(/title is not brace-protected/i.test(msg)) addType("protected title words");
      else addType(msg.replace(/\s+/g," ").trim());
    }
    if(autoVerifyFixes(e).length) addType("verified DOI additions/updates");
  }
  return types.length
    ? `Auto-fix will fix: ${types.join(", ")}.`
    : "No safe auto-fixes are currently available.";
}
function renderEntries(){
  const box=$("#entries"); box.innerHTML="";
  const list=filteredEntries();
  updateVerifyButtonLabel();
  $("#btnAutofix").title=autoFixTooltip(ENTRIES);
  renderAlphaRail(list);
  if(!list.length){ box.innerHTML=`<p class="muted" style="padding:16px">No entries match.</p>`; return; }
  const seenLetters=new Set();
  for(const e of list){
    const el=entryEl(e);
    const letter=entryLetter(e);
    if(!seenLetters.has(letter)){
      el.dataset.letterAnchor=letter;
      seenLetters.add(letter);
    }
    box.appendChild(el);
    if(e._verify) paintVerify(e);
  }
}
/* Build the dynamic issue-filter chips from whatever issues the library actually
   has. Each chip counts the ENTRIES carrying that issue type (not total issues),
   respects resolved entries, and toggles a standalone filter. */
function renderIssueFilters(){
  const bar=$("#issuebar"); if(!bar) return;
  const counts=new Map();  // key -> {label, count, err}
  for(const e of ENTRIES){
    if(e._resolved) continue;
    const seen=new Set();
    for(const is of e.issues||[]){
      const key=issueCategoryKey(is);
      let rec=counts.get(key);
      if(!rec){
        const cat=ISSUE_CATEGORIES.find(c=>c.key===key);
        rec={label:(cat&&cat.label)||key, count:0, err:false};
        counts.set(key,rec);
      }
      if(is.sev==="err") rec.err=true;
      if(!seen.has(key)){ rec.count++; seen.add(key); }
    }
  }
  if(CUR_ISSUE && !counts.has(CUR_ISSUE)) CUR_ISSUE="";   // selection no longer applies
  if(!counts.size){ bar.style.display="none"; bar.innerHTML=""; return; }
  bar.style.display="flex";
  const chips=ISSUE_CATEGORIES.filter(c=>counts.has(c.key)).map(c=>{
    const rec=counts.get(c.key);
    const cls=`issuechip ${rec.err?"err":"warn"}${CUR_ISSUE===c.key?" active":""}`;
    return `<button class="${cls}" data-issue="${c.key}">${escapeHtml(rec.label)} <b>${rec.count}</b></button>`;
  }).join("");
  bar.innerHTML=`<span class="lbl">Filter by issue:</span>${chips}`+
    (CUR_ISSUE?`<button class="issuechip clearissue" data-issue="">Clear ✕</button>`:"");
  bar.querySelectorAll(".issuechip").forEach(b=>b.onclick=()=>{
    const key=b.dataset.issue;
    CUR_ISSUE=(key && CUR_ISSUE!==key) ? key : "";
    // issue chips are a standalone dimension — reset the status filter to All.
    CUR_FILTER="all";
    document.querySelectorAll(".filterbtn").forEach(x=>x.classList.toggle("active",x.dataset.f==="all"));
    renderIssueFilters(); renderEntries();
  });
}
function renderAlphaRail(list){
  const rail=$("#alphaRail");
  if(!rail) return;
  const letters=["#","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"];
  const available=new Set(list.map(entryLetter));
  // Base visibility on the whole library, not the filtered subset, so the rail
  // doesn't flicker away when a filter or "Resolved" narrows the view. Hide it only
  // when nothing is shown — there'd be no anchors to jump to.
  rail.classList.toggle("show", ENTRIES.length>12 && list.length>0);
  rail.innerHTML=letters.map(l=>{
    const enabled=l==="#"||available.has(l);
    const label=l==="#"?"Back to top":`Jump to ${l}`;
    return `<button type="button" data-letter="${l}" class="${enabled?"on":""}" ${enabled?"": "disabled"} aria-label="${label}">${l}</button>`;
  }).join("");
  rail.querySelectorAll("button.on").forEach(b=>b.onclick=()=>{
    if(b.dataset.letter==="#"){
      rail.querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));
      window.scrollTo({top:0,behavior:"smooth"});
      return;
    }
    const target=document.querySelector(`.entry[data-letter-anchor="${cssEsc(b.dataset.letter)}"]`);
    if(!target) return;
    rail.querySelectorAll("button").forEach(x=>x.classList.toggle("active",x===b));
    target.scrollIntoView({behavior:"smooth",block:"start"});
  });
}
const OPEN=new Set();   // remembers which entries are expanded across re-renders
function entryTypeOptions(current){
  const types=ENTRY_TYPES.includes(current) ? ENTRY_TYPES : [current,...ENTRY_TYPES];
  return types.map(t=>`<option value="${escapeHtml(t)}" ${t===current?"selected":""}>${escapeHtml(t)}</option>`).join("");
}
function entryEl(e){
  const d=document.createElement("details"); d.className="entry";
  const kl=e.key.toLowerCase();
  if(OPEN.has(kl)) d.open=true;
  d.addEventListener("toggle",()=>{ d.open?OPEN.add(kl):OPEN.delete(kl); });
  const title=(e.fields.title||"").replace(/[{}]/g,"").slice(0,120)||"(no title)";
  const fmt=serializeEntry(e,false).trim();   // formatted view = what gets exported (original key kept)
  const diff=diffCodeHtml(e._orig.trim(),fmt);
  const badges=[];
  if(isChanged(e))badges.push(`<span class="badge mod" title="modified — you edited or autofixed this entry">✎</span>`);
  const errCount=visibleErrCount(e), warnCount=visibleWarnCount(e);
  if(e._resolved)badges.push(`<span class="badge res" title="resolved — issues hidden">✓ resolved</span>`);
  else if(errCount)badges.push(`<span class="badge e">${errCount}</span>`);
  if(!e._resolved && warnCount)badges.push(`<span class="badge w">${warnCount}</span>`);
  if(isNotFound(e))badges.push(`<span class="badge nf" title="not found — no match in any enabled database">? not found</span>`);
  if(!errCount&&!warnCount&&!e._resolved&&!isNotFound(e))badges.push(`<span class="badge ok">✓</span>`);
  e._fixacts=[];   // index → action, for the fix buttons below
  const visibleIssues=e._resolved ? [] : e.issues;
  const issues=visibleIssues.map(x=>{
    const btns=(x.actions||[]).map(a=>{
      const id=e._fixacts.push(a)-1;
      return `<button class="fixbtn${a.auto?' auto':''}" data-fix="${id}">${escapeHtml(a.label)}</button>`;
    }).join("");
    return `<div class="issue ${x.sev==='err'?'e':'w'}"><span class="ic">${x.sev==='err'?'✕':'!'}</span>`+
      `<span>${escapeHtml(x.msg)}</span>`+
      (btns?`<span class="fixwrap">${btns}</span>`:(x.fix?`<span class="fix">→ ${escapeHtml(x.fix)}</span>`:''))+
      `</div>`;
  }).join("");
  const hiddenIssueCount=e._resolved ? e.issues.length : 0;
  const hasAuto=visibleIssues.some(x=>(x.actions||[]).some(a=>a.auto)) || autoVerifyFixes(e).length>0;
  const autoTitle=autoFixTooltip([e]);
  const verifySlot=`<div class="verify" data-key="${escapeHtml(e.key)}"></div>`;
  d.innerHTML=
    `<summary><span class="etype">${e.type}</span>`+
    `<span class="ekey">${escapeHtml(e.key)}</span>`+
    `<span class="etitle">${escapeHtml(title)}</span>`+
    `<span class="badges">${badges.join("")}</span></summary>`+
    `<div class="ebody">`+
      (issues?`<div class="issues">${issues}</div>`:
        e._resolved?`<p class="muted" style="margin-bottom:12px">${hiddenIssueCount} issue${hiddenIssueCount===1?"":"s"} hidden as resolved.</p>`:
        `<p class="muted" style="margin-bottom:12px">No lint issues.</p>`)+
      verifySlot+
      `<div class="ebar">`+
        ((e.issues.length||e._resolved)?`<button class="ed-resolve">${e._resolved?"Show issues":"Resolved"}</button>`:"")+
        `<select class="type-select" title="Entry type" aria-label="Entry type">${entryTypeOptions(e.type)}</select>`+
        `<button class="ed-edit">✎ Edit</button>`+
        `<button class="ed-verify">⌕ Verify</button>`+
        (hasAuto?`<button class="ed-autofix primary" title="${escapeHtml(autoTitle)}">⚡ Auto-fix this entry</button>`:"")+
        `<span class="spacer"></span>`+
        `<button class="ed-del danger">Delete</button>`+
      `</div>`+
      `<div class="entry-view twocol">`+
        `<div><div class="lab">Original</div><pre class="code diff">${diff.original}</pre></div>`+
        `<div><div class="lab">Formatted${isChanged(e)?" · edited":""}</div>`+
          `<pre class="code diff">${diff.formatted}</pre></div>`+
      `</div>`+
      `<div class="entry-edit field" style="display:none">`+
        `<label>Edit BibTeX — type, key and any field</label>`+
        `<textarea class="ed-area" spellcheck="false">${escapeHtml(fmt)}</textarea>`+
        `<div class="ebar" style="margin:10px 0 0">`+
          `<button class="ed-apply primary">Apply changes</button>`+
          `<button class="ed-cancel">Cancel</button>`+
        `</div>`+
      `</div>`+
    `</div>`;
  // wire edit controls
  const bar=d.querySelector(".ebar"), view=d.querySelector(".entry-view"),
        edit=d.querySelector(".entry-edit"), area=d.querySelector(".ed-area");
  d.querySelector(".ed-edit").onclick=ev=>{ev.preventDefault();
    bar.style.display="none"; view.style.display="none"; edit.style.display="block"; area.focus();};
  d.querySelector(".ed-cancel").onclick=ev=>{ev.preventDefault(); area.value=fmt;
    edit.style.display="none"; bar.style.display="flex"; view.style.display="grid";};
  d.querySelector(".ed-apply").onclick=ev=>{ev.preventDefault(); applyEdit(e,area.value);};
  d.querySelector(".type-select").onchange=ev=>applyFix(e,{kind:"setType",value:ev.target.value});
  d.querySelector(".ed-verify").onclick=ev=>{ev.preventDefault(); verifyOne(e,ev.currentTarget);};
  d.querySelector(".ed-del").onclick=ev=>{ev.preventDefault(); deleteEntry(e);};
  const rb=d.querySelector(".ed-resolve");
  if(rb) rb.onclick=ev=>{ev.preventDefault(); toggleResolved(e);};
  d.querySelectorAll(".fixbtn").forEach(b=>b.onclick=ev=>{ev.preventDefault();
    applyFix(e,e._fixacts[+b.dataset.fix]);});
  const af=d.querySelector(".ed-autofix");
  if(af) af.onclick=ev=>{ev.preventDefault(); autoFixEntry(e);};
  return d;
}
/* ---- autocorrect ---- */
// apply one fix to the entry's data; returns true if the entry itself changed
function mutateEntry(e,act){
  const unbare=f=>{ if(e.bare) delete e.bare[f]; };
  switch(act.kind){
    case "setField": e.fields[act.field]=act.value; unbare(act.field); return true;
    case "removeField": delete e.fields[act.field]; unbare(act.field); return true;
    case "renameField":{
      const v=e.fields[act.field];
      const existing=e.fields[act.to];
      // Never silently discard data: if the target already holds a different
      // value, keep both fields and let the user resolve it by hand.
      if(existing!=null && cleanField(existing)!==cleanField(v)) return false;
      delete e.fields[act.field];
      if(existing==null){ e.fields[act.to]=v; if(e.bare&&e.bare[act.field]) e.bare[act.to]=true; }
      unbare(act.field);
      return true; }
    case "setKey": e.key=act.value; return true;
    case "setType": e.type=String(act.value||"").toLowerCase(); return true;
    case "convertDateToYear":{ const y=(String(e.fields.date||"").replace(/[{}]/g,"").match(/\d{4}/)||[])[0];
      if(!y) return false;
      e.fields.year=y; unbare("year");
      delete e.fields.date; unbare("date"); return true; }
    case "allowField": if(!CONFIG.optionalFields.includes(act.field)) CONFIG.optionalFields.push(act.field); return false; // config change, not an entry change
  }
  return false;
}
// Remove a field from every entry and remember the choice, so it stays gone on
// re-lint and never returns for other/newly-added entries. Mirrors "Allow this
// field" (which adds to optionalFields) but in the opposite direction.
function removeFieldEverywhere(field){
  const name=String(field||"").toLowerCase();
  if(!name) return;
  const affected=ENTRIES.filter(e=>name in e.fields).length;
  if(!CONFIG.formatting.dropFields.some(x=>x.toLowerCase()===name))
    CONFIG.formatting.dropFields.push(name);
  normalizeEntries(ENTRIES);
  lintAll(ENTRIES); render();
  toast(affected
    ? `Removed "${name}" from ${affected} ${affected===1?"entry":"entries"} (added to dropped fields)`
    : `"${name}" added to dropped fields`);
}
function applyFix(e,act){
  if(!act) return;
  if(act.kind==="removeFieldAll"){ removeFieldEverywhere(act.field); return; }
  if(act.kind==="mergeInto"){ mergeEntryInto(e,act.target); return; }
  if(act.kind==="deleteEntry"){ deleteEntry(e); return; }
  const oldKey=e.key.toLowerCase();
  const changed=mutateEntry(e,act);
  if(changed){
    e._dirty=true;
    // Keep the verification record but drop only what this edit resolved, so
    // accepting one suggested fix no longer discards the entry's other fixes.
    if(e._verify) pruneResolvedVerify(e,e._verify);
  }
  if(OPEN.has(oldKey)){ OPEN.delete(oldKey); OPEN.add(e.key.toLowerCase()); }
  lintAll(ENTRIES); render();
  toast(changed||act.kind==="allowField" ? "Fixed" :
    act.kind==="renameField" ? `Kept "${act.field}" — "${act.to}" already has a different value` :
    "Nothing to fix");
}
function autoVerifyFixes(e){
  if(!CONFIG.autofix.fixDoi || e._resolved || !e._verify) return [];
  return (e._verify.fixes||[])
    .filter(f=>f.field==="doi" && f.value)
    .map(f=>({kind:"setField",field:"doi",value:f.value}));
}
function autoFixEntry(e){
  let n=0;
  const verifyActs=autoVerifyFixes(e);
  for(const is of e.issues) for(const a of (is.actions||[])) if(a.auto && mutateEntry(e,a)){ n++; }
  for(const a of verifyActs) if(mutateEntry(e,a)){ n++; }
  if(n){ e._dirty=true; if(e._verify) pruneResolvedVerify(e,e._verify); }
  lintAll(ENTRIES); render(); toast(n?`Auto-fixed ${n} issue${n>1?"s":""}`:"Nothing to auto-fix");
}
function autoFixAll(){
  let n=0, ents=0;
  for(const e of ENTRIES){ if(e._resolved) continue; let c=0;
    const verifyActs=autoVerifyFixes(e);
    for(const is of e.issues) for(const a of (is.actions||[])) if(a.auto && mutateEntry(e,a)){ c++; }
    for(const a of verifyActs) if(mutateEntry(e,a)){ c++; }
    if(c){ e._dirty=true; if(e._verify) pruneResolvedVerify(e,e._verify); n+=c; ents++; }
  }
  lintAll(ENTRIES); render();
  toast(n?`Auto-fixed ${n} issue${n>1?"s":""} across ${ents} entr${ents>1?"ies":"y"}`:"Nothing to auto-fix");
}
/* Re-parse one edited entry, swap it into ENTRIES, re-lint and re-render. */
function applyEdit(e,text){
  const {entries:parsed}=parseBib(text);
  if(!parsed.length){ toast("Couldn't parse — check the BibTeX syntax"); return; }
  const ne=parsed[0];
  const idx=ENTRIES.indexOf(e);
  if(idx<0){ toast("Entry no longer exists"); return; }
  normalizeEntries([ne]);
  ne._orig=e._orig;   // keep the pristine original in the "Original" pane
  ne._dirty=true;
  ne._resolved=false;
  ENTRIES[idx]=ne;
  OPEN.delete(e.key.toLowerCase()); OPEN.add(ne.key.toLowerCase()); // keep it expanded
  lintAll(ENTRIES); render();
  toast("Entry updated");
}
function toggleResolved(e){
  e._resolved=!e._resolved;
  render();
  toast(e._resolved?"Issues hidden for this entry":"Issues shown for this entry");
}
function deleteEntry(e){
  if(!window.confirm(`Delete entry "${e.key}"? This can't be undone.`)) return;
  const idx=ENTRIES.indexOf(e); if(idx<0) return;
  ENTRIES.splice(idx,1); OPEN.delete(e.key.toLowerCase());
  lintAll(ENTRIES); render();
  toast("Entry deleted");
}
/* Merge a duplicate into its counterpart. The newer entry's values win: the
   one with the later year — or, on a year tie, the non-preprint one — keeps
   its field values, entry type, and citation key, so the key never
   contradicts the merged content (e.g. a 2024 key on the 2025 published
   version); the other entry only fills fields the winner lacks. Exception:
   if a third entry already uses the winner's key, the target's key is kept
   to avoid creating a duplicate-key error. */
function mergeWinner(src,target){
  const ys=parseInt(reportYear(src),10)||0, yt=parseInt(reportYear(target),10)||0;
  if(ys!==yt) return ys>yt?src:target;
  const ps=isPreprint(src), pt=isPreprint(target);
  if(ps!==pt) return ps?target:src;
  return target;
}
// Fields that would re-mark a published (non-preprint) merge winner as a
// preprint if copied over from its preprint duplicate.
function preprintLeakField(f,v){
  if(["eprint","eprinttype","archiveprefix","primaryclass"].includes(f)) return true;
  if(f==="doi") return isPreprintDoi(v);
  if(["journal","journaltitle","booktitle","howpublished","publisher","note","url"].includes(f)) return isPreprintVenue(v);
  return false;
}
function mergeEntryInto(src,targetKey){
  const target=ENTRIES.find(x=>x!==src && x.key.toLowerCase()===String(targetKey||"").toLowerCase());
  if(!target){ toast(`Entry "${targetKey}" no longer exists`); return; }
  const winner=mergeWinner(src,target), loser=winner===src?target:src;
  const keyTaken=ENTRIES.some(x=>x!==src&&x!==target&&x.key.toLowerCase()===winner.key.toLowerCase());
  const keptKey=keyTaken?target.key:winner.key, lostKey=keptKey===src.key?target.key:src.key;
  if(!window.confirm(`Merge "${src.key}" into "${target.key}"?\n\nField values are kept from "${winner.key}"; "${loser.key}" only fills in missing fields. This can't be undone.`)) return;
  // Rebuild the surviving entry from the winner's fields, then fill gaps from
  // the loser — dropping loser-only preprint markers when the winner is the
  // published version (they would re-flag the merged entry as a preprint).
  const guardPreprint=isPreprint(loser)&&!isPreprint(winner);
  const fields={}, bareMap={};
  const take=(f,from)=>{ fields[f]=from.fields[f]; if(from.bare&&from.bare[f]) bareMap[f]=true; };
  for(const f of Object.keys(winner.fields)) if(cleanField(winner.fields[f])) take(f,winner);
  for(const f of Object.keys(loser.fields)){
    if(fields[f]!==undefined || !cleanField(loser.fields[f])) continue;
    if(guardPreprint && preprintLeakField(f,loser.fields[f])) continue;
    take(f,loser);
  }
  let changed=(target.type!==winner.type)?1:0;
  for(const f of new Set([...Object.keys(target.fields),...Object.keys(fields)]))
    if(target.fields[f]!==fields[f]) changed++;
  target.type=winner.type; target.fields=fields; target.bare=bareMap;
  const idx=ENTRIES.indexOf(src);
  if(idx>=0) ENTRIES.splice(idx,1);
  OPEN.delete(src.key.toLowerCase());
  if(keptKey!==target.key){
    if(OPEN.delete(target.key.toLowerCase())) OPEN.add(keptKey.toLowerCase());
    target.key=keptKey;
    // a key rename alone must still reach the exported file
    target._dirty=true;
  }
  if(changed){
    target._dirty=true;
    // pure fill-ins keep the verification cache; overwritten values invalidate it
    if(winner===target){ if(target._verify) pruneResolvedVerify(target,target._verify); }
    else delete target._verify;
  }
  lintAll(ENTRIES); render();
  toast(`Merged "${lostKey}" into "${keptKey}" keeping "${winner.key}"'s values${changed?` (${changed} field${changed===1?"":"s"} updated)`:""}`);
}
function escapeHtml(s){return (s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
// URLs from the loaded .bib file or API responses become clickable links; only
// allow http(s) so a crafted `url = {javascript:...}` can never execute.
function safeUrl(u){ u=String(u||"").trim(); return /^https?:\/\//i.test(u)?u:""; }
function doiAnchor(url,doi){
  const href=safeUrl(url)||`https://doi.org/${doi}`;
  return `<a class="doi-link" href="${escapeHtml(href)}" title="Open DOI in popup window">${escapeHtml(doi)}</a>`;
}
function openDoiPopup(url){
  const w=900, h=720;
  const left=Math.max(0, Math.round((window.screenX||0)+(window.outerWidth-w)/2));
  const top=Math.max(0, Math.round((window.screenY||0)+(window.outerHeight-h)/2));
  const features=`popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`;
  const popup=window.open("", "tidybiberDoiPopup", features);
  if(popup){
    popup.opener=null;
    popup.location.href=url;
    popup.focus();
  }else{
    window.open(url,"_blank","noopener");
  }
}
document.addEventListener("click",e=>{
  const a=e.target.closest&&e.target.closest("a.doi-link");
  if(!a) return;
  e.preventDefault();
  openDoiPopup(a.href);
});
function diffCodeHtml(original,formatted){
  const a=String(original||"").split("\n");
  const b=String(formatted||"").split("\n");
  const m=a.length, n=b.length;
  const dp=Array.from({length:m+1},()=>Array(n+1).fill(0));
  for(let i=m-1;i>=0;i--) for(let j=n-1;j>=0;j--)
    dp[i][j]=a[i]===b[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j],dp[i][j+1]);
  const origMarks=Array(m).fill(false), fmtMarks=Array(n).fill(false);
  let i=0,j=0;
  while(i<m || j<n){
    if(i<m && j<n && a[i]===b[j]){ i++; j++; }
    else if(j>=n || (i<m && dp[i+1][j]>=dp[i][j+1])){ origMarks[i++]=true; }
    else{ fmtMarks[j++]=true; }
  }
  const line=(s,cls)=>`<span class="dline${cls?' '+cls:''}">${escapeHtml(s)}</span>`;
  // .dwrap sizes itself to the widest line so colored lines span the full
  // scroll width of the pane, not just the initially visible part
  return {
    original:`<div class="dwrap">${a.map((s,k)=>line(s,origMarks[k]?"rm":"")).join("")}</div>`,
    formatted:`<div class="dwrap">${b.map((s,k)=>line(s,fmtMarks[k]?"add":"")).join("")}</div>`
  };
}

/* filters */
document.querySelectorAll(".filterbtn").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".filterbtn").forEach(x=>x.classList.remove("active"));
  b.classList.add("active"); CUR_FILTER=b.dataset.f;
  CUR_ISSUE=""; renderIssueFilters(); renderEntries();
});
/* search box (debounced) */
let _searchT=null;
$("#search").oninput=e=>{
  clearTimeout(_searchT);
  _searchT=setTimeout(()=>{ CUR_SEARCH=e.target.value; renderEntries(); },180);
};

/* auto-fix every safe issue across all entries */
$("#btnAutofix").onclick=()=>autoFixAll();

/* add a new, blank entry and drop straight into its editor */
$("#btnAdd").onclick=()=>{
  const used=new Set(ENTRIES.map(e=>e.key.toLowerCase()));
  let k="newentry", i=1; while(used.has(k.toLowerCase())) k="newentry"+(++i);
  const tpl=`@article{${k},\n  author = {},\n  title = {},\n  journal = {},\n  year = {},\n}`;
  const ne=parseBib(tpl).entries[0];
  ENTRIES.unshift(ne);
  OPEN.add(ne.key.toLowerCase());
  CUR_FILTER="all";
  document.querySelectorAll(".filterbtn").forEach(x=>x.classList.toggle("active",x.dataset.f==="all"));
  lintAll(ENTRIES); render();
  // open its editor
  const slot=document.querySelector(`.verify[data-key="${cssEsc(ne.key)}"]`);
  const det=slot&&slot.closest("details");
  if(det){ det.open=true; const b=det.querySelector(".ed-edit"); if(b)b.click();
    det.scrollIntoView({behavior:"smooth",block:"center"}); }
  toast("New entry added — edit and Apply");
};

/* export */
$("#btnReport").onclick=()=>{
  lintAll(ENTRIES);
  const blob=new Blob([exportReport()],{type:"text/plain"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download="tidybiber-report.txt"; a.click(); URL.revokeObjectURL(a.href);
  const problemCount=ENTRIES.filter(reportEntryHasProblem).length;
  toast(`Exported report with ${problemCount} entr${problemCount===1?"y":"ies"} needing attention`);
};
$("#btnImportReport").onclick=()=>$("#reportFile").click();
$("#reportFile").onchange=e=>{
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{
    const res=importReport(r.result);
    if(!res.ok) toast(res.reason);
    else toast(`Imported verification for ${res.matched}/${res.total} entr${res.total===1?"y":"ies"}${res.cleared?`; cleared ${res.cleared} stale finding${res.cleared===1?"":"s"}`:""}`);
    e.target.value="";
  };
  r.readAsText(f);
};
$("#btnExport").onclick=()=>{
  const mod=ENTRIES.filter(isChanged).length;
  const blob=new Blob([exportBib()],{type:"text/plain"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download="references.bib"; a.click(); URL.revokeObjectURL(a.href);
  toast(`Exported ${ENTRIES.length} formatted entries — ${mod} with your edits`);
};

/* verify online — runs over the current filtered + searched entries;
   the button doubles as a Stop control while running */
let VERIFYING=false;
$("#btnVerify").onclick=async()=>{
  const btn=$("#btnVerify");
  if(VERIFYING){ VERIFYING=false; return; }   // second click = Stop
  // "error" means a source outage / rate limit — transient, so batch runs retry it
  const list=filteredEntries().filter(e=>!e._verify || e._verify.status==="unchecked" || e._verify.status==="error");
  if(!list.length){ toast("No filtered unchecked entries to verify"); return; }
  VERIFYING=true; btn.classList.add("running");
  let done=0;
  for(const e of list){
    if(!VERIFYING) break;
    e._verify=await verifyEntry(e);
    paintVerify(e);
    done++; btn.textContent=`Stop (${done}/${list.length})`;
    if(!VERIFYING) break;
    await new Promise(r=>setTimeout(r,CONFIG.verification.delayMs||DEFAULT_CONFIG.verification.delayMs)); // be polite to the APIs
  }
  const stopped=!VERIFYING && done<list.length;
  VERIFYING=false; btn.classList.remove("running"); btn.textContent=verifyButtonLabel();
  lintAll(ENTRIES); render();
  toast(stopped?`Stopped after ${done}`:"Verification complete");
};
/* verify a single entry on demand */
async function verifyOne(e,btn){
  if(btn){ btn.disabled=true; btn.textContent="Verifying…"; }
  e._verify=await verifyEntry(e);
  lintAll(ENTRIES); render();
  if(btn){ btn.disabled=false; btn.textContent="⌕ Verify"; }
}
function paintVerify(e){
  const slot=document.querySelector(`.verify[data-key="${cssEsc(e.key)}"]`);
  if(!slot||!e._verify)return;
  if(e._resolved){ slot.innerHTML=""; return; }
  const v=e._verify;
  const cls=v.status==="found"?(v.notes.some(n=>VERIFY_PROBLEM_RE.test(n))?"w":"ok"):v.status==="notfound"?"nf":"e";
  const preview=v.doiPreview;
  const link=preview?` ${doiAnchor(preview.url,preview.doi)}`:
    (v.matchedUrl&&v.matchedDoi)?` ${doiAnchor(v.matchedUrl,v.matchedDoi)}`:
    safeUrl(v.matchedUrl)?` <a href="${escapeHtml(safeUrl(v.matchedUrl))}" target="_blank" rel="noopener">link</a>`:
    v.matchedDoi?` ${doiAnchor(`https://doi.org/${v.matchedDoi}`,v.matchedDoi)}`:"";
  let rows=`<div class="issue ${cls}"><span class="ic">⌕</span>`+
    `<span><b>${escapeHtml(v.source||v.status)}</b>: ${v.notes.map(escapeHtml).join("; ")}${link}</span></div>`;
  if(preview) rows+=doiPreviewHtml(preview);
  // URL liveness as its own coloured row
  if(v.urlStatus){
    const uok=v.urlStatus.ok;
    const checkedHref=safeUrl(v.urlChecked);
    rows+=`<div class="issue ${uok?'ok':'e'}"><span class="ic">${uok?'🔗':'⚠'}</span>`+
      `<span><b>URL</b>: ${uok?'reachable':escapeHtml(v.urlStatus.reason)} `+
      (checkedHref
        ?`<a href="${escapeHtml(checkedHref)}" target="_blank" rel="noopener">${escapeHtml(v.urlChecked)}</a>`
        :escapeHtml(v.urlChecked))+`</span></div>`;
  }
  // published version of a preprint
  if(v.published){
    const p=v.published;
    rows+=`<div class="issue ok"><span class="ic">★</span><span><b>Published version</b>: `+
      doiAnchor(`https://doi.org/${p.doi}`,p.doi)+
      `${p.year?` (${escapeHtml(p.year)})`:""} — ${escapeHtml((p.title||"").slice(0,90))}</span></div>`;
  }
  // one-click fixes that apply a database value to the entry
  if(v.fixes&&v.fixes.length){
    rows+=`<div class="ebar" style="margin:0">`+
      v.fixes.map((f,i)=>`<button class="fixbtn auto vfixbtn" data-vf="${i}">${escapeHtml(f.label)}</button>`).join("")+
      `</div>`;
  }
  slot.innerHTML=`<div class="issues" style="margin:0 0 12px">${rows}</div>`;
  slot.querySelectorAll(".vfixbtn").forEach(b=>b.onclick=ev=>{ev.preventDefault();
    const f=v.fixes[+b.dataset.vf];
    // pruneResolvedVerify (via applyFix) consumes this fix and re-renders the rest.
    applyFix(e,{kind:"setField",field:f.field,value:f.value});});
}
function doiPreviewHtml(p){
  const meta=[
    ["Title",p.title],
    ["Year",p.year],
    ["Authors",p.authors],
    ["First author",p.firstAuthor],
    ["Journal",p.journal],
    ["Volume",p.volume],
    ["Number",p.number],
    ["Month",p.month],
    ["Article no.",p.articleno],
    ["Publisher",p.publisher],
    ["Pages",p.pages],
    ["Source",p.lookup?`${p.source} (${p.lookup} lookup)`:p.source],
    ["Note",p.note]
  ].filter(([,v])=>v);
  return `<div class="doi-preview"><div class="head"><b>DOI preview</b>`+
    doiAnchor(p.url,p.doi)+`</div>`+
    `<div class="grid">${meta.map(([k,v])=>`<div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div>`).join("")}</div></div>`;
}
function cssEsc(s){return (window.CSS&&CSS.escape)?CSS.escape(s):s.replace(/["\\]/g,"\\$&");}

/* ---------- 9. CONFIG MODAL UI ----------------------------- */
const modal=$("#cfgModal");
$("#btnConfig").onclick=()=>{buildConfigUI();modal.classList.add("open");};
$("#cfgClose").onclick=()=>modal.classList.remove("open");
modal.onclick=e=>{if(e.target===modal)modal.classList.remove("open");};
$("#cfgReset").onclick=()=>{CONFIG=structuredClone(DEFAULT_CONFIG);buildConfigUI();
  if(ENTRIES.length){normalizeEntries(ENTRIES);lintAll(ENTRIES);render();}toast("Config reset to defaults");};
$("#cfgSave").onclick=()=>{
  readConfigUI();
  if(ENTRIES.length){normalizeEntries(ENTRIES);lintAll(ENTRIES);render();}
  modal.classList.remove("open");toast("Re-linted with current config");
};
$("#cfgExportJson").onclick=()=>{
  readConfigUI();
  const blob=new Blob([JSON.stringify(CONFIG,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="tidybiber.config.json";a.click();URL.revokeObjectURL(a.href);
  toast("Exported tidybiber.config.json");
};
$("#cfgImportJson").onclick=()=>$("#cfgFile").click();
$("#cfgFile").onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();
  r.onload=()=>{try{CONFIG=migrateConfig(JSON.parse(r.result));buildConfigUI();
    if(ENTRIES.length){normalizeEntries(ENTRIES);lintAll(ENTRIES);render();}toast("Config imported & applied");}catch(x){toast("Invalid JSON");}};r.readAsText(f);};

function buildConfigUI(){
  const C=CONFIG;
  $("#cfgBody").innerHTML=`
  <details class="cfg" open><summary>Citation key style</summary><div class="inner">
    <div class="field"><label>Mode</label>
      <div class="seg" id="ks_mode">
        ${seg("default","Default",C.keyStyle.mode)}
        ${seg("template","Template",C.keyStyle.mode)}
        ${seg("off","Off",C.keyStyle.mode)}
      </div>
      <p class="hint">Google style → <code class="k">Lastname${C.keyStyle.separator}year${C.keyStyle.separator}word</code> using first author and first meaningful title word.</p>
    </div>
    <div class="field"><label>Template (template mode)</label>
      <input type="text" id="ks_template" value="${attr(C.keyStyle.template)}">
      <p class="hint">Tokens: <code class="k">{authorlast}</code> <code class="k">{authorlasts}</code> <code class="k">{year}</code> <code class="k">{word}</code> <code class="k">{type}</code></p>
    </div>
    <div class="row"><label>Separator</label><input type="text" id="ks_sep" value="${attr(C.keyStyle.separator)}" style="width:80px"></div>
    <div class="row"><label>Case</label>
      <select id="ks_case">${opt(["lower","title","upper","asis"],C.keyStyle.case)}</select></div>
    <div class="row"><input type="checkbox" id="ks_stop" ${C.keyStyle.stripStopwords?"checked":""}><label>Strip stopwords for first word</label></div>
  </div></details>

  <details class="cfg"><summary>Protected words (literal casing)</summary><div class="inner">
    <p class="hint">These are wrapped in <code class="k">{ }</code> inside titles so BibTeX keeps their casing. One per line or comma-separated.</p>
    <textarea id="cf_protect" rows="4">${esc(C.protectedWords.join(", "))}</textarea>
  </div></details>

  <details class="cfg"><summary>Required fields per entry type</summary><div class="inner">
    <p class="hint">JSON map. Use <code class="k">"author|editor"</code> to require at least one of several.</p>
    <textarea id="cf_required" rows="8">${esc(JSON.stringify(C.requiredFields,null,2))}</textarea>
  </div></details>

  <details class="cfg"><summary>Optional / allowed fields</summary><div class="inner">
    <p class="hint">Fields not required and not listed here raise an "unexpected field" warning. Comma-separated.</p>
    <textarea id="cf_optional" rows="3">${esc(C.optionalFields.join(", "))}</textarea>
  </div></details>

  <details class="cfg"><summary>Formatting</summary><div class="inner">
    <div class="row"><label>Indent spaces</label><input type="text" id="fm_indent" value="${C.formatting.indent}" style="width:60px"></div>
    <div class="row"><label>Value delimiter</label><select id="fm_quote">${opt(["braces","quotes"],C.formatting.quoteStyle)}</select></div>
    <div class="row"><input type="checkbox" id="fm_align" ${C.formatting.alignEquals?"checked":""}><label>Align = signs</label></div>
    <div class="row"><input type="checkbox" id="fm_lct" ${C.formatting.lowercaseType?"checked":""}><label>Lowercase entry types</label></div>
    <div class="row"><input type="checkbox" id="fm_lcf" ${C.formatting.lowercaseFieldNames?"checked":""}><label>Lowercase field names</label></div>
    <div class="row"><input type="checkbox" id="fm_tc" ${C.formatting.trailingComma?"checked":""}><label>Trailing comma</label></div>
    <div class="row"><input type="checkbox" id="fm_ttl" ${C.formatting.titlecaseTitles?"checked":""}><label>Title-Case titles (protected words keep their casing)</label></div>
    <div class="row"><input type="checkbox" id="fm_dblbrace" ${C.formatting.stripDoubleBraces?"checked":""}><label>Strip redundant double braces on import (<code class="k">{{X Y}}</code> → <code class="k">{X Y}</code>)</label></div>
    <div class="row"><input type="checkbox" id="fm_allcaps" ${C.formatting.dropAllCaps?"checked":""}><label>Suggest Title Case for ALL-CAPS titles</label></div>
    <div class="row"><input type="checkbox" id="fm_drop_url_doi" ${C.formatting.dropUrlWhenDoi?"checked":""}><label>Drop <code class="k">url</code> when <code class="k">doi</code> exists</label></div>
    <div class="field" style="margin-top:12px"><label>Field order</label>
      <textarea id="fm_order" rows="2">${esc(C.formatting.fieldOrder.join(", "))}</textarea></div>
    <div class="field"><label>Drop these fields on import/export</label>
      <input type="text" id="fm_drop" value="${attr(C.formatting.dropFields.join(", "))}"></div>
  </div></details>

  <details class="cfg"><summary>Ordering</summary><div class="inner">
    <div class="row"><label>Sort by</label><select id="or_by">${opt(["key","year","author","type","none"],C.ordering.sortBy)}</select></div>
    <div class="row"><label>Direction</label><select id="or_dir">${opt(["asc","desc"],C.ordering.direction)}</select></div>
  </div></details>

  <details class="cfg"><summary>Checks</summary><div class="inner">
    ${chk("fourDigitYear","Year must be 4 digits")}
    ${chk("requirePageRangeDash","Page ranges use -- (en-dash)")}
    ${chk("doiFormat","DOI must be bare (not a URL)")}
    ${chk("monthAbbrev","Month must be an integer from 1 to 12")}
    ${chk("dateToYear","Reduce biblatex date to a plain year")}
    ${chk("detectDuplicateKeys","Detect duplicate keys")}
    ${chk("detectDuplicateDOIs","Detect duplicate DOIs")}
    ${chk("detectDuplicateEntries","Detect duplicate entries (same first author, similar title)")}
    ${chk("warnUnknownFields","Warn on unexpected fields")}
  </div></details>

  <details class="cfg"><summary>Auto-fix</summary><div class="inner">
    <div class="row"><input type="checkbox" id="af_keys" ${C.autofix.renameKeys?"checked":""}><label>Auto-fix may rename citation keys</label></div>
    <div class="row"><input type="checkbox" id="af_doi" ${C.autofix.fixDoi?"checked":""}><label>Auto-fix may add or update DOI fields from verification</label></div>
  </div></details>

  <details class="cfg"><summary>Online verification</summary><div class="inner">
    <p class="hint">Checks title, year, first author and DOI against the databases below, in order — by DOI when present, else by title search.</p>
    <div class="field"><label>Databases</label>
      <div id="vf_sources">
        ${normalizeSourceOrder(C.verification.sourceOrder,C.verification.sources).map(srcRow).join("")}
      </div>
    </div>
    <div class="row" style="align-items:flex-start"><input type="checkbox" id="vf_urls" ${C.verification.checkUrls?"checked":""}><label>Check <code class="k">url</code> links are still alive <span class="muted">— browsers can only detect a dead host/timeout cross-origin, not a live 404 page</span></label></div>
    <div class="row" style="align-items:flex-start"><input type="checkbox" id="vf_pub" ${C.verification.findPublished?"checked":""}><label>Find published version of arXiv / bioRxiv / medRxiv / other preprints <span class="muted">— searches Crossref &amp; OpenAlex for a peer-reviewed version with a DOI</span></label></div>
    <div class="field" style="margin-top:12px"><label>Polite-pool email</label>
      <p class="hint">Sent as <code class="k">mailto=</code> to Crossref &amp; OpenAlex for faster, more reliable access. Recommended.</p>
      <input type="text" id="vf_mailto" value="${attr(C.verification.mailto)}" placeholder="you@university.edu"></div>
    <div class="row"><label>Title-match threshold</label><input type="text" id="vf_sim" value="${C.verification.titleSimThreshold}" style="width:70px"><span class="muted">0–1; below this flags a possible mismatch</span></div>
    <div class="row"><label>Delay between entries (ms)</label><input type="text" id="vf_delay" value="${C.verification.delayMs}" style="width:80px"></div>
    <div class="row"><label>URL timeout (ms)</label><input type="text" id="vf_utimeout" value="${C.verification.urlTimeoutMs}" style="width:80px"></div>
  </div></details>`;

  // segmented control behaviour
  document.querySelectorAll("#ks_mode button").forEach(b=>b.onclick=()=>{
    document.querySelectorAll("#ks_mode button").forEach(x=>x.classList.remove("on"));
    b.classList.add("on");
  });
  document.querySelectorAll("[data-move]").forEach(b=>b.onclick=()=>{
    const row=b.closest(".source-row");
    const box=row&&row.parentElement;
    if(!row||!box) return;
    if(b.dataset.move==="up" && row.previousElementSibling) box.insertBefore(row,row.previousElementSibling);
    if(b.dataset.move==="down" && row.nextElementSibling) box.insertBefore(row.nextElementSibling,row);
  });

  function seg(val,label,cur){return `<button data-v="${val}" class="${cur===val?'on':''}">${label}</button>`;}
  function opt(arr,cur){return arr.map(v=>`<option ${v===cur?'selected':''}>${v}</option>`).join("");}
  function chk(key,label){return `<div class="row"><input type="checkbox" data-ck="${key}" ${C.checks[key]?"checked":""}><label>${label}</label></div>`;}
  function srcRow(key){const on=(C.verification.sources||[]).includes(key), s=SOURCES[key];
    return `<div class="source-row" data-src-row="${key}"><input type="checkbox" data-src="${key}" ${on?"checked":""}>`+
      `<label><b>${s.label}</b> <span class="muted">— ${SOURCE_DESCRIPTIONS[key]||""}</span></label>`+
      `<div class="source-move"><button type="button" data-move="up" title="Move up">↑</button><button type="button" data-move="down" title="Move down">↓</button></div></div>`;}
  function esc(s){return escapeHtml(s);}
  function attr(s){return escapeHtml(s);}
}
function readConfigUI(silent){
  const g=id=>document.getElementById(id);
  const C=CONFIG;
  if(!g("ks_template"))return; // modal not built yet
  const mode=document.querySelector("#ks_mode button.on");
  if(mode)C.keyStyle.mode=mode.dataset.v;
  C.keyStyle.template=g("ks_template").value;
  C.keyStyle.separator=g("ks_sep").value;
  C.keyStyle.case=g("ks_case").value;
  C.keyStyle.stripStopwords=g("ks_stop").checked;
  C.protectedWords=splitList(g("cf_protect").value);
  try{C.requiredFields=JSON.parse(g("cf_required").value);}catch(e){if(!silent)toast("Required-fields JSON invalid — kept old");}
  C.optionalFields=splitList(g("cf_optional").value);
  C.formatting.indent=parseInt(g("fm_indent").value)||DEFAULT_CONFIG.formatting.indent;
  C.formatting.quoteStyle=g("fm_quote").value;
  C.formatting.alignEquals=g("fm_align").checked;
  C.formatting.lowercaseType=g("fm_lct").checked;
  C.formatting.lowercaseFieldNames=g("fm_lcf").checked;
  C.formatting.trailingComma=g("fm_tc").checked;
  C.formatting.titlecaseTitles=g("fm_ttl").checked;
  C.formatting.stripDoubleBraces=g("fm_dblbrace").checked;
  C.formatting.dropAllCaps=g("fm_allcaps").checked;
  C.formatting.dropUrlWhenDoi=g("fm_drop_url_doi").checked;
  C.formatting.fieldOrder=splitList(g("fm_order").value);
  C.formatting.dropFields=splitList(g("fm_drop").value);
  C.ordering.sortBy=g("or_by").value;
  C.ordering.direction=g("or_dir").value;
  document.querySelectorAll("[data-ck]").forEach(cb=>C.checks[cb.dataset.ck]=cb.checked);
  C.autofix.renameKeys=g("af_keys").checked;
  C.autofix.fixDoi=g("af_doi").checked;
  // verification
  C.verification.sourceOrder=[...document.querySelectorAll("[data-src-row]")].map(row=>row.dataset.srcRow).filter(s=>SOURCES[s]);
  C.verification.sources=[...document.querySelectorAll("[data-src]")].filter(cb=>cb.checked).map(cb=>cb.dataset.src);
  C.verification.checkUrls=g("vf_urls").checked;
  C.verification.findPublished=g("vf_pub").checked;
  C.verification.mailto=g("vf_mailto").value.trim();
  const sim=parseFloat(g("vf_sim").value); C.verification.titleSimThreshold=isNaN(sim)?DEFAULT_CONFIG.verification.titleSimThreshold:sim;
  C.verification.delayMs=parseInt(g("vf_delay").value)||DEFAULT_CONFIG.verification.delayMs;
  C.verification.urlTimeoutMs=parseInt(g("vf_utimeout").value)||DEFAULT_CONFIG.verification.urlTimeoutMs;
}
function splitList(s){return s.split(/[,\n]/).map(x=>x.trim()).filter(Boolean);}

/* ---------- 10. misc --------------------------------------- */
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");
  clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove("show"),2200);}
document.addEventListener("keydown",e=>{if(e.key==="Escape")modal.classList.remove("open");});
$("#year").textContent=new Date().getFullYear();   // footer year, always current
