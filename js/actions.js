function tplTogglePhase(el){
  const arrow=el.querySelector(".arrow");
  const body=el.nextElementSibling;
  if(body){ body.classList.toggle("open"); }
  if(arrow){ arrow.classList.toggle("open"); }
}

function tplGetTpl(id){ return tplCache.find(t=>t.id===id); }

function tplRename(id,val){
  const t=tplGetTpl(id); if(!t) return;
  t.name=val; saveTemplate(t);
}

function tplEditPhase(id,pi,val){
  const t=tplGetTpl(id); if(!t) return;
  t.data.phases[pi].name=val; t.data.phases[pi].phase=val;
  saveTemplate(t);
}

function tplEditPkg(id,pi,ki,val){
  const t=tplGetTpl(id); if(!t) return;
  t.data.phases[pi].packages[ki].name=val; t.data.phases[pi].packages[ki].package=val;
  saveTemplate(t);
}

function tplEditTask(id,pi,ki,ti,field,val){
  const t=tplGetTpl(id); if(!t) return;
  const tk=t.data.phases[pi].packages[ki].tasks[ti];
  if(field==="name"){ tk.t=val; tk.name=val; tk.task=val; }
  else if(field==="owner"){ tk.owner=val; }
  else if(field==="planzeit"){ tk.min=val; tk.planzeit=val; tk.plan=val; }
  saveTemplate(t);
}

function tplAddPhase(id){
  const t=tplGetTpl(id); if(!t) return;
  if(!t.data.phases) t.data.phases=[];
  t.data.phases.push({name:"Neue Phase",phase:"Neue Phase",packages:[]});
  saveTemplate(t); renderTemplates();
}

function tplAddPkg(id,pi){
  const t=tplGetTpl(id); if(!t) return;
  if(!t.data.phases[pi].packages) t.data.phases[pi].packages=[];
  t.data.phases[pi].packages.push({name:"Neues Package",package:"Neues Package",tasks:[]});
  saveTemplate(t); renderTemplates();
}

function tplAddTask(id,pi,ki){
  const t=tplGetTpl(id); if(!t) return;
  if(!t.data.phases[pi].packages[ki].tasks) t.data.phases[pi].packages[ki].tasks=[];
  t.data.phases[pi].packages[ki].tasks.push({t:"Neuer Task",name:"Neuer Task",task:"Neuer Task",owner:"",min:0,planzeit:0,plan:0});
  saveTemplate(t); renderTemplates();
}

function tplDelPhase(id,pi){
  const t=tplGetTpl(id); if(!t) return;
  if(!confirm("Phase \""+t.data.phases[pi].name+"\" lÃ¶schen?")) return;
  t.data.phases.splice(pi,1);
  saveTemplate(t); renderTemplates();
}

function tplDelPkg(id,pi,ki){
  const t=tplGetTpl(id); if(!t) return;
  t.data.phases[pi].packages.splice(ki,1);
  saveTemplate(t); renderTemplates();
}

function tplDelTask(id,pi,ki,ti){
  const t=tplGetTpl(id); if(!t) return;
  t.data.phases[pi].packages[ki].tasks.splice(ti,1);
  saveTemplate(t); renderTemplates();
}

function newTemplateDialog(){
  const name=prompt("Template-Name:");
  if(!name) return;
  const type=prompt("Typ (launch/retainer_category/webinar/custom):","custom");
  if(!type) return;
  createTemplate(name,type);
}

async function migrateDefaultTemplates(){
  // Migrate hardcoded defaultPhases into Supabase template
  const defData=defaultPhases();
  // Convert to template format: phases[{name,packages:[{name,tasks:[{name,owner,planzeit}]}]}]
  const launchPhases=defData.map(p=>({
    name:p.name||p.phase||"",
    phase:p.name||p.phase||"",
    packages:(p.packages||[]).map(pk=>({
      name:pk.name||pk.package||"",
      package:pk.name||pk.package||"",
      tasks:(pk.tasks||[]).map(tk=>({
        name:tk.t||tk.task||tk.name||"",
        task:tk.t||tk.task||tk.name||"",
        owner:tk.owner||"",
        planzeit:tk.min||tk.planzeit||tk.plan||0,
        plan:tk.min||tk.planzeit||tk.plan||0
      }))
    }))
  }));
  const launchTpl={id:"launch_default",name:"Launch (Standard)",type:"launch",data:{phases:launchPhases},created_at:new Date().toISOString(),updated_at:new Date().toISOString(),created_by:"System"};
  // Migrate RETAINER_CATEGORIES
  const templates=[launchTpl];
  if(typeof RETAINER_CATEGORIES!=="undefined"){
    for(const cat of RETAINER_CATEGORIES){
      const catPhases=(cat.phases||[]).map(cp=>({
        name:cp.name||cp.phase||"",
        phase:cp.name||cp.phase||"",
        packages:(cp.packages||[]).map(pk=>({
          name:pk.package||pk.name||"",
          package:pk.package||pk.name||"",
          tasks:(pk.tasks||[]).map(tk=>({
            name:tk.t||tk.task||tk.name||"",
            task:tk.t||tk.task||tk.name||"",
            owner:tk.owner||"",
            planzeit:tk.min||tk.planzeit||tk.plan||0,
            plan:tk.min||tk.planzeit||tk.plan||0
          }))
        }))
      }));
      templates.push({id:"retainer_"+(cat.id||cat.name.toLowerCase().replace(/[^a-z0-9]/g,"_")),name:"Retainer: "+cat.name,type:"retainer_category",data:{phases:catPhases},created_at:new Date().toISOString(),updated_at:new Date().toISOString(),created_by:"System"});
    }
  // Batch insert
  const r=await fetch(SUPABASE_URL+"/rest/v1/templates",{
    method:"POST",
    headers:{"apikey":SUPABASE_ANON_KEY,"Authorization":"Bearer "+SUPABASE_ANON_KEY,"Content-Type":"application/json","Prefer":"return=minimal"},
    body:JSON.stringify(templates)
  });
  if(r.ok){ tplCache=templates; dbg("Migrated",templates.length,"templates"); }
  else{ console.warn("Migration error",r.status); tplCache=[]; }
}
}

// === M5: Process Intelligence Dashboard ===
let piPeriod = "all";

function calcProcessMetrics(){
  const proj = getActiveClient();
  if(!proj) return null;
  const now = Date.now();
  const periodMs = piPeriod==="month" ? 30*86400000 : piPeriod==="quarter" ? 90*86400000 : 0;
  const cutoff = periodMs ? now - periodMs : 0;
  let totalTasks=0, totalPlan=0, totalIst=0, tasksNoOwner=0;
  const overPlan=[], underPlan=[], noOwner=[], owners={};
  (proj.phases||[]).forEach((ph,pi)=>{
    (ph.packages||[]).forEach((pk,pki)=>{
      (pk.tasks||[]).forEach((tk,ti)=>{
        const plan = tk.min||0;
        let ist = 0;
        if(tk.timeLog && tk.timeLog.length){
          tk.timeLog.forEach(e=>{
            if(!e.start) return;
            const s = new Date(e.start).getTime();
            const en = e.end ? new Date(e.end).getTime() : now;
            if(cutoff && s < cutoff) return;
            ist += (en - s)/60000;
          });
        }
        ist = Math.round(ist);
        totalTasks++;
        totalPlan += plan;
        totalIst += ist;
        const info = {task:tk.t, phase:ph.name||("Phase "+(pi+1)), package:pk.name||"", plan, ist, owner:tk.owner||"â", path:pi+"_"+pki+"_"+ti};
        if(!tk.owner || !tk.owner.trim()){ tasksNoOwner++; noOwner.push(info); }
        else if(ist > plan && plan>0){ overPlan.push({...info, diff:ist-plan, pct:Math.round(ist/plan*100)}); }
        else if(ist>0 && ist<=plan){ underPlan.push({...info, diff:plan-ist, pct:Math.round(ist/plan*100)}); }
        if(tk.owner){
          if(!owners[tk.owner]) owners[tk.owner]={name:tk.owner, plan:0, ist:0, tasks:0};
          owners[tk.owner].plan += plan;
          owners[tk.owner].ist += ist;
          owners[tk.owner].tasks++;
        }
      });
    });
  });
  overPlan.sort((a,b)=>b.diff-a.diff);
  underPlan.sort((a,b)=>b.diff-a.diff);
  const ownerList = Object.values(owners).sort((a,b)=>b.ist-a.ist);
  const efficiency = totalPlan>0 ? Math.round(totalIst/totalPlan*100) : 0;
  return {totalTasks, totalPlan, totalIst, efficiency, tasksNoOwner, overPlan, underPlan, noOwner, ownerList, projName:proj.name||"Projekt"};
}

function piColorClass(pct){
  if(pct<=100) return "pi-green";
  if(pct<=130) return "pi-yellow";
  return "pi-red";
}

function piBar(ist, plan){
  if(!plan) return "";
  const pct = Math.min(Math.round(ist/plan*100),200);
  const color = pct<=100?"#4ade80":pct<=130?"#fbbf24":"#f87171";
  return '<div class="pi-bar"><div class="pi-bar-fill" style="width:'+Math.min(pct,100)+'%;background:'+color+'"></div></div>';
}

function assignOwnerFromInsights(owner,path){
  pushUndo('Owner zugewiesen');
  if(!owner)return;
  var parts=path.split('_');
  var pi=parseInt(parts[0]),pki=parseInt(parts[1]),ti=parseInt(parts[2]);
  var proj=getActiveClient();
  if(!proj)return;
  proj.phases[pi].packages[pki].tasks[ti].owner=owner;
  save();
  renderProcessDashboard();
}
function exportProcessReport(){
  const m = calcProcessMetrics();
  if(!m) return;
  let txt = "PROCESS INTELLIGENCE REPORT\n";
  txt += "Projekt: "+m.projName+"\n";
  txt += "Zeitraum: "+(piPeriod==="all"?"Gesamt":piPeriod==="month"?"Letzter Monat":"Letztes Quartal")+"\n";
  txt += "================================\n\n";
  txt += "Tasks gesamt: "+m.totalTasks+"\n";
  txt += "Plan: "+m.totalPlan+" min | Ist: "+m.totalIst+" min\n";
  txt += "Effizienz: "+m.efficiency+"%\n";
  txt += "Ohne Zeiterfassung: "+m.tasksNoOwner+"\n\n";
  if(m.overPlan.length){
    txt += "ÃBER-PLAN TASKS:\n";
    m.overPlan.forEach(t=>{ txt += "  "+t.task+" ("+t.owner+"): Plan "+t.plan+" / Ist "+t.ist+" = "+t.pct+"%\n"; });
    txt += "\n";
  }
  if(m.underPlan.length){
    txt += "EFFIZIENTE TASKS:\n";
    m.underPlan.forEach(t=>{ txt += "  "+t.task+" ("+t.owner+"): Plan "+t.plan+" / Ist "+t.ist+" = "+t.pct+"%\n"; });
    txt += "\n";
  }
  if(m.ownerList.length){
    txt += "MITARBEITER:\n";
    m.ownerList.forEach(o=>{ const eff=o.plan>0?Math.round(o.ist/o.plan*100):0; txt += "  "+o.name+": "+o.tasks+" Tasks, Plan "+o.plan+" / Ist "+o.ist+" = "+eff+"%\n"; });
    txt += "\n";
  }
  try{ navigator.clipboard.writeText(txt).then(()=>alert("Report in Zwischenablage kopiert!")); }
  catch(e){ const w=window.open("","_blank"); if(w){ w.document.write("<pre>"+txt+"</pre>"); } }
}


// esc helper if not already defined


// ---------- REALTIME SUBSCRIPTION ----------
let realtimeChannel=null;
function updateSyncStatus(status){
  const el=document.getElementById('syncStatus');
  if(!el)return;
  const icons={synced:'\u2601\uFE0F',syncing:'\uD83D\uDD04',error:'\u274C',offline:'\uD83D\uDCF4'};
  const tips={synced:'Synchronisiert',syncing:'Synchronisiere...',error:'Sync-Fehler',offline:'Offline-Modus'};
  el.textContent=icons[status]||'\u2601\uFE0F';
  el.title=tips[status]||status;
}


function mkProject(name,tpl,categories){
  const id='p'+Date.now()+'_'+Math.random().toString(36).substr(2,4);
  let phases;
  if(tpl==='retainer'&&categories&&categories.length){
    phases=[];
    categories.forEach(catId=>{
      const cat=RETAINER_CATEGORIES.find(c=>c.id===catId);
      if(cat){
        cat.phases.forEach(cp=>{
          phases.push(JSON.parse(JSON.stringify({name:cp.name,startDate:'',endDate:'',packages:cp.packages})));
        });
      }
    });
    if(!phases.length)phases=emptyPhases();
  }else if(tpl==='empty'){
    phases=emptyPhases();
  }else{
    phases=defaultPhases();
  }
  const proj={id,name,type:tpl||'launch',phases,states:{},docLinks:{},jfNotes:'',
    quickLinks:{homepage:'',instagram:'',linkedin:'',gdrive:'',claude:''},
    timeLog:[],activeTimer:null,
    startDate:new Date().toISOString().split('T')[0],launchDate:futDate(60),
    completed:false};
  // Auto-assign phase dates
  const pLen=proj.phases.length;
  const today=new Date();
  const PHASE_DAYS=tpl==='empty'?7:(tpl==='retainer'?10:5);
  proj.phases.forEach((p,i)=>{
    const s=new Date(today.getTime()+i*PHASE_DAYS*864e5);
    const e=new Date(today.getTime()+(i*PHASE_DAYS+PHASE_DAYS)*864e5);
    p.startDate=s.toISOString().split('T')[0];
    p.endDate=e.toISOString().split('T')[0];
  });
  if(pLen){const lastEnd=new Date(proj.phases[pLen-1].endDate);lastEnd.setDate(lastEnd.getDate()+2);proj.launchDate=lastEnd.toISOString().split('T')[0]}
  return proj;
}

function mkClientWithProject(clientName,tpl,categories){
  const c={id:'c'+Date.now()+'_'+Math.random().toString(36).substr(2,4),name:clientName,projects:[]};
  const projName=tpl==='retainer'?getRetainerMonthName():clientName+' Launch';
  const proj=mkProject(projName,tpl,categories);
  c.projects.push(proj);
  return c;
}

function mkClient(n,tpl){return mkClientWithProject(n,tpl)}

function emptyPhases(){
  return[
    {name:'Phase 1',startDate:'',endDate:'',packages:[{name:'Paket 1',tasks:['Aufgabe 1']}]},
    {name:'Phase 2',startDate:'',endDate:'',packages:[{name:'Paket 1',tasks:['Aufgabe 1']}]},
    {name:'Phase 3',startDate:'',endDate:'',packages:[{name:'Paket 1',tasks:['Aufgabe 1']}]}
  ];
}
function futDate(d){const x=new Date();x.setDate(x.getDate()+d);return x.toISOString().split('T')[0]}
// getActiveClient() now returns the active PROJECT (not client) â this is key for backward compat
function AC(){return DB.clients.find(c=>c.id===DB.activeClient)||DB.clients[0]}

// ============================================================
// CLIENT MGMT
// ============================================================
let _selectedTpl='launch';
function addClient(){
  _selectedTpl='launch';
  const m=document.createElement('div');m.className='modal-overlay';
  m.innerHTML=`<div class="modal" style="max-width:440px">
    <h3 style="margin:0 0 2px">â¨ Neuer Kunde</h3>
    <div class="modal-subtitle">Kunde anlegen und erstes Projekt erstellen</div>
    <div class="modal-label">Kundenname</div>
    <input id="newClientName" type="text" placeholder="z.B. Mustermann Coaching" style="margin-bottom:18px">
    <div class="modal-label">Projekt-Typ</div>
    <div class="tpl-grid" style="grid-template-columns:1fr 1fr 1fr">
      <div class="tpl-option active" id="tplLaunch" onclick="selectTpl('launch')">
        <span class="tpl-icon">ð</span>
        <span class="tpl-label">Webinar Launch</span>
        <span style="font-size:10px;color:var(--text3)">8 Phasen Â· 60+ Tasks</span>
      </div>
      <div class="tpl-option" id="tplRetainer" onclick="selectTpl('retainer')">
        <span class="tpl-icon">ð</span>
        <span class="tpl-label">Retainer</span>
        <span style="font-size:10px;color:var(--text3)">Monatlicher Baukasten</span>
      </div>
      <div class="tpl-option" id="tplEmpty" onclick="selectTpl('empty')">
        <span class="tpl-icon">ð</span>
        <span class="tpl-label">Leeres Projekt</span>
        <span style="font-size:10px;color:var(--text3)">3 Phasen Â· Frei</span>
      </div>
    </div>
    <div id="retainerCategories" style="display:none;margin-top:12px">
      <div class="modal-label">Retainer-Baukasten â wÃ¤hle die Kategorien</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${RETAINER_CATEGORIES.map(cat=>`<label class="ret-cat-label" data-cat="${cat.id||''}">
          <input type="checkbox" value="${cat.id||''}" class="retCatCheck" style="display:none">
          <span class="ret-cat-icon">${cat.icon}</span>
          <span class="ret-cat-name">${cat.name}</span>
        </label>`).join('')}
      </div>
    </div>
    <div class="btn-row" style="margin-top:18px">
      <button class="btn-cancel" onclick="this.closest('.modal-overlay').remove()">Abbrechen</button>
      <button class="btn-primary" onclick="confirmNewClient(this)">Anlegen</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  setTimeout(()=>document.getElementById('newClientName').focus(),50);
  document.getElementById('newClientName').addEventListener('keydown',e=>{if(e.key==='Enter')confirmNewClient(m.querySelector('.btn-primary'))});
}
function selectTpl(which){
  _selectedTpl=which;
  ['tplLaunch','tplRetainer','tplEmpty'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.classList.toggle('active',id==='tpl'+which.charAt(0).toUpperCase()+which.slice(1));
  });
  // Fix: handle naming
  document.getElementById('tplLaunch')?.classList.toggle('active',which==='launch');
  document.getElementById('tplRetainer')?.classList.toggle('active',which==='retainer');
  document.getElementById('tplEmpty')?.classList.toggle('active',which==='empty');
  const rc=document.getElementById('retainerCategories');
  if(rc)rc.style.display=which==='retainer'?'block':'none';
}
function confirmNewClient(btn){
  pushUndo('Neuer Kunde');
  const m=btn.closest('.modal-overlay');
  const name=document.getElementById('newClientName').value.trim();
  if(!name){toast('Bitte Name eingeben');return}
  const tpl=_selectedTpl;
  let categories=[];
  if(tpl==='retainer'){
    categories=[...document.querySelectorAll('.retCatCheck:checked')].map(cb=>cb.value);
    if(!categories.length){toast('Mindestens eine Kategorie wÃ¤hlen');return}
  }
  m.remove();
  const tplMap={launch:'webinar',retainer:'retainer',empty:'empty'};
  const c=mkClientWithProject(name,tplMap[tpl]||tpl,categories);
  DB.clients.push(c);DB.activeClient=c.id;DB.activeProject=c.projects[0].id;
  expandedClients.add(c.id);
  save();dashboardActive=false;renderAll();
  const msgs={launch:'Webinar-Launch angelegt',retainer:'Retainer angelegt',empty:'Leeres Projekt angelegt'};
  toast(msgs[tpl]||'Projekt angelegt');
}

// Add new project to existing client
function addProject(clientId){
  _selectedTpl='launch';
  const client=DB.clients.find(c=>c.id===clientId);
  if(!client)return;
  const m=document.createElement('div');m.className='modal-overlay';
  m.innerHTML=`<div class="modal" style="max-width:440px">
    <h3 style="margin:0 0 2px">ð Neues Projekt</h3>
    <div class="modal-subtitle">Projekt fÃ¼r ${esc(client.name)}</div>
    <div class="modal-label">Projektname</div>
    <input id="newProjName" type="text" placeholder="z.B. Webinar MÃ¤rz, Retainer Q2..." style="margin-bottom:18px">
    <div class="modal-label">Projekt-Typ</div>
    <div class="tpl-grid" style="grid-template-columns:1fr 1fr 1fr">
      <div class="tpl-option active" id="tplLaunch" onclick="selectTpl('launch')">
        <span class="tpl-icon">ð</span><span class="tpl-label">Launch</span>
      </div>
      <div class="tpl-option" id="tplRetainer" onclick="selectTpl('retainer')">
        <span class="tpl-icon">ð</span><span class="tpl-label">Retainer</span>
      </div>
      <div class="tpl-option" id="tplEmpty" onclick="selectTpl('empty')">
        <span class="tpl-icon">ð</span><span class="tpl-label">Leer</span>
      </div>
    </div>
    <div id="retainerCategories" style="display:none;margin-top:12px">
      <div class="modal-label">Retainer-Baukasten</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${RETAINER_CATEGORIES.map(cat=>`<label class="ret-cat-label" data-cat="${cat.id||''}">
          <input type="checkbox" value="${cat.id||''}" class="retCatCheck" style="display:none">
          <span class="ret-cat-icon">${cat.icon}</span>
          <span class="ret-cat-name">${cat.name}</span>
        </label>`).join('')}
      </div>
    </div>
    ${client.projects.some(p=>!p.completed)?`<div style="margin-top:12px;padding:8px 10px;background:var(--surface2);border-radius:var(--radius-sm);font-size:11px;color:var(--text3)">ð¡ Du kannst auch ein bestehendes Projekt als Template nutzen: <select id="dupFromProj" style="font-size:11px;margin-top:4px;padding:2px 6px;border:1px solid var(--border);border-radius:4px"><option value="">â Kein Template â</option>${client.projects.map(p=>`<option value="${p.id||''}">${esc(p.name)}</option>`).join('')}</select></div>`:''}
    <div class="btn-row" style="margin-top:18px">
      <button class="btn-cancel" onclick="this.closest('.modal-overlay').remove()">Abbrechen</button>
      <button class="btn-primary" onclick="confirmNewProject('${clientId}',this)">Anlegen</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  setTimeout(()=>document.getElementById('newProjName').focus(),50);
}
function confirmNewProject(clientId,btn){
  pushUndo('Neues Projekt');
  const m=btn.closest('.modal-overlay');
  const client=DB.clients.find(c=>c.id===clientId);
  if(!client)return;
  const name=document.getElementById('newProjName').value.trim();
  if(!name){toast('Bitte Name eingeben');return}
  const tpl=_selectedTpl;
  let categories=[];
  if(tpl==='retainer'){
    categories=[...document.querySelectorAll('.retCatCheck:checked')].map(cb=>cb.value);
    if(!categories.length){toast('Mindestens eine Kategorie wÃ¤hlen');return}
  }
  // Check if duplicating from existing project
  const dupSel=document.getElementById('dupFromProj');
  const dupId=dupSel?dupSel.value:'';
  let proj;
  if(dupId){
    const src=client.projects.find(p=>p.id===dupId);
    if(src){
      proj=JSON.parse(JSON.stringify(src));
      proj.id='p'+Date.now()+'_'+Math.random().toString(36).substr(2,4);
      proj.name=name;
      proj.completed=false;
      // Reset all states
      proj.states={};
    }else{
      proj=mkProject(name,tpl==='launch'?'webinar':tpl,categories);
    }
  }else{
    proj=mkProject(name,tpl==='launch'?'webinar':tpl,categories);
  }
  m.remove();
  client.projects.push(proj);
  DB.activeClient=clientId;DB.activeProject=proj.id;
  expandedClients.add(clientId);
  save();dashboardActive=false;renderAll();
  toast('Projekt "'+name+'" angelegt');
}

// Duplicate retainer for next month
function duplicateRetainer(projId){
  pushUndo('Retainer dupliziert');
  const client=AC();if(!client)return;
  const src=client.projects.find(p=>p.id===projId);
  if(!src)return;
  const newProj=JSON.parse(JSON.stringify(src));
  newProj.id='p'+Date.now()+'_'+Math.random().toString(36).substr(2,4);
  // Increment month name
  const months=['Januar','Februar','MÃ¤rz','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const curMonth=new Date().getMonth();
  const nextMonth=(curMonth+1)%12;
  const year=nextMonth===0?new Date().getFullYear()+1:new Date().getFullYear();
  newProj.name='Retainer '+months[nextMonth]+' '+year;
  newProj.states={};newProj.completed=false;
  newProj.startDate=new Date().toISOString().split('T')[0];
  newProj.launchDate=futDate(30);
  // Reset phase dates
  const today=new Date();
  newProj.phases.forEach((p,i)=>{
    const s=new Date(today.getTime()+i*10*864e5);
    const e=new Date(today.getTime()+(i*10+10)*864e5);
    p.startDate=s.toISOString().split('T')[0];
    p.endDate=e.toISOString().split('T')[0];
  });
  client.projects.push(newProj);
  // Mark old as completed
  src.completed=true;
  DB.activeProject=newProj.id;
  Bus.emit('data:changed');
  toast('Neuer Retainer-Monat erstellt');
}

function switchClient(id){
  pushUndo('Kunde gewechselt');
  const client=DB.clients.find(c=>c.id===id);
  if(!client)return;
  DB.activeClient=id;
  expandedClients.add(id);
  // Switch to first non-completed project, or first project
  const activeProj=client.projects.find(p=>!p.completed)||client.projects[0];
  if(activeProj)DB.activeProject=activeProj.id;
  dashboardActive=false;Bus.emit('data:changed');
}
function switchProject(clientId,projId,e){
  pushUndo('Projekt gewechselt');
  if(e)e.stopPropagation();
  DB.activeClient=clientId;DB.activeProject=projId;
  dashboardActive=false;Bus.emit('data:changed');
}
function toggleClientExpand(id,e){
  if(e)e.stopPropagation();
  if(expandedClients.has(id))expandedClients.delete(id);else expandedClients.add(id);
  renderSidebar();
}
function delClient(id,e){
  pushUndo('Kunde gelÃ¶scht');e.stopPropagation();if(DB.clients.length<=1)return toast('Mind. 1 Kunde');if(!confirm('Kunde und alle Projekte lÃ¶schen?'))return;DB.clients=DB.clients.filter(c=>c.id!==id);if(DB.activeClient===id){DB.activeClient=DB.clients[0].id;const ap=DB.clients[0].projects[0];DB.activeProject=ap?ap.id:null}Bus.emit('data:changed');toast('GelÃ¶scht')}function renameClientInline(cid){const cl=DB.clients.find(x=>x.id===cid);if(!cl)return;const nn=prompt('Kundenname:',cl.name);if(!nn||!nn.trim())return;cl.name=nn.trim();Bus.emit('data:changed');}
  pushUndo('Kunde gel\u00f6scht');

function delProject(clientId,projId,e){
  pushUndo('Projekt gel\u00f6scht');
  e.stopPropagation();
  const client=DB.clients.find(c=>c.id===clientId);
  if(!client||client.projects.length<=1)return toast('Mind. 1 Projekt pro Kunde');
  if(!confirm('Projekt lÃ¶schen?'))return;
  client.projects=client.projects.filter(p=>p.id!==projId);
  if(DB.activeProject===projId)DB.activeProject=client.projects[0].id;
  Bus.emit('data:changed');toast('Projekt gelÃ¶scht');
}
function showDashboard(){dashboardActive=true;renderAll()}
function toggleProjectComplete(){
  pushUndo('Projekt-Status');
  const p=getActiveClient();if(!p)return;
  p.completed=!p.completed;Bus.emit('data:changed');
  toast(p.completed?'Projekt abgeschlossen':'Projekt reaktiviert');
}

// ============================================================
// RENDER ALL
// ============================================================
function projectPct(proj){let t=0,d=0;proj.phases.forEach((p,pi)=>p.packages.forEach((pk,pai)=>pk.tasks.forEach((task,ti)=>{t++;if(((task.status||'Offen'))==='Erledigt')d++})));return t?Math.round(d/t*100):0}
function clientPct(c){let t=0,d=0;(c.projects||[]).forEach(proj=>{proj.phases.forEach((p,pi)=>p.packages.forEach((pk,pai)=>pk.tasks.forEach((task,ti)=>{t++;if(((task.status||'Offen'))==='Erledigt')d++})))});return t?Math.round(d/t*100):0}

function editQuickLink(key){
  pushUndo('Link bearbeitet');
  const c=getActiveClient();if(!c.quickLinks)c.quickLinks={homepage:'',instagram:'',linkedin:'',gdrive:'',claude:''};
  if(key.startsWith('custom_')){
    const idx=parseInt(key.split('_')[1]);
    const cl=c.customLinks[idx];
    const v=prompt('URL f\u00fcr '+cl.label+':',cl.url||'');
    if(v===null)return;
    cl.url=v.trim();save();renderTopbar();
    toast(v.trim()?'Link gespeichert':'Link entfernt');return;
  }
  const labels={homepage:'Homepage URL',instagram:'Instagram URL',linkedin:'LinkedIn URL',gdrive:'Google Drive URL',claude:'Claude Projekt URL'};
  const cur=c.quickLinks[key]||'';
  const v=prompt(labels[key]+':',cur);
  if(v===null)return;
  c.quickLinks[key]=v.trim();save();renderTopbar();
  toast(v.trim()?'Link gespeichert':'Link entfernt');
}
function toggleLinkPanel(){
  const p=document.getElementById('linkPanel');
  p.classList.toggle('open');
  if(p.classList.contains('open')){
    const close=function(e){if(!e.target.closest('.topbar-actions')){p.classList.remove('open');document.removeEventListener('click',close);}};
    setTimeout(()=>document.addEventListener('click',close),10);
  }
}
function addCustomLink(){
  pushUndo('Link hinzugef\u00fcgt');
  const c=getActiveClient();if(!c.customLinks)c.customLinks=[];
  const label=prompt('Link-Name (z.B. Trello, Figma, Notion):');
  if(!label||!label.trim())return;
  const url=prompt('URL f\u00fcr '+label.trim()+':');
  c.customLinks.push({label:label.trim(),url:(url||'').trim()});
  save();renderTopbar();
  toast('Link hinzugef\u00fcgt');
}
function editTitle(){const s=document.getElementById('clientTitle'),i=document.getElementById('clientTitleInput');i.value=getActiveClient().name;s.style.display='none';i.style.display='inline-block';i.focus();i.select()}
function saveTitle(){
  pushUndo('Titel gespeichert');const s=document.getElementById('clientTitle'),i=document.getElementById('clientTitleInput'),v=i.value.trim()||'Projekt';s.style.display='';i.style.display='none';getActiveClient().name=v;Bus.emit('data:changed');}
  pushUndo('Titel gespeichert');

function setProjectStart(val){
  pushUndo('Startdatum gesetzt');
  const c=getActiveClient();
  c.startDate=val;
  Bus.emit('data:changed');renderMiniTimeline();
  toast('Startdatum gesetzt');
}

function recalcDeadlines(){
  pushUndo('Deadlines berechnet');
  const c=getActiveClient();
  const start=c.startDate?new Date(c.startDate):new Date();
  let cursor=new Date(start);
  c.phases.forEach(p=>{
    // Gesamtminuten aller Tasks in dieser Phase
    let totalMins=0;
    p.packages.forEach(pkg=>pkg.tasks.forEach(t=>totalMins+=(t.min||30)));
    // Umrechnung: 6h produktive Arbeit/Tag = 360min
    const workDays=Math.max(2,Math.ceil(totalMins/360));
    p.startDate=cursor.toISOString().split('T')[0];
    // Skip weekends
    let daysAdded=0;
    const endCursor=new Date(cursor);
    while(daysAdded<workDays){
      endCursor.setDate(endCursor.getDate()+1);
      const dow=endCursor.getDay();
      if(dow!==0&&dow!==6)daysAdded++;
    }
    p.endDate=endCursor.toISOString().split('T')[0];
    cursor=new Date(endCursor);
    cursor.setDate(cursor.getDate()+1); // 1 Tag Puffer zwischen Phasen
  });
  // Launch = Ende letzte Phase + 2 Tage
  const lastEnd=new Date(c.phases[c.phases.length-1].endDate);
  lastEnd.setDate(lastEnd.getDate()+2);
  c.launchDate=lastEnd.toISOString().split('T')[0];
  Bus.emit('data:changed');
  toast('Deadlines berechnet: '+c.phases.length+' Phasen verteilt');
}

// ============================================================
// STATS
// ============================================================
function toggleP(pi){
var c=getActiveClient();if(typeof pi==="string"){pi=resolvePhaseIdx(c,pi);}
  if(openPhases.has(pi))openPhases.delete(pi);else openPhases.add(pi);
  var pbEl=document.getElementById('pb'+pi);
  if(pbEl&&openPhases.has(pi)&&pbEl.getAttribute('data-lazy')){
    pbEl.innerHTML=renderPhaseBodyContent(c.phases[pi],pi,c);
    pbEl.removeAttribute('data-lazy');
  }
  pbEl.classList.toggle('open');
  document.getElementById('pc'+pi).classList.toggle('open');
}
function toggleW(pi,pai){
var c=getActiveClient();if(typeof pi==="string"){var _pi=resolvePhaseIdx(c,pi);pai=resolvePkgIdx(c.phases[_pi],pai);pi=_pi;}
  const k=`${pi}_${pai}`;
  if(openPackages.has(k))openPackages.delete(k);else openPackages.add(k);
  document.getElementById(`wb${pi}_${pai}`).classList.toggle('open');
  document.getElementById(`wc${pi}_${pai}`).classList.toggle('open');
}

// Package (Kategorie) Management
function openAddPackage(pi){
  pushUndo('Kategorie hinzugef\u00fcgt');
  const name=prompt('Name der neuen Kategorie:');
  if(!name||!name.trim())return;
  const c=getActiveClient();
if(typeof pi==="string"){pi=resolvePhaseIdx(c,pi);}
  c.phases[pi].packages.push({name:name.trim(),tasks:[]});
  Bus.emit('data:changed');toast('Kategorie hinzugefÃ¼gt');
  // Auto-open the phase and new package
  if(!openPhases.has(pi)){openPhases.add(pi)}
  const newPai=c.phases[pi].packages.length-1;
  openPackages.add(`${pi}_${newPai}`);
  renderTasks();applyFilters();
}
function renamePackage(pi,pai){
  pushUndo('Kategorie umbenannt');
  const c=getActiveClient();
if(typeof pi==="string"){var _pi=resolvePhaseIdx(c,pi);pai=resolvePkgIdx(c.phases[_pi],pai);pi=_pi;}
  const name=prompt('Kategorie umbenennen:',c.phases[pi].packages[pai].name);
  if(!name||!name.trim())return;
  c.phases[pi].packages[pai].name=name.trim();
  Bus.emit('tasks:changed');applyFilters();toast('Kategorie umbenannt');
}
function deletePackage(pi,pai){
  pushUndo('Kategorie gel\u00f6scht');
  if(!confirm('Kategorie und alle enthaltenen Aufgaben lÃ¶schen?'))return;
  getActiveClient().phases[pi].packages.splice(pai,1);
if(typeof pi==="string"){var _pi=resolvePhaseIdx(c,pi);pai=resolvePkgIdx(c.phases[_pi],pai);pi=_pi;}
  rebuildStates(getActiveClient());Bus.emit('data:changed');toast('Kategorie gelÃ¶scht');
}

// ============================================================
// DRAG & DROP: PHASES
// ============================================================
let dragPI=null;
function dragPhaseStart(e,pi){
if(typeof pi==="string"){pi=resolvePhaseIdx(getActiveClient(),pi);}dragPI=pi;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','phase-'+pi);e.currentTarget.classList.add('dragging')}
function dragPhaseEnd(e){dragPI=null;e.currentTarget.classList.remove('dragging');document.querySelectorAll('.phase-block').forEach(el=>{el.classList.remove('drag-over-top','drag-over-bot')})}
function dragPhaseOver(e,pi){
if(typeof pi==="string"){pi=resolvePhaseIdx(getActiveClient(),pi);}
  if(dragPI===null||dragPI===pi)return;
  e.preventDefault();e.dataTransfer.dropEffect='move';
  const el=e.currentTarget,r=el.getBoundingClientRect(),mid=r.top+r.height/2;
  el.classList.remove('drag-over-top','drag-over-bot');
  if(e.clientY<mid)el.classList.add('drag-over-top');else el.classList.add('drag-over-bot');
}
function dragPhaseLeave(e){e.currentTarget.classList.remove('drag-over-top','drag-over-bot')}
function dropPhase(e,targetPI){
  pushUndo('Phase verschoben');
  e.preventDefault();
if(typeof targetPI==="string"){targetPI=resolvePhaseIdx(getActiveClient(),targetPI);}
  if(dragPI===null||dragPI===targetPI)return;
  const c=getActiveClient();
  const el=e.currentTarget,r=el.getBoundingClientRect(),mid=r.top+r.height/2;
  const insertBefore=e.clientY<mid;
  // Move phase
  const phase=c.phases.splice(dragPI,1)[0];
  let newIdx=insertBefore?targetPI:targetPI+1;
  if(dragPI<targetPI)newIdx--;
  c.phases.splice(newIdx,0,phase);
  // Renumber phase IDs and names
  renumberPhases(c);
  // Rebuild states to match new indices
  rebuildStates(c);
  save();
  // Recalc deadlines automatically
  autoRecalcAfterReorder(c);
  renderAll();toast('Phase verschoben');
  dragPI=null;
}

// ============================================================
// DRAG & DROP: PACKAGES (within a phase)
// ============================================================
let dragPkg=null;
function dragPkgStart(e,pi,pai){
if(typeof pi==="string"){var c=getActiveClient();var _pi=resolvePhaseIdx(c,pi);pai=resolvePkgIdx(c.phases[_pi],pai);pi=_pi;}
  e.stopPropagation(); // Prevent phase drag
  dragPkg={pi,pai};e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','pkg-'+pi+'-'+pai);e.currentTarget.classList.add('dragging');
}
function dragPkgEnd(e){dragPkg=null;e.currentTarget.classList.remove('dragging');document.querySelectorAll('.wp-wrap').forEach(el=>{el.classList.remove('drag-over-top','drag-over-bot')})}
function dragPkgOver(e,pi,pai){
if(typeof pi==="string"){var c=getActiveClient();var _pi=resolvePhaseIdx(c,pi);pai=resolvePkgIdx(c.phases[_pi],pai);pi=_pi;}
  if(!dragPkg||dragPkg.pi!==pi||(dragPkg.pi===pi&&dragPkg.pai===pai))return;
  e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';
  const el=e.currentTarget,r=el.getBoundingClientRect(),mid=r.top+r.height/2;
  el.classList.remove('drag-over-top','drag-over-bot');
  if(e.clientY<mid)el.classList.add('drag-over-top');else el.classList.add('drag-over-bot');
}
function dragPkgLeave(e){e.currentTarget.classList.remove('drag-over-top','drag-over-bot')}
function dropPkg(e,targetPI,targetPAI){
  e.preventDefault();
var c=getActiveClient();if(typeof targetPI==="string"){var _pi=resolvePhaseIdx(c,targetPI);targetPAI=resolvePkgIdx(c.phases[_pi],targetPAI);targetPI=_pi;}e.stopPropagation();
  if(!dragPkg||dragPkg.pi!==targetPI||(dragPkg.pi===targetPI&&dragPkg.pai===targetPAI))return;
  
  const el=e.currentTarget,r=el.getBoundingClientRect(),mid=r.top+r.height/2;
  const insertBefore=e.clientY<mid;
  const srcPAI=dragPkg.pai;
  const pkg=c.phases[targetPI].packages.splice(srcPAI,1)[0];
  let newIdx=insertBefore?targetPAI:targetPAI+1;
  if(srcPAI<targetPAI)newIdx--;
  c.phases[targetPI].packages.splice(newIdx,0,pkg);
  rebuildStates(c);
  Bus.emit('data:changed');toast('Kategorie verschoben');
  dragPkg=null;
}

// ============================================================
// AUTO-RECALC AFTER REORDER
// ============================================================
function autoRecalcAfterReorder(c){
  pushUndo('Phasen neu sortiert');
  if(!c.startDate)return;
  const start=new Date(c.startDate);
  let cursor=new Date(start);
  c.phases.forEach(p=>{
    let totalMins=0;
    p.packages.forEach(pkg=>pkg.tasks.forEach(t=>totalMins+=(t.min||30)));
    const workDays=Math.max(2,Math.ceil(totalMins/360));
    p.startDate=cursor.toISOString().split('T')[0];
    let daysAdded=0;
    const endCursor=new Date(cursor);
    while(daysAdded<workDays){endCursor.setDate(endCursor.getDate()+1);const dow=endCursor.getDay();if(dow!==0&&dow!==6)daysAdded++}
    p.endDate=endCursor.toISOString().split('T')[0];
    cursor=new Date(endCursor);cursor.setDate(cursor.getDate()+1);
  });
  if(c.phases.length){
    const lastEnd=new Date(c.phases[c.phases.length-1].endDate);
    lastEnd.setDate(lastEnd.getDate()+2);
    c.launchDate=lastEnd.toISOString().split('T')[0];
  }
  save();
}

// ============================================================
// MANUAL DEADLINE EDIT
// ============================================================
function editDeadline(pi,pai,ti,evt){
  pushUndo('Deadline ge\u00e4ndert');
  const c=getActiveClient();const task=c.phases[pi].packages[pai].tasks[ti];
if(typeof pi==="string"){var _pi=resolvePhaseIdx(c,pi);var _pai=resolvePkgIdx(c.phases[_pi],pai);ti=resolveTaskIdx(c.phases[_pi].packages[_pai],ti);pai=_pai;pi=_pi;}
  const phase=c.phases[pi];
  // Compute auto-deadline if no custom one set
  if(!task.customDeadline&&phase.startDate&&phase.endDate){
    const pS=new Date(phase.startDate),pE=new Date(phase.endDate),pSpan=pE-pS;
    let cumMin=0,totalMin=0;
    phase.packages.forEach(pk=>pk.tasks.forEach(t=>totalMin+=(t.min||30)));
    phase.packages.forEach((pk,pki)=>pk.tasks.forEach((t,tki)=>{
      cumMin+=(t.min||30);
      if(pki===pai&&tki===ti)task.customDeadline=new Date(pS.getTime()+(totalMin>0?cumMin/totalMin:1)*pSpan).toISOString().split('T')[0];
    }));
  }
  // Use native date picker
  const inp=document.createElement('input');
  inp.type='date';
  inp.value=task.customDeadline||'';
  inp.style.cssText='position:fixed;opacity:0;pointer-events:none;top:0;left:0';
  document.body.appendChild(inp);
  inp.addEventListener('change',()=>{
    if(inp.value){task.customDeadline=inp.value;Bus.emit('data:changed');toast('Deadline gesetzt')}
    inp.remove();
  });
  inp.addEventListener('blur',()=>setTimeout(()=>inp.remove(),200));
  inp.showPicker();

}

const SC=['Offen','In Arbeit','Warte auf Kunde','Erledigt'];
function cycle(id){
  pushUndo('Status geÃ¤ndert');const c=getActiveClient();var r=resolveTaskById(c,id);if(!r){dbg("cycle: task not found",id);return;}var task=r.task;var cur=task.status||"Offen";const nxt=SC[(SC.indexOf(cur)+1)%SC.length];task.status=nxt;if(c.states)c.states[r.pi+"-"+r.pai+"-"+r.ti]=nxt;Bus.emit('data:changed');logActivity("status_change",{task:id,oldStatus:cur,newStatus:nxt})}
  pushUndo('Status ge\u00e4ndert');
function setSt(id,v){
  pushUndo('Status gesetzt');var c=getActiveClient();var r=resolveTaskById(c,id);if(!r){dbg("setSt: task not found",id);return;}var task=r.task;var old=task.status||"Offen";task.status=v;if(c.states)c.states[r.pi+"-"+r.pai+"-"+r.ti]=v;Bus.emit('data:changed');logActivity("status_change",{task:id,oldStatus:old,newStatus:v})}
  pushUndo('Status gesetzt');
function setOwner(pi,pai,ti,sel){
  pushUndo('Owner ge\u00e4ndert');
  const c=getActiveClient();
  if(typeof pi==="string"){var _pi=resolvePhaseIdx(c,pi);pai=resolvePkgIdx(c.phases[_pi],pai);ti=resolveTaskIdx(c.phases[_pi].packages[pai],ti);pi=_pi;}
  c.phases[pi].packages[pai].tasks[ti].owner=sel.value;
  Bus.emit('data:changed');
}
// ============================================================
// TASK MODAL (Add / Edit)
// ============================================================
let taskCtx=null;
function openAddTask(pi,pai){
  var c=getActiveClient();
  if(typeof pi==="string"){var _pi=resolvePhaseIdx(c,pi);pai=resolvePkgIdx(c.phases[_pi],pai);pi=_pi;}
  taskCtx={mode:'add',pi,pai};
  document.getElementById('tmTitle').textContent='Neue Aufgabe';
  document.getElementById('tmName').value='';
  document.getElementById('tmOwner').value='Mitch';
  document.getElementById('tmMin').value='30';
  document.getElementById('tmDue').value='';
  document.getElementById('tmVor').value='';
  document.getElementById('tmDel').style.display='none';
  document.getElementById('tmNotes').value='';
  openModal('taskModal');
  setTimeout(()=>document.getElementById('tmName').focus(),100);
}
function editTask(pi,pai,ti){
  const task=getActiveClient().phases[pi].packages[pai].tasks[ti];
if(typeof pi==="string"){var _pi=resolvePhaseIdx(c,pi);var _pai=resolvePkgIdx(c.phases[_pi],pai);ti=resolveTaskIdx(c.phases[_pi].packages[_pai],ti);pai=_pai;pi=_pi;}
  taskCtx={mode:'edit',pi,pai,ti};
  document.getElementById('tmTitle').textContent='Aufgabe bearbeiten';
  document.getElementById('tmName').value=task.t;
  document.getElementById('tmOwner').value=task.owner;
  document.getElementById('tmMin').value=task.min||30;
  document.getElementById('tmVor').value=task.vor||'';
  document.getElementById('tmDel').style.display='';
  openModal('taskModal');
}
function saveTask(){
  pushUndo('Task gespeichert');
  if(!taskCtx)return;
  const name=document.getElementById('tmName').value.trim();
  if(!name)return;
  const c=getActiveClient();
  const data={t:name,owner:document.getElementById('tmOwner').value,ki:false,vor:document.getElementById('tmVor').value.trim(),auto:'Niedrig',min:parseInt(document.getElementById('tmMin').value)||30,opt:false};
  data.due=document.getElementById('tmDue').value||undefined;data.notes=document.getElementById('tmNotes').value||undefined;
  if(taskCtx.mode==='add'){
    data._id='t_'+Math.random().toString(36).substring(2,10);
    c.phases[taskCtx.pi].packages[taskCtx.pai].tasks.push(data);
    toast('Task hinzugefÃ¼gt');
  } else {
    const old=c.phases[taskCtx.pi].packages[taskCtx.pai].tasks[taskCtx.ti];
    data.ki=old.ki;
    data.links=old.links||{};
    data._id=old._id;data.timeLog=old.timeLog;data.scheduled=old.scheduled;data.opt=old.opt;
    c.phases[taskCtx.pi].packages[taskCtx.pai].tasks[taskCtx.ti]=data;
    toast('Task aktualisiert');
  }
  save();closeModal('taskModal');taskCtx=null;renderAll();
}
function deleteTask(){
  pushUndo('Task gel\u00f6scht');
  if(!taskCtx||taskCtx.mode!=='edit')return;
  if(!confirm('Task lÃ¶schen?'))return;
  const c=getActiveClient();
  c.phases[taskCtx.pi].packages[taskCtx.pai].tasks.splice(taskCtx.ti,1);
  // Shift states
  rebuildStates(c);
  save();closeModal('taskModal');taskCtx=null;renderAll();
  toast('Task gelÃ¶scht');
}

function renumberPhases(c){
  c.phases.forEach((p,i)=>{
    const num=i+1;
    p.id='P'+num;
    // Update name: extract the descriptive part after "PHASE X: "
    const match=p.name.match(/^PHASE\s*\d+\s*:\s*(.+)$/i);
    if(match){
      p.name='PHASE '+num+': '+match[1];
    }
  });
}
function openNewPhase(){
  phaseCtx={mode:'add'};
  document.getElementById('pmTitle').textContent='Neue Phase';
  document.getElementById('pmName').value='';
  document.getElementById('pmColor').value='#6366f1';
  document.getElementById('pmStart').value='';
  document.getElementById('pmEnd').value='';
  document.getElementById('pmDel').style.display='none';
  openModal('phaseModal');
}
function editPhase(pi){
  const p=getActiveClient().phases[pi];
if(typeof pi==="string"){pi=resolvePhaseIdx(c,pi);}
  phaseCtx={mode:'edit',pi};
  document.getElementById('pmTitle').textContent='Phase bearbeiten';
  document.getElementById('pmName').value=p.name.replace(/^PHASE \d+:\s*/i,'');
  document.getElementById('pmColor').value=p.color;
  document.getElementById('pmStart').value=p.startDate||'';
  document.getElementById('pmEnd').value=p.endDate||'';
  document.getElementById('pmDel').style.display='';
  openModal('phaseModal');
}
function savePhase(){
  pushUndo('Phase gespeichert');
  if(!phaseCtx)return;
  const name=document.getElementById('pmName').value.trim();
  if(!name)return;
  const c=getActiveClient();
  if(phaseCtx.mode==='add'){
    const num=c.phases.length+1;
    c.phases.push({
      id:`P${num}`,
      name:name.toUpperCase().startsWith('PHASE')?name:`PHASE ${num}: ${name.toUpperCase()}`,
      color:document.getElementById('pmColor').value,
      startDate:document.getElementById('pmStart').value,
      endDate:document.getElementById('pmEnd').value,
      packages:[{name:'Arbeitspakete',tasks:[]}]
    });
    toast('Phase hinzugefÃ¼gt');
  } else {
    const p=c.phases[phaseCtx.pi];
    const newName=name.toUpperCase().startsWith('PHASE')?name:`${p.id||''}: ${name.toUpperCase()}`;
    p.name=newName;
    p.color=document.getElementById('pmColor').value;
    p.startDate=document.getElementById('pmStart').value;
    p.endDate=document.getElementById('pmEnd').value;
    toast('Phase aktualisiert');
  }
  save();closeModal('phaseModal');phaseCtx=null;renderAll();
}
function deletePhase(){
  pushUndo('Phase gel\u00f6scht');
  if(!phaseCtx||phaseCtx.mode!=='edit')return;
  if(!confirm('Phase und alle Tasks lÃ¶schen?'))return;
  const c=getActiveClient();c.phases.splice(phaseCtx.pi,1);
  renumberPhases(c);rebuildStates(c);
  save();closeModal('phaseModal');phaseCtx=null;renderAll();
  toast('Phase gelÃ¶scht');
}

function editTaskLink(pi,pai,ti,type){
  pushUndo('Task-Link bearbeitet');
  const c=getActiveClient();
if(typeof pi==="string"){var _pi=resolvePhaseIdx(c,pi);var _pai=resolvePkgIdx(c.phases[_pi],pai);ti=resolveTaskIdx(c.phases[_pi].packages[_pai],ti);pai=_pai;pi=_pi;}
  const task=c.phases[pi].packages[pai].tasks[ti];
  if(!task.links)task.links={};
  const label=type==='prompt'?'Prompt-Link':'SOP/Video-Link';
  const current=task.links[type]||'';
  const url=prompt(`${label} fÃ¼r "${task.t}":`,current);
  if(url===null)return;
  task.links[type]=url.trim();
  Bus.emit('data:changed');
  toast(url.trim()?`${label} gespeichert`:`${label} entfernt`);
}

function editTaskTime(pi,pai,ti){
  pushUndo('Task-Zeit ge\u00e4ndert');
  const c=getActiveClient();
if(typeof pi==="string"){var _pi=resolvePhaseIdx(c,pi);var _pai=resolvePkgIdx(c.phases[_pi],pai);ti=resolveTaskIdx(c.phases[_pi].packages[_pai],ti);pai=_pai;pi=_pi;}
  const task=c.phases[pi].packages[pai].tasks[ti];
  const cur=task.min||30;
  const v=prompt('Zeitbudget (Minuten):',cur);
  if(v===null)return;
  task.min=Math.max(5,parseInt(v)||30);
  Bus.emit('data:changed');
  toast('Zeitbudget: '+task.min+' Min');
}
function openGCal(pi,pai,ti){
  const c=getActiveClient();
if(typeof pi==="string"){var _pi=resolvePhaseIdx(c,pi);var _pai=resolvePkgIdx(c.phases[_pi],pai);ti=resolveTaskIdx(c.phases[_pi].packages[_pai],ti);pai=_pai;pi=_pi;}
  const task=c.phases[pi].packages[pai].tasks[ti];
  const mins=task.min||30;
  const scheduled=task.scheduled||null;
  // Default: morgen, 09:00
  const tmrw=new Date();tmrw.setDate(tmrw.getDate()+1);
  const defDate=scheduled?scheduled.date:tmrw.toISOString().split('T')[0];
  const defTime=scheduled?scheduled.time:'09:00';
  const defMins=scheduled?scheduled.mins:mins;

  const ownerLC=(task.owner||'team').toLowerCase();
  const m=document.createElement('div');m.className='modal-overlay';
  m.innerHTML=`<div class="modal" style="max-width:400px">
    <h3 style="margin:0 0 2px">ð Zeitblock planen</h3>
    <div class="modal-subtitle">${esc(task.t)}</div>
    <div style="display:flex;gap:10px;margin-bottom:16px">
      <div style="flex:1"><div class="modal-label">Datum</div>
        <input type="date" id="zbDate" value="${defDate}"></div>
      <div style="width:100px"><div class="modal-label">Uhrzeit</div>
        <input type="time" id="zbTime" value="${defTime}"></div>
      <div style="width:80px"><div class="modal-label">Dauer (min)</div>
        <input type="number" id="zbMins" value="${defMins}" min="5" step="5"></div>
    </div>
    <div class="modal-label">Verantwortlich</div>
    <div style="margin-bottom:16px"><span class="opill opill-${ownerLC}" style="cursor:default;background-image:none;padding-right:10px;font-size:11px">${task.owner||'Team'}</span></div>
    <div class="modal-preview">
      ð <strong>${task.owner||'Team'}</strong> blockt sich <strong><span id="zbPreviewMins">${defMins}</span>min</strong> am <strong><span id="zbPreviewDate">${fmtShort(defDate)}</span></strong> um <strong><span id="zbPreviewTime">${defTime}</span></strong> Uhr
    </div>
    <div class="btn-row">
      ${scheduled?'<button class="btn-danger" onclick="removeScheduled('+pi+','+pai+','+ti+',this)">Entfernen</button>':''}
      <button class="btn-cancel" onclick="this.closest('.modal-overlay').remove()">Abbrechen</button>
      <button class="btn-primary" onclick="confirmZeitblock(${pi},${pai},${ti},this)">ð In Google Calendar</button>
    </div>
  </div>`;
  document.body.appendChild(m);
  // Live preview updates
  const updatePreview=()=>{
    const d=document.getElementById('zbDate').value;
    const t=document.getElementById('zbTime').value;
    const mn=document.getElementById('zbMins').value;
    document.getElementById('zbPreviewDate').textContent=d?fmtShort(d):'â';
    document.getElementById('zbPreviewTime').textContent=t||'â';
    document.getElementById('zbPreviewMins').textContent=mn||'â';
  };
  m.querySelector('#zbDate').addEventListener('input',updatePreview);
  m.querySelector('#zbTime').addEventListener('input',updatePreview);
  m.querySelector('#zbMins').addEventListener('input',updatePreview);
}
function confirmZeitblock(pi,pai,ti,btn){
  pushUndo('Zeitblock gesetzt');
  const c=getActiveClient();const task=c.phases[pi].packages[pai].tasks[ti];
if(typeof pi==="string"){var _pi=resolvePhaseIdx(c,pi);var _pai=resolvePkgIdx(c.phases[_pi],pai);ti=resolveTaskIdx(c.phases[_pi].packages[_pai],ti);pai=_pai;pi=_pi;}
  const date=document.getElementById('zbDate').value;
  const time=document.getElementById('zbTime').value||'09:00';
  const mins=parseInt(document.getElementById('zbMins').value)||task.min||30;
  // Save scheduled info on task
  task.scheduled={date,time,mins,savedAt:new Date().toISOString()};
  save();
  // Build Google Calendar URL
  const title=encodeURIComponent('ð '+task.t+' Â· '+c.name);
  const desc=encodeURIComponent('Phase: '+c.phases[pi].name+'\\nOwner: '+(task.owner||'Team')+'\\nGeschÃ¤tzt: '+mins+' Minuten\\n\\nâ LaunchRamp Zeitblock');
  const [h,mn]=time.split(':').map(Number);
  const start=new Date(date+'T'+time+':00');
  const end=new Date(start.getTime()+mins*60000);
  const fmt=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const url='https://calendar.google.com/calendar/render?action=TEMPLATE&text='+title+'&details='+desc+'&dates='+fmt(start)+'/'+fmt(end);
  window.open(url,'_blank');
  btn.closest('.modal-overlay').remove();
  renderAll();
  toast('Zeitblock geplant â');
}
function removeScheduled(pi,pai,ti,btn){
  pushUndo('Zeitblock entfernt');
  const c=getActiveClient();delete c.phases[pi].packages[pai].tasks[ti].scheduled;
if(typeof pi==="string"){var _pi=resolvePhaseIdx(c,pi);var _pai=resolvePkgIdx(c.phases[_pi],pai);ti=resolveTaskIdx(c.phases[_pi].packages[_pai],ti);pai=_pai;pi=_pi;}
  save();btn.closest('.modal-overlay').remove();renderAll();toast('Zeitblock entfernt');
}

function duplicatePhase(pi){
  pushUndo('Phase dupliziert');
  const c=getActiveClient();
if(typeof pi==="string"){pi=resolvePhaseIdx(c,pi);}
  const orig=c.phases[pi];
  const clone=JSON.parse(JSON.stringify(orig));
  // Extract descriptive name
  const match=clone.name.match(/^PHASE\s*\d+\s*:\s*(.+)$/i);
  const descName=match?match[1]:clone.name;
  clone.id='P'+(c.phases.length+1);
  clone.name='PHASE '+(c.phases.length+1)+': '+descName;
  clone.startDate='';clone.endDate='';
  // Copy states for duplicated tasks
  orig.packages.forEach((pk,pai)=>pk.tasks.forEach((t,ti)=>{
    const oldKey=`${pi}-${pai}-${ti}`;
    // New tasks start fresh
  }));
  c.phases.splice(pi+1,0,clone);
  renumberPhases(c);
  rebuildStates(c);
  Bus.emit('data:changed');
  toast('Phase dupliziert');
}
function deletePhaseInline(pi){
  pushUndo('Phase gel\u00f6scht');
  const c=getActiveClient();
if(typeof pi==="string"){pi=resolvePhaseIdx(c,pi);}
  const phaseName=c.phases[pi]?c.phases[pi].name:'Phase';
  if(!confirm(`"${phaseName}" und alle zugehÃ¶rigen Tasks lÃ¶schen?`))return;
  c.phases.splice(pi,1);
  renumberPhases(c);
  rebuildStates(c);
  openPhases.delete(pi);
  Bus.emit('data:changed');
  toast('Phase gelÃ¶scht');
}

// ============================================================
// CONTEXT MENU
// ============================================================
let ctxData=null;
function ctxShow(e,id,pi,pai,ti){
if(typeof pi==="string"){var c=getActiveClient();var _pi=resolvePhaseIdx(c,pi);var _pai=resolvePkgIdx(c.phases[_pi],pai);ti=resolveTaskIdx(c.phases[_pi].packages[_pai],ti);pai=_pai;pi=_pi;}
  e.preventDefault();
  ctxData={id,pi,pai,ti};
  const m=document.getElementById('ctxMenu');
  m.style.left=Math.min(e.clientX,window.innerWidth-160)+'px';
  m.style.top=Math.min(e.clientY,window.innerHeight-150)+'px';
  m.classList.add('show');
}
function ctxHide(){document.getElementById('ctxMenu').classList.remove('show');ctxData=null}
function ctxEdit(){if(!ctxData)return;editTask(ctxData.pi,ctxData.pai,ctxData.ti);ctxHide()}
function ctxDuplicate(){
  pushUndo('Task dupliziert');
  if(!ctxData)return;
  const c=getActiveClient(),t=c.phases[ctxData.pi].packages[ctxData.pai].tasks[ctxData.ti];
  c.phases[ctxData.pi].packages[ctxData.pai].tasks.splice(ctxData.ti+1,0,JSON.parse(JSON.stringify(t)));
  Bus.emit('data:changed');toast('Dupliziert');ctxHide();
}
function ctxCal(){
  if(!ctxData)return;
  const t=getActiveClient().phases[ctxData.pi].packages[ctxData.pai].tasks[ctxData.ti];
  openCalModal(ctxData.id,t.t,t.min);ctxHide();
}
function ctxLogTime(){
  if(!ctxData)return;
  addManualTime(ctxData.id);ctxHide();
}
function ctxDelete(){
  pushUndo('Task gel\u00f6scht');
  if(!ctxData)return;
  if(!confirm('Task lÃ¶schen?'))return;
  getActiveClient().phases[ctxData.pi].packages[ctxData.pai].tasks.splice(ctxData.ti,1);
  rebuildStates(getActiveClient());Bus.emit('data:changed');toast('GelÃ¶scht');ctxHide();
}
document.addEventListener('click',ctxHide);

// Retainer category toggle (event delegation)
document.addEventListener('click',function(e){
  const label=e.target.closest('.ret-cat-label');
  if(!label)return;
  e.preventDefault();e.stopPropagation();
  const cb=label.querySelector('input[type=checkbox]');
  if(cb){cb.checked=!cb.checked;label.classList.toggle('selected',cb.checked)}
});

// ============================================================
// MINI TIMELINE (Topbar)
// ============================================================
function saveJFLink(){/* legacy â no longer used */}

let curDocId=null;
function editLink(id,name){curDocId=id;document.getElementById('linkName').textContent=name;document.getElementById('linkUrl').value=getActiveClient().docLinks[id]||'';openModal('linkModal')}
function saveLink(){
  pushUndo('Dok-Link gespeichert');if(!curDocId)return;const u=document.getElementById('linkUrl').value.trim();if(u)getActiveClient().docLinks[curDocId]=u;save();closeModal('linkModal');renderDocs();toast('Link gespeichert')}
  pushUndo('Dok-Link gespeichert');
function removeLink(){
  pushUndo('Dok-Link entfernt');if(!curDocId)return;delete getActiveClient().docLinks[curDocId];save();closeModal('linkModal');renderDocs()}
  pushUndo('Dok-Link entfernt');
function openDocLink(id){const u=getActiveClient().docLinks[id];if(u)window.open(u,'_blank');else toast('Noch kein Link konfiguriert')}

// ============================================================
// VIEWS
// ============================================================
function setView(v,el){
  var views=['tasksView','docsView','teamView','insightsView','templatesView'];
  views.forEach(function(id){
    var e=document.getElementById(id);
    if(e){e.style.display='none';e.classList.remove('active');}
  });
  var activeId=v+'View';
currentView=v;
  if(v==='insights') activeId='insightsView';
  var target=document.getElementById(activeId);
  if(target){target.style.display='';target.classList.add('active');}
  document.querySelectorAll('.vtab').forEach(function(t){t.classList.remove('vtab-active');});
  if(el) el.classList.add('vtab-active');
  if(v==='tasks'){document.getElementById('filtersBar').style.display='';renderTasks();}
  else{var fb=document.getElementById('filtersBar');if(fb)fb.style.display='none';}
  if(v==='docs') renderDocs();
  
  if(v==='team') renderTeam();
  if(v==='insights'){renderProcessDashboard();renderTimerReport();}
  var sr=document.getElementById('statsRow');if(sr)sr.style.display=v==='tasks'?'':'none';
  var pb=document.getElementById('progressBar');if(pb)pb.style.display=v==='tasks'?'':'none';
}

function toggleCV(){
  isCV=!isCV;
  const b=document.getElementById('btnCV');
  b.textContent=isCV?'Team-Ansicht':'Kunden-Ansicht';
  b.classList.toggle('on',isCV);
  document.getElementById('content').classList.toggle('client-view',isCV);
  document.getElementById('filtersBar').classList.toggle('client-view',isCV);
  renderDocs();
}

// ============================================================
// FILTERS
// ============================================================


// Filter state: arrays for multi-select
var fOwners = [];
var fStatuses = [];

function toggleFDrop(id){
  const el=document.getElementById(id);
  const panel=el.querySelector('.fdrop-panel');
  const trigger=el.querySelector('.fdrop-trigger');
  const isOpen=panel.classList.contains('open');
  document.querySelectorAll('.fdrop-panel.open').forEach(p=>p.classList.remove('open'));
  document.querySelectorAll('.fdrop-trigger.open').forEach(t=>t.classList.remove('open'));
  if(!isOpen){
    panel.classList.add('open');trigger.classList.add('open');
    setTimeout(()=>{const close=function(e){if(!e.target.closest('.fdrop')){document.querySelectorAll('.fdrop-panel.open').forEach(p=>p.classList.remove('open'));document.querySelectorAll('.fdrop-trigger.open').forEach(t=>t.classList.remove('open'));document.removeEventListener('click',close);}};document.addEventListener('click',close);},10);
  }
}

function toggleFilterItem(type,val){
  const arr=type==='owner'?fOwners:fStatuses;
  const idx=arr.indexOf(val);
  if(idx>-1)arr.splice(idx,1);else arr.push(val);
  renderFilterDropdowns();updateFilterUI();applyFilters();
}

function clearFilter(type){
  if(type==='owner')fOwners=[];else fStatuses=[];
  renderFilterDropdowns();updateFilterUI();applyFilters();
}

function updateFilterUI(){
  const oLabel=document.getElementById('fdOwnerLabel');
  const oTrig=oLabel?oLabel.closest('.fdrop-trigger'):null;
  if(oLabel){oLabel.textContent=fOwners.length?'Owner: '+fOwners.join(', '):'Owner';if(oTrig)oTrig.classList.toggle('has-selection',fOwners.length>0);}
  const sLabel=document.getElementById('fdStatusLabel');
  const sTrig=sLabel?sLabel.closest('.fdrop-trigger'):null;
  if(sLabel){
    const names=fStatuses.map(v=>v==='In Arbeit'?'Aktiv':v==='Warte auf Kunde'?'Wartend':v==='overdue'?'\u00DCberf\u00E4llig':v==='Erledigt'?'Fertig':v);
    sLabel.textContent=fStatuses.length?'Status: '+names.join(', '):'Status';
    if(sTrig)sTrig.classList.toggle('has-selection',fStatuses.length>0);
  }
}

function applyFilters(){
  const q=document.getElementById('searchBox')?document.getElementById('searchBox').value.toLowerCase():'';
  document.querySelectorAll('.task-row').forEach(r=>{
    const t=r.querySelector('.task-text')?r.querySelector('.task-text').textContent.toLowerCase():'';
    const owner=r.dataset.owner||'';
    const status=r.dataset.status||'';
    const isOverdue=r.classList.contains('overdue-row');
    let ownerOK=fOwners.length===0||fOwners.includes(owner);
    let statusOK=true;
    if(fStatuses.length>0){
      const hasOD=fStatuses.includes('overdue');
      const reg=fStatuses.filter(x=>x!=='overdue');
      statusOK=(hasOD&&isOverdue)||(reg.length>0&&reg.includes(status));
      if(!hasOD)statusOK=reg.includes(status);
    }
    r.style.display=((!q||t.includes(q))&&ownerOK&&statusOK)?'':'none';
  });
  const anyFilter=fOwners.length>0||fStatuses.length>0||q;
  document.querySelectorAll('.phase-block').forEach(pb=>{
    let vis=0;pb.querySelectorAll('.task-row').forEach(tr=>{if(tr.style.display!=='none')vis++;});
    pb.style.display=anyFilter?(vis>0?'':'none'):'';
  });
  document.querySelectorAll('.wp-wrap').forEach(cg=>{
    let vis=0;cg.querySelectorAll('.task-row').forEach(tr=>{if(tr.style.display!=='none')vis++;});
    cg.style.display=anyFilter?(vis>0?'':'none'):'';
  });
  var fc=document.getElementById('filterCount');if(fc){var total=document.querySelectorAll('.task-row').length;var shown=[].slice.call(document.querySelectorAll('.task-row')).filter(function(r){return r.style.display!=='none'}).length;if(anyFilter){fc.textContent=shown+'/'+total+' Tasks';fc.classList.add('visible')}else{fc.textContent='';fc.classList.remove('visible')}}
}

// ============================================================
// CALENDAR
// ============================================================
let calData=null;
function openCalModal(id,name,dur){calData={id,name,dur:dur||60};document.getElementById('calTask').textContent=name;document.getElementById('calDur').value=dur||60;const t=new Date();t.setDate(t.getDate()+1);document.getElementById('calDate').value=t.toISOString().split('T')[0];openModal('calModal')}
function addToCal(){
  if(!calData)return;
  const d=document.getElementById('calDate').value,t=document.getElementById('calTime').value,dur=parseInt(document.getElementById('calDur').value)||60;
  const s=new Date(`${d}T${t}`),e=new Date(s.getTime()+dur*6e4);
  const f=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(calData.name)}&dates=${f(s)}/${f(e)}&details=${encodeURIComponent('LaunchRamp â '+getActiveClient().name)}&sf=true&output=xml`,'_blank');
  closeModal('calModal');toast('Calendar geÃ¶ffnet');
}
function setupJourfix(){
  const c=getActiveClient();
  if(!c.jourfix)c.jourfix={};
  const jf=c.jourfix;
  const days=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag'];
  const dayVals=[1,2,3,4,5];
  let dOpts=days.map((d,i)=>`<option value="${dayVals[i]}" ${jf.day==dayVals[i]?'selected':''}>${d}</option>`).join('');
  const cur=jf.time||'15:00';
  const isEdit=!!jf.day;
  const ml=jf.meetLink||'';
  const el=document.createElement('div');
  el.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:9999';
  el.innerHTML=`<div style="background:var(--surface);border-radius:var(--radius);padding:20px;width:340px;max-width:90vw;box-shadow:var(--shadow-lg)">
    <div style="font-size:14px;font-weight:700;margin-bottom:14px">ð ${isEdit?'Jourfix Ã¤ndern':'Jourfix legen'}</div>
    <div style="display:flex;gap:10px;margin-bottom:12px">
      <div style="flex:1"><div style="font-size:10px;color:var(--text3);font-weight:600;margin-bottom:3px">Wochentag</div>
        <select id="jfDay" style="width:100%;padding:7px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;background:var(--surface);color:var(--text)">${dOpts}</select></div>
      <div style="width:100px"><div style="font-size:10px;color:var(--text3);font-weight:600;margin-bottom:3px">Uhrzeit</div>
        <input type="time" id="jfTime" value="${cur}" style="width:100%;padding:7px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;background:var(--surface);color:var(--text)"></div>
    </div>
    <div style="margin-bottom:14px">
      <div style="font-size:10px;color:var(--text3);font-weight:600;margin-bottom:3px">Meeting-Link (optional)</div>
      <input type="url" id="jfMeetLink" value="${esc(ml)}" placeholder="https://meet.google.com/..." style="width:100%;padding:7px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:12px;background:var(--surface);color:var(--text)">
    </div>
    <div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">
      ${isEdit?'<button class="btn danger sm" onclick="removeJourfix(this)" style="margin-right:auto">Entfernen</button>':''}
      <button class="btn sm" onclick="this.closest('div[style*=fixed]').remove()">Abbrechen</button>
      <button class="btn primary sm" onclick="confirmJourfix(this)">Speichern</button>
    </div>
  </div>`;
  document.body.appendChild(el);
}
function confirmJourfix(btn){
  pushUndo('Jourfix gespeichert');
  const c=getActiveClient();
  const day=parseInt(document.getElementById('jfDay').value);
  const time=document.getElementById('jfTime').value||'15:00';
  const meetLink=(document.getElementById('jfMeetLink').value||'').trim();
  const isNew=!(c.jourfix&&c.jourfix.day);
  c.jourfix={day,time,meetLink};
  save();
  btn.closest('div[style*=fixed]').remove();
  renderDocs();
  if(isNew){
    // Neuer Jourfix â Google Calendar Link anbieten
    const dayNames=['','Montag','Dienstag','Mittwoch','Donnerstag','Freitag'];
    const gcalUrl=buildJourfixGcalUrl(c,day,time);
    const confirmEl=document.createElement('div');
    confirmEl.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:9999';
    confirmEl.innerHTML=`<div style="background:var(--surface);border-radius:var(--radius);padding:20px;width:340px;max-width:90vw;box-shadow:var(--shadow-lg);text-align:center">
      <div style="font-size:32px;margin-bottom:8px">â</div>
      <div style="font-size:14px;font-weight:700;margin-bottom:4px">Jourfix gespeichert</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:16px">${dayNames[day]}s um ${time} Uhr</div>
      <div style="display:flex;gap:8px;justify-content:center">
        <button class="btn sm" onclick="this.closest('div[style*=fixed]').remove()">Fertig</button>
        <button class="btn primary sm" onclick="window.open('${gcalUrl}','_blank');this.closest('div[style*=fixed]').remove()">ð In Google Calendar eintragen</button>
      </div>
    </div>`;
    document.body.appendChild(confirmEl);
  }else{
    toast('Jourfix aktualisiert');
  }
}
function buildJourfixGcalUrl(c,day,time){
  const nxt=nextWeekday(day);
  const [h,m]=time.split(':').map(Number);
  const s=new Date(nxt);s.setHours(h,m,0,0);
  const e=new Date(s.getTime()+30*60000);
  const f=d=>d.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
  const gcalDays=['','MO','TU','WE','TH','FR','SA'];
  const title=encodeURIComponent(`${c.name} x Digital Sun Jourfix`);
  const details=encodeURIComponent('WÃ¶chentlicher Jourfix â LaunchRamp');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${f(s)}/${f(e)}&details=${details}&recur=RRULE:FREQ=WEEKLY;BYDAY=${gcalDays[day]}&sf=true&output=xml`;
}
function nextWeekday(targetDay){
  const d=new Date();d.setHours(0,0,0,0);
  const cur=d.getDay();
  let diff=targetDay-cur;
  if(diff<=0)diff+=7;
  d.setDate(d.getDate()+diff);
  return d;
}
function editJFLink(){
  pushUndo('Jourfix-Link bearbeitet');
  const c=getActiveClient();if(!c.jourfix)return;
  const cur=c.jourfix.meetLink||'';
  const v=prompt('Meeting-Link:',cur);
  if(v===null)return;
  c.jourfix.meetLink=v.trim();Bus.emit('docs:changed');
  toast(v.trim()?'Meeting-Link gespeichert':'Meeting-Link entfernt');
}
function removeJourfix(btn){
  pushUndo('Jourfix entfernt');
  if(!confirm('Jourfix wirklich entfernen?'))return;
  getActiveClient().jourfix={};save();
  btn.closest('div[style*=fixed]').remove();
  renderDocs();toast('Jourfix entfernt');
}

// ============================================================
// DASHBOARD
// ============================================================
function getTrackedMins(c,taskId){
  if(!c.timeLog)return 0;
  return Math.round(c.timeLog.filter(e=>e.taskId===taskId).reduce((s,e)=>s+(e.mins||0),0));
}
let timerInterval=null;
function toggleTimer(taskId,evt){
  pushUndo('Timer');
  evt.stopPropagation();
  const c=getActiveClient();
  if(!c.timeLog)c.timeLog=[];
  if(c.activeTimer&&c.activeTimer.taskId===taskId){
    // Stop timer
    const elapsed=Math.round((Date.now()-c.activeTimer.startTime)/60000);
    if(elapsed>0){
      c.timeLog.push({taskId,start:c.activeTimer.startTime,end:Date.now(),mins:elapsed,manual:false});
    }
    c.activeTimer=null;
    if(timerInterval){clearInterval(timerInterval);timerInterval=null}
    Bus.emit('tasks:changed');applyFilters();
    toast(`Timer gestoppt: ${elapsed}m erfasst`);
    logActivity("timer_stop",{task:taskId,duration:elapsed+"m"});
  }else{
    // Stop any running timer first
    if(c.activeTimer){
      const prev=c.activeTimer;
      const elapsed=Math.round((Date.now()-prev.startTime)/60000);
      if(elapsed>0){
        c.timeLog.push({taskId:prev.taskId,start:prev.startTime,end:Date.now(),mins:elapsed,manual:false});
      }
    }
    c.activeTimer={taskId,startTime:Date.now()};
    logActivity("timer_start",{task:taskId});
    if(timerInterval)clearInterval(timerInterval);
    timerInterval=setInterval(()=>{
      // Update running timer display
      const btn=document.querySelector('.timer-btn.running');
      if(btn&&c.activeTimer){
        const el=Math.round((Date.now()-c.activeTimer.startTime)/60000);
        const tracked=getTrackedMins(c,taskId);
        const span=btn.querySelector('.tracked');
        if(span)span.textContent=`${tracked+el}m`;
        else{const s=document.createElement('span');s.className='tracked';s.textContent=`${tracked+el}m`;btn.appendChild(s)}
      }
    },15000);
    Bus.emit('tasks:changed');applyFilters();
    toast('Timer lÃ¤uft');
  }
}
function addManualTime(taskId){
  pushUndo('Zeit hinzugef\u00fcgt');
  const c=getActiveClient();
  if(!c.timeLog)c.timeLog=[];
  const val=prompt('Minuten nachtrÃ¤glich eintragen:','30');
  if(val===null)return;
  const mins=parseInt(val);
  if(isNaN(mins)||mins<=0)return toast('UngÃ¼ltige Eingabe');
  c.timeLog.push({taskId,start:Date.now(),end:Date.now(),mins,manual:true});
  Bus.emit('tasks:changed');applyFilters();
  toast(`${mins}m manuell erfasst`);
}

// ============================================================
// EXPORT
// ============================================================


// ============================================================
// UTILS
// ============================================================
function openModal(id){var el=document.getElementById(id);el.style.display="flex";el.classList.add("show")}
function closeModal(id){var el=document.getElementById(id);el.style.display="none";el.classList.remove("show")}
function toast(m){const e=document.getElementById('toast');e.textContent=m;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2200)}
function nextDay(d){const x=new Date();x.setDate(x.getDate()+((d+7-x.getDay())%7||7));return x.toISOString().split('T')[0]}
function fmtShort(d){if(!d)return'';return new Date(d).toLocaleDateString('de-DE',{day:'numeric',month:'short'})}
function getDueClass(task){if(!task.due)return'';const now=new Date();now.setHours(0,0,0,0);const d=new Date(task.due);d.setHours(0,0,0,0);const diff=(d-now)/86400000;if(diff<0)return'due-overdue';if(diff===0)return'due-today';if(diff<=3)return'due-soon';return'due-normal';}
function getDueBadge(task){if(!task.due)return'';const cls=getDueClass(task);const d=new Date(task.due);const fmt=d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'});return' <span class="due-badge '+cls+'">'+fmt+'</span>';}
function getOverdueDays(task){if(!task.due)return 0;const now=new Date();now.setHours(0,0,0,0);const d=new Date(task.due);d.setHours(0,0,0,0);return Math.max(0,Math.floor((now-d)/86400000));}
function updateOverdueBadge(){const el=document.getElementById('overdueCount');if(el){const c=countOverdue();el.textContent=c>0?c:'';}}

var teamRoles=JSON.parse(localStorage.getItem('launchramp_teamRoles')||'{}');
function getTeamRoles(){return teamRoles;}
function setTeamRole(name,role){teamRoles[name]=role;localStorage.setItem('launchramp_teamRoles',JSON.stringify(teamRoles));}
function getAllOwners(){const owners=new Set();DB.clients.forEach(c=>{c.projects.forEach(p=>{p.phases.forEach(ph=>{ph.packages.forEach(pk=>{pk.tasks.forEach(t=>{if(t.owner)owners.add(t.owner);});});});});});return[...owners].sort();}
function getOwnerStats(owner){let open=0,done=0,plannedMin=0,trackedMin=0,overdue=0,tasks=[];DB.clients.forEach(c=>{c.projects.forEach(p=>{p.phases.forEach((ph,pi)=>{ph.packages.forEach((pk,ki)=>{pk.tasks.forEach((t,ti)=>{if(t.owner===owner){const key=pi+'-'+ki+'-'+ti;const isDone=(t.status&&t.status!=="Offen");tasks.push({task:t,client:c.name,project:p.name,key,isDone});if(isDone)done++;else{open++;if(t.min)plannedMin+=Number(t.min)||0;const logged=(t.timeLog||[]).reduce((s,e)=>s+e.d,0);trackedMin+=logged;if(typeof getDueClass==='function'&&getDueClass(t)==='due-overdue')overdue++;}}});});});});});return{open,done,plannedMin,trackedMin,overdue,tasks};}
function setTRPeriod(p){trPeriod=p;renderTimerReport();}
function getTRRange(){const now=new Date();const y=now.getFullYear(),m=now.getMonth(),d=now.getDay();let start,end=now;if(trPeriod==='week'){start=new Date(now);start.setDate(now.getDate()-d+1);start.setHours(0,0,0,0);}else if(trPeriod==='month'){start=new Date(y,m,1);}else if(trPeriod==='lastMonth'){start=new Date(y,m-1,1);end=new Date(y,m,0,23,59,59);}else if(trPeriod==='year'){start=new Date(y,0,1);}else{start=new Date(y,m,1);}return{start,end};}
function getTimerData(){const{start,end}=getTRRange();const data={};DB.clients.forEach(c=>{c.projects.forEach(p=>{p.phases.forEach((ph,pi)=>{ph.packages.forEach((pk,ki)=>{pk.tasks.forEach((t,ti)=>{if(!t.owner||!t.timeLog||!t.timeLog.length)return;const owner=t.owner;if(!data[owner])data[owner]={total:0,planned:0,clients:{}};if(!data[owner].clients[c.name])data[owner].clients[c.name]={logged:0,planned:0,tasks:[]};const planned=Number(t.min)||0;t.timeLog.forEach(e=>{const ts=new Date(e.ts);if(ts>=start&&ts<=end){data[owner].total+=e.d;data[owner].clients[c.name].logged+=e.d;data[owner].clients[c.name].tasks.push({name:t.t,logged:e.d,date:e.ts});}});data[owner].planned+=planned;data[owner].clients[c.name].planned+=planned;});});});});});return data;}
function exportTimerReportCSV(){const data=getTimerData();let csv='Owner,Kunde,Geloggt_Min,Plan_Min,Compliance_%\n';Object.entries(data).sort().forEach(([owner,d])=>{Object.entries(d.clients).sort().forEach(([client,cd])=>{const comp=cd.planned?Math.round(cd.logged/cd.planned*100):0;csv+='"'+owner+'","'+client+'",'+cd.logged+','+cd.planned+','+comp+'\n';});});const blob=new Blob([csv],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='launchramp-timer-report.csv';a.click();}
function showTemplates(){
  var views=['tasksView','docsView','teamView','insightsView','templatesView'];
  views.forEach(function(id){var e=document.getElementById(id);if(e){e.style.display='none';e.classList.remove('active');}});
  var fb=document.getElementById('filtersBar');if(fb)fb.style.display='none';
  var sr=document.getElementById('statsRow');if(sr)sr.style.display='none';
  var pb=document.getElementById('progressBar');if(pb)pb.style.display='none';
  document.querySelectorAll('.vtab').forEach(function(t){t.classList.remove('vtab-active');});
  var tpl=document.getElementById('templatesView');
  if(tpl){tpl.style.display='';tpl.classList.add('active');}
  renderTemplates();
}
// === M10: Meeting-Export System ===
var MAX_SNAPSHOTS=20;
function migrateUUIDs(){var changed=false;DB.clients.forEach(function(c){
  pushUndo('UUIDs migriert');
if(!c._id){c._id="c_"+Math.random().toString(36).substring(2,10);changed=true;}
c.projects.forEach(function(p){if(!p._id){p._id="p_"+Math.random().toString(36).substring(2,10);changed=true;}
p.phases.forEach(function(ph){if(!ph._id){ph._id="ph_"+Math.random().toString(36).substring(2,10);changed=true;}
ph.packages.forEach(function(pk){if(!pk._id){pk._id="pkg_"+Math.random().toString(36).substring(2,10);changed=true;}
pk.tasks.forEach(function(t){if(!t._id){t._id="t_"+Math.random().toString(36).substring(2,10);changed=true;}});});});});});
if(changed)save();}
function formatDateDE(d){var m=["Jan","Feb","MÃ¤r","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];return d.getDate()+". "+m[d.getMonth()]+" "+d.getFullYear();}
function formatDateShortDE(d){var m=["Jan","Feb","MÃ¤r","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];return d.getDate()+". "+m[d.getMonth()];}
function closeExportModal(){document.getElementById("exportModal").style.display="none";}
function getSelectedExportClients(){return[].slice.call(document.querySelectorAll(".exportClientCb:checked")).map(function(cb){return Number(cb.value);});}
function toggleAllExport(ck){document.querySelectorAll(".exportClientCb").forEach(function(cb){cb.checked=ck;});}
function generateMarkdownExport(ci){var md="";ci.forEach(function(idx,n){var client=DB.clients[idx];if(n>0)md+="\n\n---\n\n";
md+="# Projektstand: "+client.name+"\n";md+="Exportiert: "+formatDateDE(new Date())+"\n";
md+="<!-- client_id: "+(client._id||"")+" -->\n\n";
client.projects.forEach(function(project){var tt=countAllTasks(project);var dt=countDoneTasks(project);var pct=tt>0?Math.round(dt/tt*100):0;
md+="## Projekt: "+project.name+"\n";md+="Typ: "+(project.type||"\u2013")+" | Launch: "+(project.launchDate?formatDateDE(new Date(project.launchDate)):"\u2013")+"\n";
md+="Fortschritt: "+pct+"% ("+dt+"/"+tt+")\n";md+="<!-- project_id: "+(project._id||"")+" -->\n\n";
var tc=0;project.phases.forEach(function(phase,pi){var pe=phase.endDate?formatDateDE(new Date(phase.endDate)):"\u2013";
md+="### PHASE "+(pi+1)+": "+phase.name.toUpperCase()+" (bis "+pe+")\n";md+="<!-- phase_id: "+(phase._id||"")+" -->\n\n";
phase.packages.forEach(function(pkg,pai){var pt=pkg.tasks.length;var pd=pkg.tasks.filter(function(t,ti){return t.status==="Erledigt";}).length;
md+="#### "+pkg.name+" ("+pd+"/"+pt+" erledigt)\n";md+="<!-- package_id: "+(pkg._id||"")+" -->\n\n";
md+="| # | Task | Owner | Aufwand | Status | Deadline | Notizen |\n|---|------|-------|---------|--------|----------|--------|\n";
pkg.tasks.forEach(function(task,ti){tc++;var st=task.status||"Offen";
var auf=task.min?task.min+"m":"\u2013";var dl=task.due?formatDateShortDE(new Date(task.due)):"\u2013";var nt=task.notes||"";
if(task.due&&st!=="Erledigt"){var now=new Date();now.setHours(0,0,0,0);var dd=new Date(task.due);dd.setHours(0,0,0,0);if(dd<now)nt=(nt?nt+" | ":"")+"\u26a0\ufe0f \u00dcberf\u00e4llig";}
md+="| "+(pi+1)+"."+tc+" | "+task.t+" <!-- _id:"+(task._id||"")+" --> | "+(task.owner||"\u2013")+" | "+auf+" | "+st+" | "+dl+" | "+nt+" |\n";});md+="\n";});tc=0;});});});return md;}
function generateJSONExport(ci){return JSON.stringify({exportDate:new Date().toISOString(),version:"1.0",
clients:ci.map(function(idx){var c=DB.clients[idx];return{_id:c._id,name:c.name,projects:c.projects.map(function(p){return{_id:p._id,name:p.name,type:p.type,launchDate:p.launchDate,startDate:p.startDate,
states:Object.assign({},p.states),phases:p.phases.map(function(ph,pi){return{_id:ph._id,name:ph.name,color:ph.color,endDate:ph.endDate,
packages:ph.packages.map(function(pk,pai){return{_id:pk._id,name:pk.name,tasks:pk.tasks.map(function(t,ti){return{_id:t._id,t:t.t,owner:t.owner,min:t.min,due:t.due,notes:t.notes,
status:t.status||"Offen",ki:t.ki,vor:t.vor,auto:t.auto,links:t.links,timeLog:t.timeLog};})};})};})};})};})},null,2);}
function doExport(fmt){var ids=getSelectedExportClients();if(ids.length===0)return alert("Bitte Kunden w\u00e4hlen.");
var cn=ids.length===1?DB.clients[ids[0]].name.toLowerCase().replace(/[^a-z0-9]/g,"-"):"alle-kunden";var ds=new Date().toISOString().split("T")[0];
var content,fn,mime;if(fmt==="md"){content=generateMarkdownExport(ids);fn="projektstand-"+cn+"-"+ds+".md";mime="text/markdown";}
else{content=generateJSONExport(ids);fn="projektstand-"+cn+"-"+ds+".json";mime="application/json";}
var blob=new Blob([content],{type:mime});var url=URL.createObjectURL(blob);var a=document.createElement("a");a.href=url;a.download=fn;document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);closeExportModal();}
var MAX_SNAPSHOTS = 20;
function createSnapshot(clientIndex, trigger) {
  pushUndo('Snapshot erstellt');
  var client = DB.clients[clientIndex];
  if (!client._snapshots) client._snapshots = [];
  var copy = JSON.parse(JSON.stringify(client, function(key, val) { return key === "_snapshots" ? undefined : val; }));
  var snapshot = { id: "snap_" + Date.now(), timestamp: new Date().toISOString(), trigger: trigger, data: copy };
  client._snapshots.unshift(snapshot);
  if (client._snapshots.length > MAX_SNAPSHOTS) client._snapshots = client._snapshots.slice(0, MAX_SNAPSHOTS);
  save(); return snapshot.id;
}
function restoreSnapshot(clientIndex, snapshotId) {
  pushUndo('Snapshot wiederhergestellt');
  var client = DB.clients[clientIndex]; var snapshots = client._snapshots || [];
  var snap = snapshots.find(function(s) { return s.id === snapshotId; });
  if (!snap) return false;
  createSnapshot(clientIndex, "Backup vor Wiederherstellung");
  var preserved = client._snapshots; Object.assign(client, snap.data); client._snapshots = preserved;
  Bus.emit('data:changed'); return true;
}
function openSnapshotModal() {
  var client = DB.clients.find(function(c){return c.id===DB.activeClient}); var snaps = client._snapshots || [];
  var h = "<h3>ð Versionshistorie â " + esc(client.name) + "</h3>";
  if (snaps.length === 0) { h += "<p style=\"color:var(--dim)\">Noch keine Snapshots. Werden automatisch vor jedem Import erstellt.</p>"; }
  else { h += "<div class=\"snapshot-list\">"; snaps.forEach(function(snap) {
    var d = new Date(snap.timestamp); var ds = formatDateDE(d) + ", " + String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
    h += "<div class=\"snapshot-item\"><div><strong>ð¸ " + ds + "</strong><br><span style=\"color:var(--dim);font-size:0.85rem\">" + esc(snap.trigger) + "</span></div>";
    h += "<div style=\"display:flex;gap:0.5rem\"><button onclick=\"if(confirm('Wiederherstellen? Aktueller Stand wird vorher als Backup gespeichert.'))restoreSnapshot(" + DB.activeClient + ",'" +(snap.id||'')+ "')\" class=\"btn btn-sm\" style=\"background:var(--red)\">â©ï¸ Wiederherstellen</button></div></div>";
  }); h += "</div>"; }
  document.getElementById("snapshotModal").querySelector(".modal-content").innerHTML = h;
  openModal("snapshotModal");
}
function openImportModal() { document.getElementById("importFileInput").value = ""; document.getElementById("importModal").querySelector(".modal-content").innerHTML = "<h3>ð¥ Meeting-Update importieren</h3><p>JSON-Datei hochladen die von Claude erstellt wurde:</p><input type=\"file\" id=\"importFileInput\" accept=\".json\" onchange=\"handleImportFile(this)\" style=\"margin:1rem 0\"><div id=\"importStatus\"></div>"; openModal("importModal"); }
function handleImportFile(input) {
  var file = input.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var importData = JSON.parse(e.target.result);
      if (!importData.clients || !importData.clients.length) { document.getElementById("importStatus").innerHTML = "<p style=\"color:var(--red)\">â UngÃ¼ltige Datei: Kein clients-Array gefunden.</p>"; return; }
      var changes = computeDiff(importData);
      if (changes.length === 0) { document.getElementById("importStatus").innerHTML = "<p style=\"color:var(--green)\">â Keine Ãnderungen erkannt. Der Stand ist identisch.</p>"; return; }
      window._pendingImport = { data: importData, changes: changes };
      closeModal("importModal"); renderDiffReview(changes);
    } catch(err) { document.getElementById("importStatus").innerHTML = "<p style=\"color:var(--red)\">â JSON Parse-Fehler: " + esc(err.message) + "</p>"; }
  };
  reader.readAsText(file);
}
// findTaskKey - returns "phaseIdx-pkgIdx-taskIdx" for a given taskId
function findTaskKey(project, taskId) {
  for (var pi = 0; pi < project.phases.length; pi++) {
    var ph = project.phases[pi];
    for (var pai = 0; pai < ph.packages.length; pai++) {
      var pk = ph.packages[pai];
      for (var ti = 0; ti < pk.tasks.length; ti++) {
        if (pk.tasks[ti]._id === taskId) {
          return pi + '-' + pai + '-' + ti;
        }
      }
    }
  }
  return null;
}
function computeDiff(importData) {
  var changes = [];
  importData.clients.forEach(function(ic) {
    var cc = DB.clients.find(function(c) { return c._id === ic._id; });
    if (!cc) { changes.push({ type: "new_client", severity: "red", data: ic }); return; }
    (ic.projects || []).forEach(function(ip) {
      var cp = cc.projects.find(function(p) { return p._id === ip._id; });
      if (!cp) { changes.push({ type: "new_project", severity: "red", client: cc.name, data: ip }); return; }
      (ip.phases || []).forEach(function(iph) {
        var cph = cp.phases.find(function(ph) { return ph._id === iph._id; });
        if (!cph) { changes.push({ type: "new_phase", severity: "red", project: cp.name, data: iph }); return; }
        if (iph.name !== cph.name) changes.push({ type: "rename_phase", severity: "yellow", phase: cph.name, newName: iph.name, _ref: cph });
        (iph.packages || []).forEach(function(ipk) {
          var cpk = cph.packages.find(function(pk) { return pk._id === ipk._id; });
          if (!cpk) { changes.push({ type: "new_package", severity: "yellow", phase: cph.name, data: ipk }); return; }
          (ipk.tasks || []).forEach(function(it) {
            var ct = cpk.tasks.find(function(t) { return t._id === it._id; });
            if (!ct) { changes.push({ type: "new_task", severity: "yellow", phase: cph.name, package: cpk.name, data: it }); return; }
            var stKey = findTaskKey(cp, ct._id);
            var curSt = ct.status || "Offen";
            if (it.status && it.status !== curSt) changes.push({ type: "status_change", severity: "green", task: ct.t, _id: ct._id, oldStatus: curSt, newStatus: it.status, _project: cp, _stKey: stKey });
            if (it.due !== undefined && it.due !== ct.due) changes.push({ type: "deadline_change", severity: "yellow", task: ct.t, _id: ct._id, oldDeadline: ct.due, newDeadline: it.due, _task: ct });
            if (it.owner !== undefined && it.owner !== ct.owner) changes.push({ type: "owner_change", severity: "yellow", task: ct.t, _id: ct._id, oldOwner: ct.owner, newOwner: it.owner, _task: ct });
            if (it.t !== undefined && it.t !== ct.t) changes.push({ type: "rename_task", severity: "green", task: ct.t, _id: ct._id, newName: it.t, _task: ct });
            if (it.notes !== undefined && it.notes !== ct.notes) changes.push({ type: "notes_change", severity: "green", task: ct.t, _id: ct._id, oldNotes: ct.notes, newNotes: it.notes, _task: ct });
            if (it.min !== undefined && it.min !== ct.min) changes.push({ type: "effort_change", severity: "green", task: ct.t, _id: ct._id, oldMin: ct.min, newMin: it.min, _task: ct });
          });
          cpk.tasks.forEach(function(ct) { var still = ipk.tasks.find(function(t) { return t._id === ct._id; }); if (!still) changes.push({ type: "delete_task", severity: "red", task: ct.t, _id: ct._id, phase: cph.name, package: cpk.name }); });
        });
      });
    });
  });
  return changes;
}
function checkAllGreen() { document.querySelectorAll("#diffModal .diff-green input[type=checkbox]").forEach(function(cb) { cb.checked = true; }); }
function applySelectedChanges() {
  pushUndo('\u00c4nderungen angewendet');
  var checks = document.querySelectorAll("#diffModal input[type=checkbox]:checked");
  var indices = []; checks.forEach(function(cb) { indices.push(parseInt(cb.dataset.idx)); });
  if (indices.length === 0) { alert("Keine Ãnderungen ausgewÃ¤hlt."); return; }
  var changes = window._pendingImport.changes;
  var clientIdx = DB.clients.findIndex(function(c) { return c._id === window._pendingImport.data.clients[0]._id; });
  if (clientIdx >= 0) createSnapshot(clientIdx, "Backup vor Import (" + indices.length + " Ãnderungen)");
  var applied = 0;
  indices.forEach(function(i) {
    var c = changes[i]; if (!c) return;
    if (c.type === "status_change" && c._project && c._stKey) { if (!c._project.states) c._project.states = {}; c._project.states[c._stKey] = c.newStatus; var _pts=c._stKey.split("-");if(c._project.phases[_pts[0]]&&c._project.phases[_pts[0]].packages[_pts[1]]&&c._project.phases[_pts[0]].packages[_pts[1]].tasks[_pts[2]]){c._project.phases[_pts[0]].packages[_pts[1]].tasks[_pts[2]].status=c.newStatus;} applied++; }
    else if (c.type === "deadline_change" && c._task) { c._task.due = c.newDeadline; applied++; }
    else if (c.type === "owner_change" && c._task) { c._task.owner = c.newOwner; applied++; }
    else if (c.type === "rename_task" && c._task) { c._task.t = c.newName; applied++; }
    else if (c.type === "notes_change" && c._task) { c._task.notes = c.newNotes; applied++; }
    else if (c.type === "effort_change" && c._task) { c._task.min = c.newMin; applied++; }
    else if (c.type === "new_task") {
      var ic = window._pendingImport.data.clients.find(function(x) { return DB.clients.find(function(cc) { return cc._id === x._id; }); });
      if (ic) { var cc = DB.clients.find(function(x) { return x._id === ic._id; });
        ic.projects.forEach(function(ip) { var cp = cc.projects.find(function(p) { return p._id === ip._id; }); if (!cp) return;
          ip.phases.forEach(function(iph) { var cph = cp.phases.find(function(ph) { return ph._id === iph._id; }); if (!cph) return;
            iph.packages.forEach(function(ipk) { var cpk = cph.packages.find(function(pk) { return pk._id === ipk._id; }); if (!cpk) return;
              ipk.tasks.forEach(function(it) { if (it._id === c.data._id) { var nt = { t: it.t || it.text, min: it.min || 60, due: it.due || "", owner: it.owner || "", notes: it.notes || "", _id: genId("t") }; cpk.tasks.push(nt); applied++; }
              });
            });
          });
        });
      }
    }
  });
  Bus.emit('data:changed'); closeModal("diffModal");
  var notifs = generateNotifications(changes, indices);
  if (notifs && notifs.length) { openNotifModal(notifs); }
  else { showToast("â " + applied + " Ãnderungen Ã¼bernommen"); }
  window._pendingImport = null;
}
function generateNotifications(changes, appliedIndices) {
  var byOwner = {};
  appliedIndices.forEach(function(i) {
    var c = changes[i]; if (!c) return;
    var owner = "";
    if (c._task) owner = c._task.owner || "";
    else if (c.data && c.data.owner) owner = c.data.owner;
    if (!owner) return;
    if (!byOwner[owner]) byOwner[owner] = [];
    var msg = "";
    if (c.type === "status_change") msg = "Status: " + (c.task||"") + " â " + c.newStatus;
    else if (c.type === "deadline_change") msg = "Deadline: " + (c.task||"") + " â " + (c.newDeadline||"entfernt");
    else if (c.type === "owner_change") msg = "Du bist jetzt Owner: " + (c.task||"");
    else if (c.type === "new_task") msg = "Neuer Task: " + (c.data.t || c.data.text || "");
    else if (c.type === "notes_change") msg = "Notiz aktualisiert: " + (c.task||"");
    else if (c.type === "rename_task") msg = "Umbenannt: " + (c.task||"") + " â " + (c.newName||"");
    else if (c.type === "effort_change") msg = "Aufwand geÃ¤ndert: " + (c.task||"");
    else return;
    byOwner[owner].push(msg);
  });
  var result = [];
  Object.keys(byOwner).forEach(function(owner) {
    var lines = "Meeting-Update " + formatDateDE(new Date()) + ":\n";
    byOwner[owner].forEach(function(m) { lines += "â¢ " + m + "\n"; });
    result.push({ owner: owner, count: byOwner[owner].length, text: lines });
  });
  return result;
}
function openNotifModal(notifs) {
    notifs = notifs || DB.notifications || [];
  var h = "<h3>ð¬ Team-Updates nach Import</h3>";
  notifs.forEach(function(n, i) {
    h += "<div style=\"margin:1rem 0;padding:1rem;background:var(--bg2);border-radius:8px\">";
    h += "<strong>ð¤ " + esc(n.owner) + " (" + n.count + " Ãnderungen)</strong>";
    h += "<pre id=\"notif_" + i + "\" style=\"margin:0.5rem 0;white-space:pre-wrap;font-size:0.85rem\">" + esc(n.text) + "</pre>";
    h += "<button onclick=\"copyNotif(" + i + ")\" class=\"btn btn-sm\">ð Kopieren</button>";
    h += "</div>";
  });
  h += "<div style=\"display:flex;gap:1rem;margin-top:1rem\"><button onclick=\"copyAllNotifs()\" class=\"btn btn-sm\">ð Alle kopieren</button>";
  h += "<button onclick=\"closeModal('notifModal')\" class=\"btn btn-sm\">â­ï¸ Fertig</button></div>";
  window._notifData = notifs;
  document.getElementById("notifModal").querySelector(".modal-content").innerHTML = h;
  openModal("notifModal");
}
function copyNotif(i) {
  var el = document.getElementById("notif_" + i);
  if (el) { navigator.clipboard.writeText(el.textContent).then(function() { showToast("ð Kopiert!"); }); }
}
function copyAllNotifs() {
  if (!window._notifData) return;
  var all = window._notifData.map(function(n) { return "--- " + n.owner + " ---\n" + n.text; }).join("\n\n");
  navigator.clipboard.writeText(all).then(function() { showToast("ð Alle kopiert!"); });
}
function showToast(msg) { var el = document.getElementById("notifToast"); if(!el) return; el.textContent = msg; el.style.display = "block"; setTimeout(function() { el.style.display = "none"; }, 3000); }
setTimeout(function() { if (typeof migrateUUIDs === "function") migrateUUIDs(); }, 2000);


function runSmokeTests(){
  var results=[];var pass=0;var fail=0;
  function assert(name,condition,detail){
    if(condition){pass++;results.push("PASS: "+name)}
    else{fail++;results.push("FAIL: "+name+(detail?" â "+detail:""))}
  }
  var c=getActiveClient();

  // 1. FUNCTION EXISTENCE (40 core functions)
  var coreFns=["getActiveClient","save","renderAll","toast","esc","cycle","setSt",
    "toggleTimer","getTrackedMins","renderTasks","renderTaskRowHtml","renderPhaseHeaderHtml",
    "renderPackageHeaderHtml","renderDashboard","setView","toggleP","toggleW",
    "editPhase","duplicatePhase","deletePhaseInline","openAddPackage","openAddTask",
    "editTask","editDeadline","setOwner","editTaskLink","editTaskTime",
    "defaultPhases","migrateStatesToTasks","getTaskStatus","setTaskStatus",
    "resolvePhaseIdx","resolvePkgIdx","resolveTaskIdx","resolveTaskById",
    "rebuildStates","phasePct","dbg","logActivity","countDoneTasks"];
  coreFns.forEach(function(fn){
    assert("fn:"+fn, typeof window[fn]==="function");
  });

  // 2. DATA MODEL INTEGRITY
  assert("data:client", !!c);
  if(c){
    assert("data:phases", Array.isArray(c.phases)&&c.phases.length>0);
    assert("data:phase_count", c.phases.length===8, "expected 8, got "+c.phases.length);
    var tt=0;var mId=0;var mSt=0;
    c.phases.forEach(function(ph){
      assert("data:ph_id", !!ph._id);
      assert("data:ph_name", !!ph.name);
      assert("data:ph_pkgs", Array.isArray(ph.packages)&&ph.packages.length>0);
      ph.packages.forEach(function(pkg){
        assert("data:pkg_id", !!pkg._id);
        pkg.tasks.forEach(function(t){ tt++; if(!t._id)mId++; if(!t.status)mSt++; });
      });
    });
    assert("data:task_count", tt===75, "expected 75, got "+tt);
    assert("data:all_ids", mId===0, mId+" tasks missing _id");
    assert("data:all_status", mSt===0, mSt+" tasks missing status");
  }

  // 3. RESOLVER FUNCTIONS
  if(c&&c.phases.length>0){
    var fp=c.phases[0];var fpk=fp.packages[0];var ft=fpk.tasks[0];
    assert("res:phIdx", resolvePhaseIdx(c,fp._id)===0);
    assert("res:pkIdx", resolvePkgIdx(fp,fpk._id)===0);
    assert("res:tIdx", resolveTaskIdx(fpk,ft._id)===0);
    var r=resolveTaskById(c,ft._id);
    assert("res:byId", !!r);
    if(r){
      assert("res:pi", r.pi===0);
      assert("res:pai", r.pai===0);
      assert("res:ti", r.ti===0);
      assert("res:ref", r.task===ft);
    }
    assert("res:bad_ph", resolvePhaseIdx(c,"NONEXISTENT")===-1);
    assert("res:bad_t", resolveTaskById(c,"NONEXISTENT")===null);
  }

  // 4. STATUS ROUNDTRIP (using _id strings)
  if(c&&c.phases.length>0){
    var task0=c.phases[0].packages[0].tasks[0];
    var orig=task0.status;var tId=task0._id;
    var phId=c.phases[0]._id;var pkId=c.phases[0].packages[0]._id;
    setTaskStatus(c,phId,pkId,tId,"In Arbeit");
    assert("st:set", task0.status==="In Arbeit", "got "+task0.status);
    var rb=getTaskStatus(c,phId,pkId,tId);
    assert("st:get", rb==="In Arbeit", "got "+rb);
    setTaskStatus(c,phId,pkId,tId,orig);
    assert("st:restore", task0.status===orig);
  }

  // 5. ESC() HTML ESCAPING
  assert("esc:html", esc("<b>x</b>")==="&lt;b&gt;x&lt;/b&gt;");
  assert("esc:amp", esc("A&B").indexOf("&amp;")!==-1);
  assert("esc:empty", esc("")==="");

  // 6. PHASEPCT
  if(c&&c.phases.length>0){
    var pct=phasePct(c,0);
    assert("pct:num", typeof pct==="number");
    assert("pct:range", pct>=0&&pct<=100, "got "+pct);
  }

  // 7. DEFAULT PHASES
  var dp=defaultPhases();
  assert("def:arr", Array.isArray(dp));
  assert("def:len", dp.length>0);
  assert("def:clone", dp!==defaultPhases());
  if(dp.length>0){
    assert("def:name", !!dp[0].name);
    assert("def:pkgs", Array.isArray(dp[0].packages));
  }

  // 8. GLOBALS (View, Debounce, Debug)
  assert("view:exists", typeof currentView==="string");
  assert("view:valid", ["tasks","docs","team","insights","templates"].indexOf(currentView)!==-1);
  assert("saveNow", typeof saveNow==="function");
  assert("DEBUG", typeof DEBUG!=="undefined");
  assert("dbg", typeof dbg==="function");

  // SUMMARY
  var summary="\n=== SMOKE TEST RESULTS ===\n";
  summary+="PASS: "+pass+" / FAIL: "+fail+" / TOTAL: "+(pass+fail)+"\n";
  if(fail>0){summary+="\nFAILURES:\n";results.forEach(function(r){if(r.indexOf("FAIL")===0)summary+=r+"\n"});}
  summary+="========================\n";
  console.warn(summary);
  return {pass:pass,fail:fail,total:pass+fail,results:results,summary:summary};
}

// === S-1: Event-Bus Subscriptions ===
Bus.on('data:changed', function() { renderAll(); save(); });
Bus.on('tasks:changed', function() { Bus.emit('data:changed'); });
Bus.on('docs:changed', function() { Bus.emit('data:changed'); });

// === INIT (moved from config.js â runs after all scripts loaded) ===
// INIT
load();
// Auto-open first phase and all its packages
openPhases.add(0);
const firstClient=getActiveClient();
if(firstClient&&firstClient.phases[0]){
  firstClient.phases[0].packages.forEach((_,pai)=>openPackages.add(`0_${pai}`));
}
renderAll();
