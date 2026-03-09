var DEBUG=false;

function dbg(){if(DEBUG)console.log.apply(console,arguments);}
var currentView='tasks';

var _undoStack = [];
var _redoStack = [];
var MAX_UNDO = 30;// === STATUS MIGRATION: Index-Keys â task.status ===

// === S-1: Event-Bus ===
var Bus = {
  _: {},
  on: function(evt, fn) {
    if (!this._[evt]) this._[evt] = [];
    this._[evt].push(fn);
  },
  off: function(evt, fn) {
    if (!this._[evt]) return;
    this._[evt] = this._[evt].filter(function(f) { return f !== fn; });
  },
  emit: function(evt, data) {
    var fns = this._[evt];
    if (!fns) return;
    for (var i = 0; i < fns.length; i++) {
      try { fns[i](data); } catch(e) { console.warn("[Bus] Error in " + evt + ":", e); }
    }
  }
};
function migrateStatesToTasks(c){
  if(!c||!c.phases)return;
  var migrated=0;
  c.phases.forEach(function(p,pi){
    p.packages.forEach(function(pk,pai){
      pk.tasks.forEach(function(t,ti){
        if(!t.status||t.status===""){
          var key=pi+"-"+pai+"-"+ti;
          if(c.states&&c.states[key]){
            t.status=c.states[key];
            migrated++;
          } else {
            t.status="Offen";
          }
        }
      });
    });
  });
  if(migrated>0)dbg("Migrated "+migrated+" task statuses from states to task.status");
}
function getTaskStatus(c,pi,pai,ti){
if(typeof pi==="string"){var _pi=resolvePhaseIdx(c,pi);var _pai=resolvePkgIdx(c.phases[_pi],pai);ti=resolveTaskIdx(c.phases[_pi].packages[_pai],ti);pai=_pai;pi=_pi;}
  var t=c.phases[pi].packages[pai].tasks[ti];
  if(t&&t.status)return t.status;
  var key=pi+"-"+pai+"-"+ti;
  return (c.states&&c.states[key])||"Offen";
}
function setTaskStatus(c,pi,pai,ti,val){
if(typeof pi==="string"){var _pi=resolvePhaseIdx(c,pi);var _pai=resolvePkgIdx(c.phases[_pi],pai);ti=resolveTaskIdx(c.phases[_pi].packages[_pai],ti);pai=_pai;pi=_pi;}
  c.phases[pi].packages[pai].tasks[ti].status=val;
}



// ============================================================
// SUPABASE CONFIG
// ============================================================
const SUPABASE_URL = 'https://pezpisgwkemvdclnhdsw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlenBpc2d3a2VtdmRjbG5oZHN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMDE0MTAsImV4cCI6MjA4NzY3NzQxMH0.wzMrpKGri1ueWVOOhBYZPUxut8-s13vBrPpNUAywM9U';
let sbClient = null;
let isOnline = true;
let syncInProgress = false;
let lastRemoteUpdate = null;
var lastKnownRemote = null; try{lastKnownRemote=JSON.parse(localStorage.getItem("lr3_baseline"));}catch(ebl){} // S-2: Baseline for conflict detection

// Initialize Supabase
try {
  sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  dbg('[LaunchRamp] Supabase connected');
} catch(e) {
  console.warn('[LaunchRamp] Supabase init failed, using localStorage only:', e);
  isOnline = false;
}

// ============================================================
// DATA
// ============================================================
var DEFAULT_PHASES = [
{id:'P1',name:'PHASE 1: ONBOARDING & SETUP',color:'#2563eb',startDate:'',endDate:'',packages:[
{name:'Discovery & Verträge',tasks:[
{t:'Kennenlerngespräch',owner:'Mitch',ki:true,vor:'Lead qualifiziert',auto:'Niedrig',min:45},
{t:'Roadmap/Proposal erstellen + präsentieren',owner:'Mitch',ki:false,vor:'Kennenlerngespräch',auto:'Hoch',min:60},
{t:'Strategiegespräch (Deep Dive)',owner:'Mitch',ki:true,vor:'Proposal angenommen',auto:'Niedrig',min:90},
{t:'Vertrag + Rechnung + Payment',owner:'Mitch',ki:false,vor:'Zusage',auto:'Hoch',min:20},
]},
{name:'Technischer Kick-off',tasks:[
{t:'Internes Setup: Channels, Ordner, Board',owner:'Max',ki:false,vor:'Vertrag',auto:'Voll',min:15},
{t:'Zugänge erhalten (Domain, Hosting, Socials, Ads, Tools)',owner:'Max',ki:true,vor:'Kick-off',auto:'Mittel',min:30},
{t:'CI Assets erhalten + geprüft',owner:'Hussein',ki:true,vor:'Kick-off',auto:'Mittel',min:20},
{t:'Bestehende Kanäle + Analytics Audit',owner:'Max',ki:false,vor:'Zugänge',auto:'Mittel',min:30},
]}]},
{id:'P2',name:'PHASE 2: STRATEGIE & POSITIONIERUNG',color:'#059669',startDate:'',endDate:'',packages:[
{name:'Research & Analyse',tasks:[
{t:'Zielgruppen-Research (Interviews, Daten)',owner:'Mitch',ki:true,vor:'Strategiegespräch',auto:'Hoch',min:120},
{t:'Wettbewerber-Analyse (3-5 Competitors)',owner:'Mitch',ki:false,vor:'Zielgruppe definiert',auto:'Hoch',min:60},
{t:'Markt-/Nischen-Analyse + Differenzierung',owner:'Mitch',ki:false,vor:'Research',auto:'Hoch',min:45},
]},
{name:'Positionierung & Angebot',tasks:[
{t:'Positionierung finalisieren (USP, Messaging)',owner:'Mitch',ki:true,vor:'Research',auto:'Hoch',min:60},
{t:'Angebot / Produkttreppe strukturieren',owner:'Mitch',ki:true,vor:'Positionierung',auto:'Hoch',min:60},
{t:'Pricing + Angebotsseite Konzept',owner:'Mitch',ki:false,vor:'Angebot',auto:'Hoch',min:30},
{t:'Positionierung + Angebot Kunden-Freigabe',owner:'Mitch',ki:true,vor:'Alles ready',auto:'Niedrig',min:30},
]}]},
{id:'P3',name:'PHASE 3: CLAUDE FIRST DRAFTS (BATCH)',color:'#d97706',startDate:'',endDate:'',packages:[
{name:'Landing Page & Angebotsseite',tasks:[
{t:'Landing Page Copy â Claude First Draft',owner:'Mitch',ki:false,vor:'Positionierung + ICP',auto:'Hoch',min:45},
{t:'Angebotsseite Copy â Claude First Draft',owner:'Mitch',ki:false,vor:'Produkttreppe',auto:'Hoch',min:45},
{t:'Thank-You-Page Copy â Claude First Draft',owner:'Mitch',ki:false,vor:'LP-Konzept',auto:'Hoch',min:15},
]},
{name:'E-Mail & Automation',tasks:[
{t:'Willkommens-Sequenz (5-7 Mails) â Claude Draft',owner:'Max',ki:false,vor:'Angebot + Tonalität',auto:'Hoch',min:60},
{t:'Webinar-Reminder Mails â Claude Draft',owner:'Max',ki:false,vor:'Webinar-Konzept',auto:'Hoch',min:30},
{t:'Follow-Up Sequenz â Claude Draft',owner:'Max',ki:false,vor:'Webinar-Flow',auto:'Hoch',min:30},
{t:'WhatsApp Templates â Claude Draft',owner:'Max',ki:false,vor:'Touchpoints',auto:'Hoch',min:15},
]},
{name:'Ads & Social Copy',tasks:[
{t:'Ad Copy Varianten (5-10 Hooks) â Claude Draft',owner:'Mitch',ki:false,vor:'ICP + Positionierung',auto:'Hoch',min:45},
{t:'LinkedIn Posts (10-15) â Claude Draft',owner:'Mitch',ki:false,vor:'Tonalität + Themen',auto:'Hoch',min:60},
{t:'Social Media Captions â Claude Draft',owner:'Tobie',ki:false,vor:'Content-Strategie',auto:'Hoch',min:30},
]},
{name:'VSL & Webinar',tasks:[
{t:'VSL Skript â Claude Draft',owner:'Mitch',ki:false,vor:'Angebot + ICP',auto:'Hoch',min:45},
{t:'Webinar Outline â Claude Draft',owner:'Mitch',ki:false,vor:'Konzept-Call',auto:'Hoch',min:30},
{t:'Umfrage Fragen â Claude Draft',owner:'Mitch',ki:false,vor:'Zielgruppe',auto:'Hoch',min:15},
]}]},
{id:'P4',name:'PHASE 4: DESIGN & BUILD',color:'#dc2626',startDate:'',endDate:'',packages:[
{name:'Design',tasks:[
{t:'Landing Page Design (Mobile + Desktop)',owner:'Hussein',ki:false,vor:'LP Copy',auto:'Niedrig',min:240},
{t:'Angebotsseite Design',owner:'Hussein',ki:false,vor:'Copy',auto:'Niedrig',min:180},
{t:'Thank-You-Page Design',owner:'Hussein',ki:false,vor:'Copy',auto:'Niedrig',min:60},
{t:'E-Mail Template Design',owner:'Hussein',ki:false,vor:'CI',auto:'Mittel',min:120},
{t:'Ad Creatives (3-5 Varianten)',owner:'Hussein',ki:false,vor:'Ad Copy + CI',auto:'Niedrig',min:180},
{t:'Social Media Templates',owner:'Hussein',ki:false,vor:'Brand Guide',auto:'Mittel',min:120},
]},
{name:'Entwicklung',tasks:[
{t:'Landing Page entwickeln + testen',owner:'Max',ki:false,vor:'Design approved',auto:'Mittel',min:180},
{t:'Angebotsseite entwickeln',owner:'Max',ki:false,vor:'Design',auto:'Mittel',min:120},
{t:'Thank-You-Page entwickeln',owner:'Max',ki:false,vor:'Design',auto:'Mittel',min:45},
{t:'Formulare + Tracking einbauen',owner:'Max',ki:false,vor:'Pages',auto:'Mittel',min:60},
{t:'Cookie-Banner + Rechtliches',owner:'Max',ki:false,vor:'Domain',auto:'Mittel',min:30},
]},
{name:'Automationen',tasks:[
{t:'E-Mail Tool + Templates bauen',owner:'Max',ki:false,vor:'Designs',auto:'Mittel',min:90},
{t:'Automationsflows aufsetzen',owner:'Max',ki:false,vor:'Mails',auto:'Mittel',min:120},
{t:'CRM / Pipeline einrichten',owner:'Max',ki:false,vor:'Sales-Flow',auto:'Mittel',min:60},
{t:'Tracking Setup (Analytics, Pixel, UTM)',owner:'Max',ki:false,vor:'Pages + Ads',auto:'Mittel',min:60},
{t:'Kalender-Booking einrichten',owner:'Max',ki:false,vor:'CRM',auto:'Hoch',min:30},
]}]},
{id:'P5',name:'PHASE 5: WEBINAR & ADS',color:'#7c3aed',startDate:'',endDate:'',packages:[
{name:'Webinar',tasks:[
{t:'Webinar Skript komplett',owner:'Mitch',ki:false,vor:'Konzept-Call',auto:'Hoch',min:90},
{t:'Webinar Slides erstellen + designen',owner:'Hussein',ki:false,vor:'Skript',auto:'Mittel',min:225},
{t:'Slides Kunden-Freigabe',owner:'Mitch',ki:true,vor:'Slides',auto:'Niedrig',min:60},
{t:'Webinar-Tool + Technik einrichten',owner:'Max',ki:false,vor:'Tool-Zugang',auto:'Mittel',min:45},
{t:'Technik End-to-End testen',owner:'Max',ki:false,vor:'Setup',auto:'Manuell',min:30},
]},
{name:'Pitch-Training',tasks:[
{t:'Pitch-Training + Einwand-Handling',owner:'Mitch',ki:true,vor:'Slides final',auto:'Manuell',min:90},
{t:'Feedback einarbeiten',owner:'Mitch',ki:false,vor:'Training',auto:'Niedrig',min:30},
]},
{name:'Ads',tasks:[
{t:'Ad Accounts + Zielgruppen einrichten',owner:'Max',ki:false,vor:'Zugänge + ICP',auto:'Mittel',min:45},
{t:'Kampagnen aufsetzen',owner:'Max',ki:false,vor:'Creatives + Tracking',auto:'Mittel',min:60},
{t:'Kampagnen Kunden-Freigabe',owner:'Mitch',ki:true,vor:'Setup',auto:'Niedrig',min:20},
]}]},
{id:'P6',name:'PHASE 6: SOCIAL MEDIA',color:'#db2777',startDate:'',endDate:'',packages:[
{name:'Content-Strategie',tasks:[
{t:'Content-Strategie-Call',owner:'Mitch',ki:true,vor:'Positionierung',auto:'Niedrig',min:60},
{t:'Themen-Cluster + Kalender',owner:'Tobie',ki:false,vor:'Strategie-Call',auto:'Hoch',min:60},
]},
{name:'LinkedIn',tasks:[
{t:'LinkedIn Profil optimieren',owner:'Tobie',ki:true,vor:'Content-Strategie + CI',auto:'Mittel',min:60},
{t:'Posts finalisieren + planen',owner:'Tobie',ki:false,vor:'Posts freigegeben',auto:'Hoch',min:60},
{t:'LinkedIn Event + Banner',owner:'Tobie',ki:false,vor:'Webinar-Daten',auto:'Mittel',min:20},
]},
{name:'Instagram (Optional)',tasks:[
{t:'Instagram Profil optimieren',owner:'Tobie',ki:true,vor:'Content-Strategie',auto:'Mittel',min:30,opt:true},
{t:'Reels erstellen (5-7 Hooks)',owner:'Tobie',ki:true,vor:'Content-Strategie',auto:'Mittel',min:180,opt:true},
{t:'Carousel Posts (3 Stück)',owner:'Hussein',ki:false,vor:'CI',auto:'Mittel',min:90,opt:true},
]}]},
{id:'P7',name:'PHASE 7: LAUNCH',color:'#dc2626',startDate:'',endDate:'',packages:[
{name:'Pre-Launch',tasks:[
{t:'End-to-End Test aller Systeme',owner:'Max',ki:false,vor:'Alles aufgesetzt',auto:'Manuell',min:60},
{t:'Pages live schalten',owner:'Max',ki:false,vor:'E2E Test',auto:'Niedrig',min:15},
{t:'Generalprobe + GO/NO-GO',owner:'Mitch',ki:true,vor:'Technik ready',auto:'Manuell',min:120},
]},
{name:'Go-Live',tasks:[
{t:'Kampagnen aktivieren',owner:'Max',ki:false,vor:'Freigabe',auto:'Niedrig',min:15},
{t:'Performance Monitoring (Tag 1-3)',owner:'Max',ki:false,vor:'Kampagnen live',auto:'Mittel',min:15},
{t:'WEBINAR LIVE',owner:'Team',ki:false,vor:'Alles ready',auto:'Manuell',min:90},
{t:'Debrief-Call',owner:'Mitch',ki:true,vor:'Webinar',auto:'Manuell',min:30},
]},
{name:'After Sales',tasks:[
{t:'Replay + Follow-Up aktivieren',owner:'Max',ki:false,vor:'Webinar',auto:'Voll',min:15},
{t:'Sales Calls tracken + Coaching',owner:'Mitch',ki:true,vor:'Calls gebucht',auto:'Niedrig',min:60},
]}]},
{id:'P8',name:'PHASE 8: REVIEW & SCALE',color:'#6366f1',startDate:'',endDate:'',packages:[
{name:'Review',tasks:[
{t:'KPIs dokumentieren + Review-Call',owner:'Mitch',ki:true,vor:'Launch done',auto:'Mittel',min:60},
{t:'Learnings dokumentieren (Retro)',owner:'Team',ki:false,vor:'Review',auto:'Niedrig',min:30},
{t:'Testimonial + Case Study',owner:'Mitch',ki:true,vor:'Ergebnisse positiv',auto:'Hoch',min:30},
{t:'Weiterarbeit besprechen',owner:'Mitch',ki:true,vor:'Review',auto:'Manuell',min:30},
]}]}
];

function defaultPhases(){return JSON.parse(JSON.stringify(DEFAULT_PHASES));}

const DOCS=[
  {id:'positionierung',icon:'ð¯',name:'Positionierung',desc:'USP, Messaging, Tonalität',int:false},
  {id:'angebot',icon:'ð',name:'Angebot',desc:'Offer + Pricing',int:false},
  {id:'zielgruppe',icon:'ð¤',name:'Zielgruppe',desc:'ICP, Personas',int:false},
  {id:'ci',icon:'ð¨',name:'CI / Brand',desc:'Logo, Farben, Fonts',int:false},
  {id:'roadmap',icon:'ðºï¸',name:'Roadmap',desc:'Kunden-Fahrplan',int:false},
  {id:'tracking',icon:'ð',name:'Tracking',desc:'KPIs, Metriken',int:false},
  {id:'gdrive',icon:'ð',name:'Google Drive',desc:'Alle Dateien',int:false},
  {id:'gchat',icon:'ð¬',name:'Google Chat',desc:'Team-Kommunikation',int:false},
  {id:'vault',icon:'ð',name:'Vault',desc:'Passwörter & Zugänge',int:false},
  {id:'claude',icon:'ð¤',name:'Claude Projekt',desc:'Chat & Transkripte',int:true},
  {id:'prompts',icon:'ð',name:'Prompts',desc:'Prompt Library',int:true},
  {id:'sops',icon:'ð¬',name:'SOPs',desc:'Video-Anleitungen',int:true},
];

// ============================================================
// STATE
// ============================================================
let DB={clients:[],activeClient:null,activeProject:null};
let isCV=false, curView='tasks';
let dashboardActive=false;
// Track open/closed state for phases and packages
let openPhases=new Set();
let openPackages=new Set();
// Track expanded clients in sidebar
let expandedClients=new Set();

// Retainer categories
const RETAINER_CATEGORIES=[
  {id:'linkedin',name:'LinkedIn',icon:'ð¼',phases:[{name:'LinkedIn Content',packages:[{name:'LinkedIn Management',tasks:[
    {t:'Content-Strategie & Themenplanung',owner:'Mitch',ki:true,vor:'-',auto:'Hoch',min:60},
    {t:'Posts schreiben (8-12/Monat)',owner:'Tobie',ki:false,vor:'Themenplan',auto:'Hoch',min:120},
    {t:'Profil-Optimierung & Updates',owner:'Tobie',ki:true,vor:'-',auto:'Mittel',min:30},
    {t:'Community Management & Engagement',owner:'Tobie',ki:false,vor:'Posts live',auto:'Mittel',min:60},
    {t:'Performance Report',owner:'Tobie',ki:false,vor:'Monatsende',auto:'Hoch',min:30}
  ]}]}]},
  {id:'instagram',name:'Instagram',icon:'ð¸',phases:[{name:'Instagram Content',packages:[{name:'Instagram Management',tasks:[
    {t:'Content-Strategie & Redaktionsplan',owner:'Tobie',ki:true,vor:'-',auto:'Hoch',min:60},
    {t:'Posts & Reels erstellen (8-12/Monat)',owner:'Tobie',ki:false,vor:'Redaktionsplan',auto:'Mittel',min:180},
    {t:'Stories & Community Management',owner:'Tobie',ki:false,vor:'Content live',auto:'Mittel',min:60},
    {t:'Performance Report',owner:'Tobie',ki:false,vor:'Monatsende',auto:'Hoch',min:30}
  ]}]}]},
  {id:'newsletter',name:'Newsletter',icon:'ð§',phases:[{name:'Newsletter',packages:[{name:'E-Mail Marketing',tasks:[
    {t:'Newsletter-Thema & Outline',owner:'Mitch',ki:true,vor:'-',auto:'Hoch',min:30},
    {t:'Newsletter schreiben (2-4/Monat)',owner:'Max',ki:false,vor:'Outline',auto:'Hoch',min:90},
    {t:'Design & Template',owner:'Hussein',ki:false,vor:'Text',auto:'Mittel',min:45},
    {t:'Versand & A/B-Test',owner:'Max',ki:false,vor:'Design',auto:'Mittel',min:20},
    {t:'Performance Report',owner:'Max',ki:false,vor:'Versand',auto:'Hoch',min:15}
  ]}]}]},
  {id:'blog',name:'Blog / SEO',icon:'âï¸',phases:[{name:'Blog & SEO',packages:[{name:'Content & SEO',tasks:[
    {t:'Keyword-Research & Themenplan',owner:'Mitch',ki:true,vor:'-',auto:'Hoch',min:60},
    {t:'Blog-Artikel schreiben (2-4/Monat)',owner:'Max',ki:false,vor:'Keywords',auto:'Hoch',min:120},
    {t:'On-Page SEO Optimierung',owner:'Max',ki:false,vor:'Artikel',auto:'Hoch',min:30},
    {t:'Interne Verlinkung & Updates',owner:'Max',ki:false,vor:'Artikel',auto:'Mittel',min:20},
    {t:'Ranking-Report',owner:'Max',ki:false,vor:'Monatsende',auto:'Hoch',min:15}
  ]}]}]},
  {id:'ads',name:'Ads Management',icon:'ð£',phases:[{name:'Ads',packages:[{name:'Paid Advertising',tasks:[
    {t:'Kampagnen-Review & Optimierung',owner:'Max',ki:false,vor:'-',auto:'Mittel',min:60},
    {t:'Neue Creatives & Copy',owner:'Hussein',ki:false,vor:'Performance-Daten',auto:'Mittel',min:90},
    {t:'Zielgruppen-Tests',owner:'Max',ki:false,vor:'Creatives',auto:'Mittel',min:30},
    {t:'Budget-Optimierung',owner:'Max',ki:false,vor:'Daten',auto:'Mittel',min:20},
    {t:'Performance Report + ROAS',owner:'Max',ki:false,vor:'Monatsende',auto:'Hoch',min:30}
  ]}]}]},
  {id:'seo',name:'Homepage SEO',icon:'ð',phases:[{name:'SEO',packages:[{name:'SEO Optimierung',tasks:[
    {t:'Technisches SEO Audit',owner:'Max',ki:false,vor:'-',auto:'Hoch',min:60},
    {t:'Meta-Tags & Snippets optimieren',owner:'Max',ki:false,vor:'Audit',auto:'Hoch',min:45},
    {t:'Page Speed Optimierung',owner:'Max',ki:false,vor:'Audit',auto:'Mittel',min:60},
    {t:'Content-Gaps identifizieren',owner:'Mitch',ki:true,vor:'Audit',auto:'Hoch',min:30},
    {t:'Monatlicher SEO Report',owner:'Max',ki:false,vor:'Monatsende',auto:'Hoch',min:20}
  ]}]}]},
  {id:'youtube',name:'YouTube',icon:'ð¬',phases:[{name:'YouTube',packages:[{name:'YouTube Management',tasks:[
    {t:'Video-Strategie & Themenplan',owner:'Mitch',ki:true,vor:'-',auto:'Hoch',min:60},
    {t:'Skript schreiben (2-4/Monat)',owner:'Mitch',ki:false,vor:'Themenplan',auto:'Hoch',min:90},
    {t:'Video-Produktion & Editing',owner:'Hussein',ki:false,vor:'Skript',auto:'Niedrig',min:240},
    {t:'Thumbnail & SEO',owner:'Hussein',ki:false,vor:'Video',auto:'Mittel',min:30},
    {t:'Upload & Promotion',owner:'Tobie',ki:false,vor:'Video final',auto:'Mittel',min:20}
  ]}]}]},
  {id:'tiktok',name:'TikTok',icon:'ðµ',phases:[{name:'TikTok',packages:[{name:'TikTok Management',tasks:[
    {t:'Content-Strategie & Hooks',owner:'Tobie',ki:true,vor:'-',auto:'Hoch',min:45},
    {t:'Videos produzieren (8-15/Monat)',owner:'Tobie',ki:false,vor:'Strategie',auto:'Mittel',min:180},
    {t:'Posting & Hashtag-Strategie',owner:'Tobie',ki:false,vor:'Videos',auto:'Mittel',min:30},
    {t:'Trend-Monitoring & Reaktionen',owner:'Tobie',ki:false,vor:'-',auto:'Mittel',min:30},
    {t:'Performance Report',owner:'Tobie',ki:false,vor:'Monatsende',auto:'Hoch',min:15}
  ]}]}]},
  {id:'coaching',name:'Coaching & Beratung',icon:'ð§ ',phases:[{name:'Beratung',packages:[{name:'Coaching & Support',tasks:[
    {t:'Strategie-Call (monatlich)',owner:'Mitch',ki:true,vor:'-',auto:'Niedrig',min:60},
    {t:'Ad-hoc Beratung & Support',owner:'Mitch',ki:true,vor:'-',auto:'Niedrig',min:60},
    {t:'Monats-Review & Planung nächster Monat',owner:'Mitch',ki:true,vor:'Monatsende',auto:'Niedrig',min:45}
  ]}]}]}
];

function deepClone(obj){ return JSON.parse(JSON.stringify(obj)); }

function mergeStates(localStates, remoteStates, baseStates){
  // Merge task states key-by-key. Both local and remote changes win over base.
  // If both changed same key differently, remote wins.
  const merged = Object.assign({}, baseStates);
  // Apply remote changes
  Object.keys(remoteStates).forEach(k => { merged[k] = remoteStates[k]; });
  // Apply local changes (only if local changed from base AND remote didn't also change it)
  Object.keys(localStates).forEach(k => {
    const localChanged = localStates[k] !== (baseStates[k] || '');
    const remoteChanged = remoteStates[k] !== (baseStates[k] || '');
    if(localChanged && !remoteChanged) merged[k] = localStates[k];
    // If both changed: remote already wins from above
  });
  return merged;
}

function mergeClients(localClients, remoteClients, baseClients){
  // Build maps by client ID
  const baseMap = {};  (baseClients||[]).forEach(c => baseMap[c.id] = c);
  const localMap = {}; (localClients||[]).forEach(c => localMap[c.id] = c);
  const remoteMap = {};(remoteClients||[]).forEach(c => remoteMap[c.id] = c);
  const allIds = new Set([...Object.keys(localMap), ...Object.keys(remoteMap)]);
  const merged = [];

  allIds.forEach(id => {
    const base = baseMap[id];
    const local = localMap[id];
    const remote = remoteMap[id];

    if(!local && remote && base){
      // Local deleted this client, remote still has it -> respect local delete
      return;
    }
    if(local && !remote && base){
      // Remote deleted this client -> respect remote delete
      return;
    }
    if(local && !remote && !base){
      // New local client -> keep
      merged.push(deepClone(local));
      return;
    }
    if(!local && remote && !base){
      // New remote client -> keep
      merged.push(deepClone(remote));
      return;
    }
    if(!local && !remote) return;

    // Both have this client -> merge projects
    const mergedClient = deepClone(remote || local);
    if(local && remote){
      mergedClient.projects = mergeProjects(
        local.projects || [],
        remote.projects || [],
        base ? base.projects || [] : []
      );
      // Keep remote name if changed, else local
      if(base && local.name !== base.name && remote.name === base.name) mergedClient.name = local.name;
    }
    merged.push(mergedClient);
  });

  return merged;
}

function mergeProjects(localProjects, remoteProjects, baseProjects){
  const baseMap = {};  (baseProjects||[]).forEach(p => baseMap[p.id] = p);
  const localMap = {}; (localProjects||[]).forEach(p => localMap[p.id] = p);
  const remoteMap = {};(remoteProjects||[]).forEach(p => remoteMap[p.id] = p);
  const allIds = new Set([...Object.keys(localMap), ...Object.keys(remoteMap)]);
  const merged = [];

  allIds.forEach(id => {
    const base = baseMap[id];
    const local = localMap[id];
    const remote = remoteMap[id];

    if(!local && remote && base) return; // local deleted
    if(local && !remote && base) return; // remote deleted
    if(local && !remote && !base){ merged.push(deepClone(local)); return; } // new local
    if(!local && remote && !base){ merged.push(deepClone(remote)); return; } // new remote
    if(!local && !remote) return;

    // Both have project -> merge states and timeLog
    const mergedProj = deepClone(remote);
    if(local && remote && base){
      // Merge states (most important!)
      mergedProj.states = mergeStates(local.states||{}, remote.states||{}, base.states||{});
    // S-2: Deep-merge phases/packages/tasks
    mergedProj.phases = mergePhases(local.phases||[], remote.phases||[], base.phases||[]);
      // Merge timeLog (append unique entries)
      const remoteLogSet = new Set((remote.timeLog||[]).map(e => e.start));
      const baseLogSet = new Set((base.timeLog||[]).map(e => e.start));
      (local.timeLog||[]).forEach(entry => {
        if(!remoteLogSet.has(entry.start) && !baseLogSet.has(entry.start)){
          mergedProj.timeLog.push(entry); // new local entry
        }
      });
      // Merge quickLinks
      if(local.quickLinks && base.quickLinks){
        Object.keys(local.quickLinks).forEach(k => {
          if(local.quickLinks[k] !== (base.quickLinks[k]||'') && remote.quickLinks[k] === (base.quickLinks[k]||'')){
            mergedProj.quickLinks[k] = local.quickLinks[k];
          }
        });
      }
      // Merge docLinks
      if(local.docLinks && base.docLinks){
        Object.keys(local.docLinks).forEach(k => {
          if(local.docLinks[k] !== (base.docLinks[k]||'') && (remote.docLinks||{})[k] === (base.docLinks[k]||'')){
            if(!mergedProj.docLinks) mergedProj.docLinks = {};
            mergedProj.docLinks[k] = local.docLinks[k];
          }
        });
      }
      // Keep local project name if locally changed
      if(local.name !== base.name && remote.name === base.name) mergedProj.name = local.name;
      // Keep local dates if locally changed
      if(local.startDate !== base.startDate && remote.startDate === base.startDate) mergedProj.startDate = local.startDate;
      if(local.launchDate !== base.launchDate && remote.launchDate === base.launchDate) mergedProj.launchDate = local.launchDate;
      // Keep local completed if locally changed
      if(local.completed !== base.completed && remote.completed === base.completed) mergedProj.completed = local.completed;
    } else if(local && remote){
      // No base - remote wins but keep local states
      mergedProj.states = Object.assign({}, remote.states||{}, local.states||{});
    mergedProj.phases = mergePhases(local.phases||[], remote.phases||[], []);
    }
    merged.push(mergedProj);
  });

  return merged;
}

// === S-2: Deep-Merge für Phases/Packages/Tasks ===
function mergePhases(localPhases, remotePhases, basePhases){
  var baseMap = {}; (basePhases||[]).forEach(function(p){ baseMap[p._id] = p; });
  var localMap = {}; (localPhases||[]).forEach(function(p){ localMap[p._id] = p; });
  var remoteMap = {};(remotePhases||[]).forEach(function(p){ remoteMap[p._id] = p; });
  var seen = {}; var allIds = [];
  (localPhases||[]).concat(remotePhases||[]).forEach(function(p){ if(!seen[p._id]){ seen[p._id]=true; allIds.push(p._id); }});
  var merged = [];
  allIds.forEach(function(id){
    var base = baseMap[id]; var local = localMap[id]; var remote = remoteMap[id];
    if(!local && remote && base) return;
    if(local && !remote && base) return;
    if(local && !remote && !base){ merged.push(deepClone(local)); return; }
    if(!local && remote && !base){ merged.push(deepClone(remote)); return; }
    if(local && !remote) return;
    var mp = deepClone(remote);
    if(local && remote && base){
      mp.packages = mergePackages(local.packages||[], remote.packages||[], base.packages||[]);
      if(local.name !== base.name && remote.name === base.name) mp.name = local.name;
    } else if(local && remote){
      mp.packages = mergePackages(local.packages||[], remote.packages||[], []);
    }
    merged.push(mp);
  });
  return merged;
}

function mergePackages(localPkgs, remotePkgs, basePkgs){
  var baseMap = {}; (basePkgs||[]).forEach(function(p){ baseMap[p._id] = p; });
  var localMap = {}; (localPkgs||[]).forEach(function(p){ localMap[p._id] = p; });
  var remoteMap = {};(remotePkgs||[]).forEach(function(p){ remoteMap[p._id] = p; });
  var seen = {}; var allIds = [];
  (localPkgs||[]).concat(remotePkgs||[]).forEach(function(p){ if(!seen[p._id]){ seen[p._id]=true; allIds.push(p._id); }});
  var merged = [];
  allIds.forEach(function(id){
    var base = baseMap[id]; var local = localMap[id]; var remote = remoteMap[id];
    if(!local && remote && base) return;
    if(local && !remote && base) return;
    if(local && !remote && !base){ merged.push(deepClone(local)); return; }
    if(!local && remote && !base){ merged.push(deepClone(remote)); return; }
    if(local && !remote) return;
    var mp = deepClone(remote);
    if(local && remote && base){
      mp.tasks = mergeTasks(local.tasks||[], remote.tasks||[], base.tasks||[]);
      if(local.name !== base.name && remote.name === base.name) mp.name = local.name;
    } else if(local && remote){
      mp.tasks = mergeTasks(local.tasks||[], remote.tasks||[], []);
    }
    merged.push(mp);
  });
  return merged;
}

function mergeTasks(localTasks, remoteTasks, baseTasks){
  var baseMap = {}; (baseTasks||[]).forEach(function(t){ baseMap[t._id] = t; });
  var localMap = {}; (localTasks||[]).forEach(function(t){ localMap[t._id] = t; });
  var remoteMap = {};(remoteTasks||[]).forEach(function(t){ remoteMap[t._id] = t; });
  var seen = {}; var allIds = [];
  (localTasks||[]).concat(remoteTasks||[]).forEach(function(t){ if(!seen[t._id]){ seen[t._id]=true; allIds.push(t._id); }});
  var merged = [];
  allIds.forEach(function(id){
    var base = baseMap[id]; var local = localMap[id]; var remote = remoteMap[id];
    if(!local && remote && base) return;
    if(local && !remote && base) return;
    if(local && !remote && !base){ merged.push(deepClone(local)); return; }
    if(!local && remote && !base){ merged.push(deepClone(remote)); return; }
    if(local && !remote) return;
    var mt = deepClone(remote);
    if(local && remote && base){
      var fields = ["status","owner","t","links","min","vor","auto","ki"];
      for(var fi=0; fi<fields.length; fi++){
        var f = fields[fi];
        if(local[f] !== (base[f]||"") && remote[f] === (base[f]||"")){
          mt[f] = local[f];
        }
      }
    } else if(local && remote){
      var fields2 = ["status","owner","t","links","min","vor","auto","ki"];
      for(var fi2=0; fi2<fields2.length; fi2++){
        var f2 = fields2[fi2];
        if(local[f2] && !remote[f2]) mt[f2] = local[f2];
      }
    }
    merged.push(mt);
  });
  return merged;
}


// ---------- REPAIR CORRUPT PHASES (Migration M-2) ----------
function repairCorruptPhases(){
  DB.clients.forEach(function(c){
    if(!c.projects) return;
    c.projects.forEach(function(proj){
      if(proj.type && proj.type !== "retainer" && proj.type !== "empty" && proj.phases && proj.phases.length < 8){
        dbg("[M-2] Repairing corrupt phases for project: " + proj.name + " (had " + proj.phases.length + " phases)");
        proj.phases = defaultPhases();
        proj.phases.forEach(function(ph){
          if(!ph._id) ph._id = "ph_" + Math.random().toString(36).substring(2,10);
          ph.packages.forEach(function(pk){
            if(!pk._id) pk._id = "pkg_" + Math.random().toString(36).substring(2,10);
            pk.tasks.forEach(function(t){
              if(!t._id) t._id = "t_" + Math.random().toString(36).substring(2,10);
            });
          });
        });
        dbg("[M-2b] Generated _id for all phases/packages/tasks in: " + proj.name);
      }
    });
  });
}

// ---------- SYNC HELPERS (Phase 2.1) ----------
function applyRemoteData(remoteData){
  DB.clients=remoteData.clients||[];
  DB.activeClient=remoteData.activeClient||null;
  DB.activeProject=remoteData.activeProject||null;
  // Run migrations on remote data
  DB.clients.forEach(function(c){
    if(!c.projects)c.projects=[];
    c.projects.forEach(function(proj){
      if(!proj.startDate)proj.startDate=proj.phases[0]?.startDate||new Date().toISOString().split('T')[0];
      if(!proj.quickLinks)proj.quickLinks={homepage:'',instagram:'',linkedin:'',gdrive:'',claude:''};
      if(!proj.jourfix)proj.jourfix={};
      if(!proj.timeLog)proj.timeLog=[];
      if(!proj.activeTimer)proj.activeTimer=null;
      if(proj.completed===undefined)proj.completed=false;
      proj.phases.forEach(function(p){if(!p.startDate)p.startDate='';if(!p.endDate)p.endDate='';});
    });
  });
  if(!DB.clients.length){var c=mkClientWithProject('Beispiel-Kunde','launch');DB.clients.push(c);DB.activeClient=c.id;DB.activeProject=c.projects[0].id;}
  DB.clients.forEach(function(c){c.projects.forEach(function(proj){migrateStatesToTasks(proj);});});
  repairCorruptPhases();
  localStorage.setItem('lr3',JSON.stringify(DB));
}

function finalizeSyncLoad(){
  lastKnownRemote=deepClone({clients:DB.clients,activeClient:DB.activeClient,activeProject:DB.activeProject});
  try{localStorage.setItem('lr3_baseline',JSON.stringify(lastKnownRemote));}catch(ebl){}
  isOnline=true;
  updateSyncStatus('synced');
  if(DB.activeClient)expandedClients.add(DB.activeClient);
  renderAll();
  setupRealtimeSubscription();
  setupActivitySubscription();
  ensureActor();
}

function showSyncConflictModal(localData,remoteData){
  var m=document.createElement('div');m.className='modal-overlay';m.id='syncConflictOverlay';
  m.innerHTML='<div class="modal" style="max-width:460px">'
    +'<h3 style="margin:0 0 2px">\u26A0\uFE0F Sync-Konflikt erkannt</h3>'
    +'<div class="modal-subtitle">Lokale und Cloud-Daten haben sich beide ge\u00E4ndert seit deinem letzten Besuch.</div>'
    +'<div style="display:flex;flex-direction:column;gap:10px;margin-top:16px">'
    +'<button class="btn-primary" onclick="handleSyncConflict(\'remote\')" style="justify-content:flex-start;gap:8px">\u2601\uFE0F Cloud-Version \u00FCbernehmen</button>'
    +'<button class="btn-primary" onclick="handleSyncConflict(\'local\')" style="justify-content:flex-start;gap:8px;background:var(--accent2,#6c5ce7)">\uD83D\uDCBE Lokale Version behalten</button>'
    +'<button class="btn-primary" onclick="handleSyncConflict(\'merge\')" style="justify-content:flex-start;gap:8px;background:var(--success,#00b894)">\uD83D\uDD04 Zusammenf\u00FChren (empfohlen)</button>'
    +'</div>'
    +'</div>';
  // Store data for handler
  m._localData=localData;
  m._remoteData=remoteData;
  document.body.appendChild(m);
}

function handleSyncConflict(choice){
  var overlay=document.getElementById('syncConflictOverlay');
  if(!overlay)return;
  var localData=overlay._localData;
  var remoteData=overlay._remoteData;
  overlay.remove();

  if(choice==='remote'){
    dbg('[Supabase] Conflict resolved: using remote');
    applyRemoteData(remoteData);
    finalizeSyncLoad();
    toast('Cloud-Version \u00FCbernommen');
  } else if(choice==='local'){
    dbg('[Supabase] Conflict resolved: keeping local');
    saveToSupabaseDirect().then(function(){
      finalizeSyncLoad();
      toast('Lokale Version beibehalten');
    });
  } else if(choice==='merge'){
    dbg('[Supabase] Conflict resolved: merging');
    var mergedClients=mergeClients(localData.clients,remoteData.clients,lastKnownRemote?lastKnownRemote.clients:[]);
    DB.clients=mergedClients;
    DB.activeClient=localData.activeClient||remoteData.activeClient||null;
    DB.activeProject=localData.activeProject||remoteData.activeProject||null;
    localStorage.setItem('lr3',JSON.stringify(DB));
    saveToSupabaseDirect().then(function(){
      finalizeSyncLoad();
      toast('Daten zusammengef\u00FChrt');
    });
  }
}

// ---------- LOAD FROM SUPABASE (Phase 2.1: Conflict Detection) ----------
async function loadFromSupabase(){
  if(!sbClient){updateSyncStatus('offline');return}
  try{
    var resp=await sbClient.from('app_state').select('data,updated_at').eq('id','main').single();
    if(resp.error){console.warn('[Supabase] Load error:',resp.error);updateSyncStatus('error');return}

    var remote=resp.data&&resp.data.data?resp.data.data:null;
    var hasRemote=remote&&remote.clients&&remote.clients.length>0;
    var hasLocal=DB.clients&&DB.clients.length>0;

    // CASE A: Remote leer, local hat Daten → Push local hoch
    if(!hasRemote&&hasLocal){
      dbg('[Supabase] Remote empty, pushing local data');
      await saveToSupabaseDirect();
      finalizeSyncLoad();
      return;
    }

    // CASE B: Beides leer → nur Subscriptions starten
    if(!hasRemote&&!hasLocal){
      dbg('[Supabase] Both empty, starting subscriptions');
      finalizeSyncLoad();
      return;
    }

    // Ab hier: Remote hat Daten
    if(resp.data.updated_at)lastRemoteUpdate=resp.data.updated_at;
    var localData={clients:DB.clients,activeClient:DB.activeClient,activeProject:DB.activeProject};
    var remoteStr=JSON.stringify(remote);
    var localStr=JSON.stringify(localData);

    // CASE C: Identisch → Baseline setzen, fertig
    if(remoteStr===localStr){
      dbg('[Supabase] Local and remote identical');
      finalizeSyncLoad();
      return;
    }

    // Daten unterschiedlich — Conflict Detection via Baseline
    var baseStr=lastKnownRemote?JSON.stringify(lastKnownRemote):null;

    // CASE D1: Kein Baseline → Remote übernehmen (Erstinstallation / Cache gelöscht)
    if(!baseStr){
      dbg('[Supabase] No baseline, accepting remote');
      applyRemoteData(remote);
      finalizeSyncLoad();
      return;
    }

    var localChanged=(localStr!==baseStr);
    var remoteChanged=(remoteStr!==baseStr);

    // CASE D2: Nur Remote geändert → Remote übernehmen
    if(remoteChanged&&!localChanged){
      dbg('[Supabase] Only remote changed, accepting remote');
      applyRemoteData(remote);
      finalizeSyncLoad();
      return;
    }

    // CASE D3: Nur Local geändert → Local behalten, hochpushen
    if(localChanged&&!remoteChanged){
      dbg('[Supabase] Only local changed, pushing to Supabase');
      await saveToSupabaseDirect();
      finalizeSyncLoad();
      return;
    }

    // CASE D4: BEIDE geändert → Konflikt-Modal
    dbg('[Supabase] CONFLICT: both local and remote changed');
    updateSyncStatus('conflict');
    showSyncConflictModal(localData,remote);
    // finalizeSyncLoad() wird von handleSyncConflict() aufgerufen

  }catch(e){console.warn('[Supabase] Load failed:',e);updateSyncStatus('error')}
}

// ---------- SAVE TO SUPABASE (with merge) ----------
let saveTimeout=null;
function getRetainerMonthName(){
  const months=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const d=new Date();
  return'Retainer '+months[d.getMonth()]+' '+d.getFullYear();
}

// Legacy compat: mkClient wraps mkClientWithProject
function getActiveClient(){
  const client=DB.clients.find(c=>c.id===DB.activeClient);
  if(!client)return DB.clients[0]?.projects[0]||{phases:[],states:{},quickLinks:{},timeLog:[],docLinks:{}};
  const proj=client.projects.find(p=>p.id===DB.activeProject);
  return proj||client.projects[0]||{phases:[],states:{},quickLinks:{},timeLog:[],docLinks:{}};
}
// Get active client object
function getPhaseHealth(phase,pct,done,total){
  const now=new Date();now.setHours(0,0,0,0);
  const GREEN='#16a34a',ORANGE='#ea580c',RED='#dc2626',BLUE='#6366f1',DONE_GREEN='#059669';
  // 100% done
  if(total>0&&done===total)return{color:DONE_GREEN,icon:'â'};
  // No dates â use original phase color
  if(!phase.startDate||!phase.endDate)return{color:phase.color,icon:''};
  const start=new Date(phase.startDate);start.setHours(0,0,0,0);
  const end=new Date(phase.endDate);end.setHours(0,0,0,0);
  // Future phase
  if(now<start)return{color:BLUE,icon:''};
  // Overdue: past end date with tasks open
  if(now>end&&done<total)return{color:RED,icon:'â ï¸'};
  // In progress: compare progress % to time elapsed %
  const totalDays=Math.max((end-start)/864e5,1);
  const elapsed=Math.min((now-start)/864e5,totalDays);
  const timePct=elapsed/totalDays*100;
  // On track or ahead
  if(pct>=timePct-10)return{color:GREEN,icon:''};
  // Behind schedule
  return{color:ORANGE,icon:'â³'};
}




// M-5: ID-System â resolve _id to array index
function resolvePhaseIdx(c,phaseId){for(var i=0;i<c.phases.length;i++){if(c.phases[i]._id===phaseId)return i;}return -1;}
function resolvePkgIdx(phase,pkgId){for(var i=0;i<phase.packages.length;i++){if(phase.packages[i]._id===pkgId)return i;}return -1;}
function resolveTaskIdx(pkg,taskId){for(var i=0;i<pkg.tasks.length;i++){if(pkg.tasks[i]._id===taskId)return i;}return -1;}
function resolveTaskById(c,taskId){for(var pi=0;pi<c.phases.length;pi++){var ph=c.phases[pi];for(var pai=0;pai<ph.packages.length;pai++){var pk=ph.packages[pai];for(var ti=0;ti<pk.tasks.length;ti++){if(pk.tasks[ti]._id===taskId)return{pi:pi,pai:pai,ti:ti,task:pk.tasks[ti]};}}}return null;}

// M-2: Extracted from renderTasks() â package header block
function rebuildStates(c){
  /* legacy no-op – status lives on task.status only (Phase 1.1) */
}
// findOldStateKey - DEPRECATED (M-1: status now on task.status)
function findOldStateKey(c,pi,pai,ti,t){return null;}

// ============================================================
// PHASE MODAL
// ============================================================
let phaseCtx=null;
function phasePct(c,pi){
if(typeof pi==="string"){pi=resolvePhaseIdx(c,pi);}let t=0,d=0;c.phases[pi].packages.forEach((pk,pai)=>pk.tasks.forEach((task,ti)=>{t++;if(((task.status||'Offen'))==='Erledigt')d++}));return t?Math.round(d/t*100):0}

// ============================================================
// DOCS VIEW
// ============================================================
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}

// Close modals on backdrop click
document.querySelectorAll('.modal-bg').forEach(bg=>{bg.addEventListener('click',e=>{if(e.target===bg)bg.classList.remove('show')})});

// === M7: Due-Dates + Overdue ===

function countOverdue(){let c=0;const p=getActiveClient();if(!p)return 0;p.phases.forEach((ph,pi)=>{ph.packages.forEach((pk,ki)=>{pk.tasks.forEach((t,ti)=>{const key=pi+'-'+ki+'-'+ti;if(!st[key]&&getDueClass(t)==='due-overdue')c++;});});});return c;}
function countAllTasks(project){var c=0;project.phases.forEach(function(ph){ph.packages.forEach(function(pk){c+=pk.tasks.length;});});return c;}
function countDoneTasks(project){var c=0;project.phases.forEach(function(ph,pi){ph.packages.forEach(function(pk,pai){pk.tasks.forEach(function(t,ti){if(t.status==="Erledigt")c++;});});});return c;}
window.openExportModal=function(){var m=document.getElementById("exportModal");var mc=m.querySelector(".modal-content")||m.querySelector(".modal")||m;
var h='<h3 style="margin:0 0 16px;font-size:17px;font-weight:800;color:var(--text)">Projektstand exportieren</h3>';
h+='<label style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--surface2);border-radius:8px;cursor:pointer;font-weight:700;margin-bottom:12px"><input type="checkbox" id="expAll" onchange="toggleAllExport(this.checked)" style="width:18px;height:18px;accent-color:var(--green)"> Alle Kunden</label>';
h+='<div style="display:flex;flex-direction:column;gap:2px;max-height:260px;overflow-y:auto;margin-bottom:16px">';
DB.clients.forEach(function(c,i){var pc=c.projects?c.projects.length:0;h+='<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:6px;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background=\'var(--surface2)\'" onmouseout="this.style.background=\'transparent\'">';h+='<input type="checkbox" class="exportClientCb" value="'+i+'" style="width:16px;height:16px;accent-color:var(--green)">';h+='<span style="font-size:14px;color:var(--text)">'+esc(c.name)+'</span>';h+='<span style="font-size:11px;color:var(--text3);margin-left:auto">'+pc+' Projekt'+(pc!==1?'e':'')+'</span></label>'});
h+='</div><div style="display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--border);padding-top:14px">';
h+='<button onclick="doExport(\'md\')" style="padding:8px 18px;border-radius:8px;border:none;background:var(--green);color:#fff;cursor:pointer;font-weight:700;font-size:13px">Export .md</button>';
h+='<button onclick="doExport(\'json\')" style="padding:8px 18px;border-radius:8px;border:1.5px solid var(--border);background:var(--surface2);color:var(--text);cursor:pointer;font-weight:600;font-size:13px">Export .json</button>';
h+='<button onclick="closeExportModal()" style="padding:8px 14px;border-radius:8px;border:none;background:transparent;color:var(--text3);cursor:pointer;font-size:13px">Abbrechen</button>';
h+='</div>';mc.innerHTML=h;m.style.display="flex"};
function findTaskKey(project, taskId){return null;}


// === H-3: Undo-System ===

function pushUndo(label) {
  try {
    var snapshot = JSON.stringify(DB);
    _undoStack.push({ label: label || 'Aktion', data: snapshot, ts: Date.now() });
    if (_undoStack.length > MAX_UNDO) _undoStack.shift();
    _redoStack = [];
    updateUndoUI();
  } catch (e) {
    console.warn('[Undo] Snapshot failed:', e);
  }
}

function undo() {
  if (_undoStack.length === 0) {
    toast('Nichts zum R\u00fcckg\u00e4ngig machen');
    return;
  }
  var entry = _undoStack.pop();
  try {
    _redoStack.push({ label: entry.label, data: JSON.stringify(DB), ts: Date.now() });
    if (_redoStack.length > MAX_UNDO) _redoStack.shift();
    DB = JSON.parse(entry.data);
    saveNow();
    renderAll();
    toast('R\u00fcckg\u00e4ngig: ' + entry.label, 'info');
    updateUndoUI();
  } catch (e) {
    console.warn('[Undo] Restore failed:', e);
    toast('Undo fehlgeschlagen', 'error');
  }
}

function redo() {
  if (_redoStack.length === 0) {
    toast('Nichts zum Wiederholen');
    return;
  }
  var entry = _redoStack.pop();
  try {
    _undoStack.push({ label: entry.label, data: JSON.stringify(DB), ts: Date.now() });
    DB = JSON.parse(entry.data);
    saveNow();
    renderAll();
    toast('Wiederholt: ' + entry.label, 'info');
    updateUndoUI();
  } catch (e) {
    console.warn('[Redo] Restore failed:', e);
    toast('Redo fehlgeschlagen', 'error');
  }
}

function updateUndoUI() {
  var badge = document.getElementById('undoBadge');
  if (badge) {
    badge.textContent = _undoStack.length;
    badge.style.display = _undoStack.length > 0 ? 'inline-flex' : 'none';
  }
  var redoBadge = document.getElementById('redoBadge');
  if (redoBadge) {
    redoBadge.textContent = _redoStack.length;
    redoBadge.style.display = _redoStack.length > 0 ? 'inline-flex' : 'none';
  }
}

function clearUndoStack() {
  _undoStack = [];
  _redoStack = [];
  updateUndoUI();
}

// Keyboard shortcut: Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo
document.addEventListener('keydown', function(e) {
  // Don't intercept if user is typing in an input/textarea
  var tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || e.target.contentEditable === 'true') return;
  
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    redo();
  }
});
