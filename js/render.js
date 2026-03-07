function renderTemplateEditor(tpl){
  let h="<div class=\"tpl-editor\">";
  h+="<div class=\"tpl-toolbar\">";
  h+="<input class=\"tpl-name-input\" value=\""+esc(tpl.name)+"\" onchange=\"tplRename('"+tpl.id+"',this.value)\" />";
  h+="<button onclick=\"duplicateTemplate('"+tpl.id+"')\" title=\"Duplizieren\">📋 Duplizieren</button>";
  h+="<button onclick=\"tplAddPhase('"+tpl.id+"')\" title=\"Phase hinzufügen\">＋ Phase</button>";
  h+="<button class=\"danger\" onclick=\"deleteTemplate('"+tpl.id+"')\" title=\"Löschen\">🗑 Löschen</button>";
  h+="</div>";
  const phases=tpl.data&&tpl.data.phases?tpl.data.phases:[];
  for(let pi=0;pi<phases.length;pi++){
    const ph=phases[pi];
    h+="<div class=\"tpl-phase\">";
    h+="<div class=\"tpl-phase-header\" onclick=\"tplTogglePhase(this)\">";
    h+="<span class=\"arrow\">▶</span>";
    h+="<input value=\""+esc(ph.name||ph.phase||"")+"\" onclick=\"event.stopPropagation()\" onchange=\"tplEditPhase('"+tpl.id+"',"+pi+",this.value)\" style=\"flex:1;background:transparent;border:1px solid transparent;color:inherit;font-weight:600;font-size:13px;padding:2px 4px;border-radius:4px\" />";
    h+="<button class=\"tpl-del\" onclick=\"event.stopPropagation();tplDelPhase('"+tpl.id+"',"+pi+")\" title=\"Phase löschen\">✕</button>";
    h+="</div>";
    h+="<div class=\"tpl-phase-body\">";
    const pkgs=ph.packages||[];
    for(let ki=0;ki<pkgs.length;ki++){
      const pk=pkgs[ki];
      h+="<div class=\"tpl-pkg\">";
      h+="<div class=\"tpl-pkg-header\">";
      h+="<input value=\""+esc(pk.name||pk.package||"")+"\" onchange=\"tplEditPkg('"+tpl.id+"',"+pi+","+ki+",this.value)\" style=\"flex:1;background:transparent;border:1px solid transparent;color:inherit;font-weight:600;font-size:12px;padding:2px 4px;border-radius:4px\" />";
      h+="<button class=\"tpl-del\" onclick=\"tplDelPkg('"+tpl.id+"',"+pi+","+ki+")\" title=\"Package löschen\">✕</button>";
      h+="</div>";
      const tasks=pk.tasks||[];
      for(let ti=0;ti<tasks.length;ti++){
        const tk=tasks[ti];
        h+="<div class=\"tpl-task\">";
        h+="<input value=\""+esc(tk.t||tk.name||tk.task||"")+"\" onchange=\"tplEditTask('"+tpl.id+"',"+pi+","+ki+","+ti+",'name',this.value)\" placeholder=\"Task-Name\" />";
        h+="<input value=\""+esc(tk.owner||"")+"\" onchange=\"tplEditTask('"+tpl.id+"',"+pi+","+ki+","+ti+",'owner',this.value)\" placeholder=\"Owner\" style=\"text-align:center\" />";
        h+="<input type=\"number\" value=\""+(tk.min||tk.planzeit||tk.plan||0)+"\" onchange=\"tplEditTask('"+tpl.id+"',"+pi+","+ki+","+ti+",'planzeit',+this.value)\" style=\"text-align:center\" title=\"Planzeit (min)\" />";
        h+="<button class=\"tpl-del\" onclick=\"tplDelTask('"+tpl.id+"',"+pi+","+ki+","+ti+")\" title=\"Task löschen\">✕</button>";
        h+="</div>";
      }
      h+="<button class=\"tpl-add-btn\" onclick=\"tplAddTask('"+tpl.id+"',"+pi+","+ki+")\" >＋ Task</button>";
      h+="</div>";
    }
    h+="<button class=\"tpl-add-btn\" onclick=\"tplAddPkg('"+tpl.id+"',"+pi+")\" style=\"margin-top:4px\">＋ Package</button>";
    h+="</div></div>";
  }
  h+="</div>";
  return h;
}

function renderProcessDashboard(){
  const el = document.getElementById("processView");
  if(!el) return;
  const m = calcProcessMetrics();
  if(!m){ el.innerHTML='<div class="pi-empty">Kein aktives Projekt ausgewählt.</div>'; return; }
  let h = '<div class="pi-dash">';
  h += '<div class="pi-controls">';
  h += '<span style="font-weight:600;font-size:15px">📊 Process Intelligence – '+m.projName+'</span>';
  ["all","month","quarter"].forEach(p=>{
    const label = p==="all"?"Gesamt":p==="month"?"Letzter Monat":"Letztes Quartal";
    h += '<button class="pi-period' + (piPeriod===p?" active":"") + '" onclick="piPeriod=\''+p+'\';renderProcessDashboard()">'+label+'</button>';
  });
  h += '<button class="pi-export-btn" onclick="exportProcessReport()">📋 Export</button>';
  h += '</div>';
  // KPI cards
  h += '<div class="pi-cards">';
  h += '<div class="pi-card"><small>Tasks gesamt</small><h3>'+m.totalTasks+'</h3></div>';
  h += '<div class="pi-card"><small>Plan (min)</small><h3>'+m.totalPlan+'</h3></div>';
  h += '<div class="pi-card"><small>Ist (min)</small><h3>'+m.totalIst+'</h3></div>';
  const effColor = m.efficiency<=100?"#4ade80":m.efficiency<=130?"#f87171":"#f87171";
  h += '<div class="pi-card"><small>Effizienz</small><h3 style="color:'+effColor+'">'+m.efficiency+'%</h3></div>';
  h += '<div class="pi-card"><small>Verwahrloste Tasks</small><h3 style="color:#fbbf24">'+m.tasksNoOwner+'</h3></div>';
  h += '</div>';
  // Tables
  if(m.overPlan.length){
    h += '<div class="pi-section"><h3>⚠️ Über-Plan Tasks</h3>';
    h += '<table class="pi-table"><tr><th>Task</th><th>Phase</th><th>Owner</th><th>Plan</th><th>Ist</th><th>Diff</th><th>%</th><th></th></tr>';
    m.overPlan.forEach(t=>{
      h += '<tr><td>'+t.task+'</td><td>'+t.phase+'</td><td>'+t.owner+'</td><td>'+t.plan+'</td><td class="'+piColorClass(t.pct)+'">'+t.ist+'</td><td class="pi-red">+'+t.diff+'</td><td class="'+piColorClass(t.pct)+'">'+t.pct+'%</td><td>'+piBar(t.ist,t.plan)+'</td></tr>';
    });
    h += '</table></div>';
  }
  if(m.underPlan.length){
    h += '<div class="pi-section"><h3>✅ Effiziente Tasks</h3>';
    h += '<table class="pi-table"><tr><th>Task</th><th>Phase</th><th>Owner</th><th>Plan</th><th>Ist</th><th>Gespart</th><th>%</th><th></th></tr>';
    m.underPlan.forEach(t=>{
      h += '<tr><td>'+t.task+'</td><td>'+t.phase+'</td><td>'+t.owner+'</td><td>'+t.plan+'</td><td class="pi-green">'+t.ist+'</td><td class="pi-green">-'+t.diff+'</td><td class="pi-green">'+t.pct+'%</td><td>'+piBar(t.ist,t.plan)+'</td></tr>';
    });
    h += '</table></div>';
  }
  if(m.ownerList.length){
    h += '<div class="pi-section"><h3>👥 Mitarbeiter-Auslastung</h3>';
    h += '<table class="pi-table"><tr><th>Mitarbeiter</th><th>Tasks</th><th>Plan (min)</th><th>Ist (min)</th><th>Effizienz</th><th></th></tr>';
    m.ownerList.forEach(o=>{
      const eff = o.plan>0?Math.round(o.ist/o.plan*100):0;
      h += '<tr><td>'+o.name+'</td><td>'+o.tasks+'</td><td>'+o.plan+'</td><td>'+o.ist+'</td><td class="'+piColorClass(eff)+'">'+eff+'%</td><td>'+piBar(o.ist,o.plan)+'</td></tr>';
    });
    h += '</table></div>';
  }
  if(m.noOwner.length){
    h += '<div class="pi-section"><h3>⏱️ Verwahrloste Tasks (ohne Owner)</h3>';
    h += '<table class="pi-table"><tr><th>Task</th><th>Phase</th><th>Owner zuweisen</th></tr>';
    var _ow=getAllOwners(); m.noOwner.slice(0,20).forEach(t=>{ var op='<option value="">-- zuweisen --<\/option>'; _ow.forEach(o=>{ op+='<option>'+o+'<\/option>'; }); h+='<tr><td>'+t.task+'<\/td><td>'+t.phase+'<\/td><td><select onchange="assignOwnerFromInsights(this.value,\''+t.path+'\')" style="background:var(--card);color:var(--fg);border:1px solid var(--border);border-radius:4px;padding:2px 6px">'+op+'<\/select><\/td><\/tr>'; });
    if(m.noOwner.length>20) h += '<tr><td colspan="3" style="color:var(--dim)">... und '+(m.noOwner.length-20)+' weitere</td></tr>';
    h += '</table></div>';
  }
  if(!m.overPlan.length && !m.underPlan.length && !m.noOwner.length){
    h += '<div class="pi-empty">Alle Tasks haben einen Owner - super!<br></div>';
  }
  h += '</div>';
  el.innerHTML = h;
}

function renderAll(){
try{

  renderSidebar();
  const dv=document.getElementById('dashboardView');
  const cv=document.getElementById('clientView');
  if(dashboardActive){
    dv.classList.add('active');
    cv.classList.add('hidden');
    renderDashboard();
    // Deselect in sidebar
    document.querySelectorAll('.client-item').forEach(el=>el.classList.remove('active'));
  }else{
    dv.classList.remove('active');
    cv.classList.remove('hidden');
    renderTopbar();renderStats();renderCountdown();
if(currentView==='tasks'){renderTasks();renderMiniTimeline();renderFilterDropdowns();applyFilters();}
else if(currentView==='docs'){renderDocs();}
else if(currentView==='team'){renderTeam();}
else if(currentView==='insights'){renderProcessDashboard();renderTimerReport();}
else if(currentView==='templates'){renderTemplates();}
    var tpl=document.getElementById('templatesView');if(tpl){tpl.style.display='none';tpl.classList.remove('active');}
    var sr=document.getElementById('statsRow');if(sr)sr.style.display='';
    var pb=document.getElementById('progressBar');if(pb)pb.style.display='';
  }

}catch(e){console.warn("[renderAll Error]",e);toast("Fehler in renderAll: "+e.message,"error");}
}

function renderSidebar(){
  if(typeof updateOverdueBadge==='function')updateOverdueBadge();
  const el=document.getElementById('clientList');
  el.innerHTML=DB.clients.map(c=>{
    const isExpanded=expandedClients.has(c.id);
    const isActive=c.id===DB.activeClient;
    const totalPct=clientPct(c);
    const arrow=isExpanded?'▾':'▸';
    let h=`<div class="ci-group${isActive?' ci-group-active':''}">
      <div class="client-item${isActive&&!isExpanded?' active':''}" onclick="toggleClientExpand('${c.id}',event)">
        <span class="ci-arrow" style="font-size:10px;margin-right:4px;color:var(--text3)">${arrow}</span>
        <span class="ci-name" ondblclick="event.stopPropagation();renameClientInline('${c.id}')">${esc(c.name)}</span>
        <span class="ci-pct">${totalPct}%</span>
        <span class="ci-del" onclick="delClient('${c.id}',event)">✕</span>
      </div>`;
    if(isExpanded){
      h+=`<div class="ci-projects">`;
      c.projects.forEach(proj=>{
        const pPct=projectPct(proj);
        const isActiveProj=proj.id===DB.activeProject&&isActive;
        const isCompleted=proj.completed;
        const typeIcon=proj.type==='retainer'?'🔄':proj.type==='empty'?'📝':'🚀';
        h+=`<div class="proj-item${isActiveProj?' active':''}${isCompleted?' completed':''}" onclick="switchProject('${c.id}','${proj.id}',event)">
          <span style="font-size:10px;margin-right:3px">${typeIcon}</span>
          <span class="proj-name">${esc(proj.name)}</span>
          <span class="proj-pct">${pPct}%</span>
          <span class="proj-del" onclick="delProject('${c.id}','${proj.id}',event)">✕</span>
        </div>`;
      });
      h+=`<div class="proj-add" onclick="addProject('${c.id}')">+ Projekt</div>`;
      h+=`</div>`;
    }
    h+=`</div>`;
    return h;
  }).join('');
}
function renderTopbar(){
  const c=getActiveClient(); // active project
  const client=AC(); // active client
  const projLabel=client?client.name+' → '+c.name:c.name;
  document.getElementById('clientTitle').textContent=projLabel;
  document.title=`LaunchRamp – ${projLabel}`;
  document.getElementById('launchDate').value=c.launchDate||'';
  if(!c.startDate)c.startDate=c.phases[0]?.startDate||new Date().toISOString().split('T')[0];
  document.getElementById('startDate').value=c.startDate;
  const ql=c.quickLinks||{};
  const qd=[
    {key:'homepage',label:'Homepage',icon:'🌐'},
    {key:'instagram',label:'Instagram',icon:'📸'},
    {key:'linkedin',label:'LinkedIn',icon:'💼'},
    {key:'gdrive',label:'Google Drive',icon:'📁'},
    {key:'claude',label:'Claude Projekt',icon:'🤖'}
  ];
  if(c.customLinks)c.customLinks.forEach((cl,i)=>qd.push({key:'custom_'+i,label:cl.label,icon:'🔗',custom:true,idx:i}));
  const setCount=qd.filter(q=>q.custom?true:!!(ql[q.key])).length - (c.customLinks?c.customLinks.length:0) + (c.customLinks||[]).length;
  const activeCount=qd.filter(q=>q.custom?(c.customLinks[q.idx]||{}).url:ql[q.key]).length;
  document.getElementById('linkCount').textContent=activeCount;
  document.getElementById('linkPanel').innerHTML='<h4>Projekt-Links</h4>'+qd.map(q=>{
    const url=q.custom?(c.customLinks[q.idx]||{}).url:ql[q.key]||'';
    const cls=url?'set':'unset';
    return '<div class="link-item '+cls+'" onclick="'+(url?"window.open(\'"+esc(url)+"\',\'_blank\')":"editQuickLink(\'"+(q.custom?"custom_"+q.idx:q.key)+"\')")+'"><span class="li-icon">'+q.icon+'</span><span class="li-label">'+esc(q.label)+'</span><span class="li-status">'+(url?'✓ Aktiv':'Nicht gesetzt')+'</span></div>';
  }).join('')+'<div class="link-add" onclick="addCustomLink()"><span>+</span><span>Link hinzufügen</span></div>'
}
function renderCountdown(){
  const c=getActiveClient(),diff=Math.ceil((new Date(c.launchDate)-new Date())/864e5),el=document.getElementById('countdown');
  if(diff>14){el.textContent=diff+' Tage';el.style.cssText='background:var(--surface2);color:var(--text2)'}
  else if(diff>7){el.textContent=diff+' Tage';el.style.cssText='background:var(--yellow-bg);color:var(--yellow)'}
  else if(diff>0){el.textContent=diff+' Tage!';el.style.cssText='background:var(--red-bg);color:var(--red)'}
  else if(diff===0){el.textContent='LAUNCH DAY';el.style.cssText='background:var(--green-bg);color:var(--green)'}
  else{el.textContent='Launched';el.style.cssText='background:var(--green-bg);color:var(--green)'}
}

function renderStats(){
  const c=getActiveClient();let t=0,d=0,w=0,wa=0,tm=0,dm=0;
  c.phases.forEach((p,pi)=>p.packages.forEach((pk,pai)=>pk.tasks.forEach((task,ti)=>{
    t++;tm+=task.min||0;const s=(task.status||'Offen');
    if(s==='Erledigt'){d++;dm+=task.min||0}if(s==='In Arbeit')w++;if(s==='Warte auf Kunde')wa++;
  })));
  document.getElementById('sT').textContent=t;
  document.getElementById('sD').textContent=d;
  document.getElementById('sDP').textContent=t?Math.round(d/t*100)+'%':'';
  document.getElementById('sW').textContent=w;
  document.getElementById('sWa').textContent=wa;
  document.getElementById('sH').textContent=Math.round(tm/60)+'h';
  document.getElementById('sHL').textContent=Math.round((tm-dm)/60)+'h übrig';
  const dp=t?d/t*100:0,wp=t?w/t*100:0,wap=t?wa/t*100:0;
  document.getElementById('progressBar').innerHTML=`<div class="progress-seg" style="width:${dp}%;background:var(--green)"></div><div class="progress-seg" style="width:${wp}%;background:var(--yellow)"></div><div class="progress-seg" style="width:${wap}%;background:var(--pink)"></div>`;
}

// ============================================================
// TASKS VIEW
// ============================================================
function renderPackageHeaderHtml(pkg,pai,pi,c){
var phObj=c.phases[pi];
const wKey=`${pi}_${pai}`;
      const wOpen=openPackages.has(wKey);
      // Package task count
      let ptt=0,pdd=0;
      pkg.tasks.forEach((t,ti)=>{ptt++;if(((t.status||'Offen'))==='Erledigt')pdd++});
      const ppct=ptt?Math.round(pdd/ptt*100):0;
        let pkgPlanMins=0,pkgActualMins=0;
        pkg.tasks.forEach((t,ti)=>{pkgPlanMins+=(t.min||30);const tid=t._id;pkgActualMins+=getTrackedMins(c,tid);});
        const pkgTimeHtml=pkgPlanMins>0?`<span class="pkg-time">${pkgActualMins}/${pkgPlanMins}min</span>`:"";;

      return `<div class="wp-wrap" data-pi="${pi}" data-pai="${pai}" draggable="true" ondragstart="dragPkgStart(event,'${phObj._id}','${pkg._id}')" ondragend="dragPkgEnd(event)" ondragover="dragPkgOver(event,'${phObj._id}','${pkg._id}')" ondragleave="dragPkgLeave(event)" ondrop="dropPkg(event,'${phObj._id}','${pkg._id}')">
      <div class="wp-head" onclick="toggleW('${phObj._id}','${pkg._id}')">
        <span class="drag-handle" title="Kategorie verschieben" onmousedown="event.stopPropagation()">⠿</span>
        <span class="wp-chev${wOpen?' open':''}" id="wc${pi}_${pai}">▶</span>
        <span class="wp-name">${esc(pkg.name)}</span>${pkgTimeHtml}
        <span style="font-size:10px;color:var(--text3);margin-left:6px">${pdd}/${ptt}</span>
        ${ppct===100?'<span style="font-size:9px;color:var(--green);margin-left:4px">✓</span>':''}
        <button class="btn sm int-col" style="margin-left:auto;opacity:0;transition:opacity .15s" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0" onclick="event.stopPropagation();renamePackage('${phObj._id}','${pkg._id}')">✏️</button>
        <button class="btn sm int-col danger" style="opacity:0;transition:opacity .15s;font-size:9px" onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0" onclick="event.stopPropagation();deletePackage('${phObj._id}','${pkg._id}')">✕</button>
      </div><div class="wp-body${wOpen?' open':''}" id="wb${pi}_${pai}">`;
}
// S-3: Extracted phase body rendering for lazy loading
function renderPhaseBodyContent(phase, pi, c) {
  var h = '';
  var phaseTaskDeadlines = [];
  if (phase.startDate && phase.endDate) {
    var pS = new Date(phase.startDate), pE = new Date(phase.endDate);
    var pSpan = pE - pS;
    var cumMin = 0, totalMin = 0;
    phase.packages.forEach(function(pk) { pk.tasks.forEach(function(t) { totalMin += (t.min || 30); }); });
    phase.packages.forEach(function(pk) { pk.tasks.forEach(function(t) {
      cumMin += (t.min || 30);
      var ratio = totalMin > 0 ? cumMin / totalMin : 1;
      phaseTaskDeadlines.push(new Date(pS.getTime() + ratio * pSpan));
    }); });
  }
  phase.packages.forEach(function(pkg, pai) {
    h += renderPackageHeaderHtml(pkg, pai, pi, c);
    var flatIdx = (function() { var n = 0; for (var x = 0; x < pai; x++) n += phase.packages[x].tasks.length; return n; })();
    pkg.tasks.forEach(function(task, ti) { h += renderTaskRowHtml(task, ti, pi, pai, c, phaseTaskDeadlines, flatIdx); flatIdx++; });
    h += `<div class="add-row"><button class="add-btn" onclick="openAddTask('${phase._id}','${pkg._id}')">+ Aufgabe</button></div></div></div>`;
  });
  h += `<div class="add-row" style="margin-top:4px;margin-bottom:6px"><button class="add-btn" onclick="openAddPackage('${phase._id}')" style="font-size:11px">+ Neue Kategorie</button></div>`;
  return h;
}

// M-2: Extracted from renderTasks() — phase header block
function renderPhaseHeaderHtml(phase,pi,c){
let tt=0,dd=0;
    phase.packages.forEach((pk,pai)=>pk.tasks.forEach((t,ti)=>{tt++;if(((t.status||'Offen'))==='Erledigt')dd++}));
    const pct=tt?Math.round(dd/tt*100):0;
      let phasePlanMins=0,phaseActualMins=0;
      phase.packages.forEach((pk,pai)=>pk.tasks.forEach((t,ti)=>{phasePlanMins+=(t.min||30);phaseActualMins+=getTrackedMins(c,t._id);}));
      const phaseTimeHtml=phasePlanMins>0?`<span class="phase-time">${phaseActualMins}/${phasePlanMins}min</span>`:"";;
    const dateStr=phase.startDate&&phase.endDate?`${fmtShort(phase.startDate)} – ${fmtShort(phase.endDate)}`:'';
    const daysDiff=phase.startDate&&phase.endDate?Math.round((new Date(phase.endDate)-new Date(phase.startDate))/864e5):0;
    const pOpen=openPhases.has(pi);

    // Phase health color: green=on track, orange=behind, red=overdue, blue=future, bright green=done
    const phaseBarInfo=getPhaseHealth(phase,pct,dd,tt);

    return `<div class="phase-block" data-pi="${pi}" draggable="true" ondragstart="dragPhaseStart(event,'${phase._id}')" ondragend="dragPhaseEnd(event)" ondragover="dragPhaseOver(event,'${phase._id}')" ondragleave="dragPhaseLeave(event)" ondrop="dropPhase(event,'${phase._id}')">
      <div class="phase-head" onclick="toggleP('${phase._id}')" style="border-left:3px solid ${phaseBarInfo.color}">
        <div class="phase-left">
          <span class="drag-handle" title="Phase verschieben" onmousedown="event.stopPropagation()">⠿</span>
          <span class="ph-chev${pOpen?' open':''}" id="pc${pi}">▶</span>
          <span class="ph-tag" style="background:${phaseBarInfo.color}18;color:${phaseBarInfo.color}">${phase.id||''}</span>
          <span class="ph-name">${esc(phase.name)}</span>${phaseTimeHtml}
          ${phaseBarInfo.icon?`<span style="font-size:10px;margin-left:4px">${phaseBarInfo.icon}</span>`:''}
        </div>
        <div class="phase-right">
          ${dateStr?`<span class="phase-pct" style="font-size:10px">${dateStr} (${daysDiff}d)</span>`:''}
          <span class="phase-pct" style="color:${phaseBarInfo.color};font-weight:600">${dd}/${tt}</span>
          <div class="mini-bar" style="background:${phaseBarInfo.color}15"><div class="mini-fill" style="width:${pct}%;background:${phaseBarInfo.color}"></div></div>
          <div class="ph-actions" style="display:flex;gap:3px;align-items:center">
            <button class="btn sm" onclick="event.stopPropagation();openAddPackage('${phase._id}')" style="font-size:10px;opacity:.7">+ Kategorie</button>
            <button class="btn sm" onclick="event.stopPropagation();openAddTask('${phase._id}',phase.packages.length?phase.packages[0]._id:'')" style="font-size:10px;opacity:.7">+ Task</button>
            <button class="btn sm" onclick="event.stopPropagation();editPhase('${phase._id}')" title="Phase bearbeiten">✏️</button>
            <button class="btn sm int-col" onclick="event.stopPropagation();duplicatePhase('${phase._id}')" title="Phase duplizieren">📋</button>
            <button class="btn sm danger int-col" onclick="event.stopPropagation();deletePhaseInline('${phase._id}')" title="Phase löschen" style="font-size:10px">🗑️</button>
          </div>
        </div>
      </div>
      <div class="phase-body${pOpen?' open':''}" id="pb${pi}"${pOpen?'':' data-lazy="1"'}>`;
}

// M-2: Extracted from renderTasks() — single task row HTML
function renderTaskRowHtml(task,ti,pi,pai,c,phaseTaskDeadlines,flatIdxVal){
var phObj=c.phases[pi],pkObj=phObj.packages[pai];
const id=task._id;
        const st=task.status||'Offen';
        const cc=st==='Erledigt'?'done':st==='In Arbeit'?'wip':st==='Warte auf Kunde'?'wait':'';
        const ci=st==='Erledigt'?'✓':st==='In Arbeit'?'●':st==='Warte auf Kunde'?'◔':'';
        if(!task.links)task.links={};
        const mins=task.min||30;
        const pLink=task.links.prompt||'';
        const sLink=task.links.sop||'';
        // Deadline badge
        let dlBadge='';
        {const dl=task.customDeadline?new Date(task.customDeadline):(phaseTaskDeadlines.length>0&&flatIdxVal<phaseTaskDeadlines.length?phaseTaskDeadlines[flatIdxVal]:null);
        if(dl){
          const now=new Date();
          const daysLeft=Math.ceil((dl-now)/864e5);
          const dlStr=dl.toLocaleDateString('de-DE',{day:'numeric',month:'short'});
          if(st==='Erledigt'){
            dlBadge=`<span class="dl-badge dl-done" onclick="editDeadline('${phObj._id}','${pkObj._id}','${task._id}',event)" style="cursor:pointer" title="Klick: Deadline ändern">${dlStr}</span>`;
          }else if(daysLeft>1){
            dlBadge=`<span class="dl-badge dl-ok" onclick="editDeadline('${phObj._id}','${pkObj._id}','${task._id}',event)" style="cursor:pointer" title="Klick: Deadline ändern">${dlStr}</span>`;
          }else if(daysLeft>=0){
            dlBadge=`<span class="dl-badge dl-warn" onclick="editDeadline('${phObj._id}','${pkObj._id}','${task._id}',event)" style="cursor:pointer" title="Klick: Deadline ändern">${dlStr}</span>`;
          }else{
            dlBadge=`<span class="dl-badge dl-over" onclick="editDeadline('${phObj._id}','${pkObj._id}','${task._id}',event)" style="cursor:pointer" title="Klick: Deadline ändern">${dlStr} (${Math.abs(daysLeft)}d über)</span>`;
          }
        }}
                const tracked=getTrackedMins(c,id);
        const planPct=mins>0?Math.min(Math.round(tracked/mins*100),200):0;
        const planCol=planPct<=100?"green":planPct<=150?"yellow":"red";
        const planBarHtml=mins>0&&(tracked>0||st==="Erledigt")?`<span class="plan-bar" title="${tracked}/${mins}min (${planPct}%)"><span class="plan-bar-track"><span class="plan-bar-fill ${planCol}" style="width:${Math.min(planPct,100)}%"></span></span><span class="plan-bar-label">${tracked}/${mins}</span></span>`:"";;
        const isTimerOn=c.activeTimer&&c.activeTimer.taskId===id;
        const timerBtn=`<span class="timer-btn${isTimerOn?' running':''}" onclick="toggleTimer('${id}',event)" title="${isTimerOn?'Timer stoppen':'Timer starten'}">${isTimerOn?'⏹':'▶'}${tracked?`<span class="tracked">${tracked}m</span>`:''}</span>`;
        const timeBtn=`<span class="time-btn" onclick="editTaskTime('${phObj._id}','${pkObj._id}','${task._id}')" title="Zeitbudget anpassen">⏱ ${mins}m</span>`;
        const sched=task.scheduled;
        const calBtn=sched
          ?`<span class="cal-btn cal-scheduled" onclick="openGCal('${phObj._id}','${pkObj._id}','${task._id}')" title="Zeitblock: ${fmtShort(sched.date)} ${sched.time}">📅 ${fmtShort(sched.date)}</span>`
          :`<span class="cal-btn" onclick="openGCal('${phObj._id}','${pkObj._id}','${task._id}')" title="Zeitblock planen">📅</span>`;
        const promptBtn=pLink
          ?`<span class="link-btn has-link" onclick="window.open('${esc(pLink)}','_blank')" title="${esc(pLink)}">📋 Prompt <span class="gear" onclick="event.stopPropagation();editTaskLink('${phObj._id}','${pkObj._id}','${task._id}','prompt')">⚙</span></span>`
          :`<span class="link-btn empty int-col" onclick="editTaskLink('${phObj._id}','${pkObj._id}','${task._id}','prompt')">📋 Prompt</span>`;
        const sopBtn=sLink
          ?`<span class="link-btn has-link" onclick="window.open('${esc(sLink)}','_blank')" title="${esc(sLink)}">🎬 SOP <span class="gear" onclick="event.stopPropagation();editTaskLink('${phObj._id}','${pkObj._id}','${task._id}','sop')">⚙</span></span>`
          :`<span class="link-btn empty int-col" onclick="editTaskLink('${phObj._id}','${pkObj._id}','${task._id}','sop')">🎬 SOP</span>`;
      var noteIcon=task.notes?'<span class="note-icon" title="'+esc(task.notes)+'">📝</span>':'';
        return `<div class="task-row ${(task.status==='Offen'&&getDueClass(task)==='due-overdue')?'overdue-row':''} ${st==='Erledigt'?'done':''}" data-id="${id}" data-owner="${task.owner}" data-status="${st}" oncontextmenu="ctxShow(event,'${id}','${phObj._id}','${pkObj._id}','${task._id}')">
          <div class="tcheck ${cc}" onclick="cycle('${id}')">${ci}</div>
          <div class="task-text"><span class="txt" onclick="editTask('${phObj._id}','${pkObj._id}','${task._id}')">${esc(task.t)}${getDueBadge(task)}${noteIcon}</span>${task.ki?'<span class="ki-dot" title="Kunden-Input"></span>':''}</div>
          ${timerBtn}
          ${planBarHtml}
          ${timeBtn}
          ${calBtn}
          ${promptBtn}
          ${sopBtn}
          <div><select class="ssel" onchange="setSt('${id}',this.value)"><option ${st==='Offen'?'selected':''}>Offen</option><option ${st==='In Arbeit'?'selected':''}>In Arbeit</option><option ${st==='Warte auf Kunde'?'selected':''}>Warte auf Kunde</option><option ${st==='Review'?'selected':''}>Review</option><option ${st==='Erledigt'?'selected':''}>Erledigt</option></select></div>
          <select class="opill opill-${task.owner.toLowerCase()}" onchange="setOwner('${phObj._id}','${pkObj._id}','${task._id}',this)">${['Mitch','Max','Hussein','Tobie','Team','Kunde'].map(o=>`<option${task.owner===o?' selected':''}>${o}</option>`).join('')}</select>
          ${dlBadge}
          <div class="task-actions int-col"><button class="task-action" onclick="editTask('${phObj._id}','${pkObj._id}','${task._id}')" title="Bearbeiten">✏️</button></div>
        </div>`;
}

function renderTasks(){
  const c=getActiveClient();let h='';
  c.phases.forEach((phase,pi)=>{
    h+=renderPhaseHeaderHtml(phase,pi,c);

    if(openPhases.has(pi)){ h+=renderPhaseBodyContent(phase,pi,c); }
    h+=`</div></div>`;
  });
  h+=`<div style="text-align:center;margin:12px 0 8px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
    <button class="add-btn" onclick="openNewPhase()" style="font-size:12px;padding:8px 18px;font-weight:600">+ Neue Phase</button>
    ${c.type==='retainer'?`<button class="add-btn" onclick="duplicateRetainer('${c.id}')" style="font-size:12px;padding:8px 18px;font-weight:600;border-color:var(--blue);color:var(--blue)">🔄 Nächsten Monat</button>`:''}
    <button class="add-btn" onclick="toggleProjectComplete()" style="font-size:11px;padding:6px 14px;opacity:.6">${c.completed?'↩️ Reaktivieren':'✅ Abschließen'}</button>
  </div>`;
  document.getElementById('tasksView').innerHTML=h;
}

function renderMiniTimeline(){
  const c=getActiveClient();
  const el=document.getElementById('miniTimeline');
  if(!el)return;
  const startD=c.startDate?new Date(c.startDate):new Date();
  const endD=new Date(c.launchDate);
  const now=new Date();
  const totalMs=endD-startD;
  if(totalMs<=0){el.innerHTML='';return}
  const elapsedMs=now-startD;
  const timePct=Math.max(0,Math.min(100,(elapsedMs/totalMs)*100));
  // Task progress
  let tt=0,dd=0;
  c.phases.forEach((p,pi)=>p.packages.forEach((pk,pai)=>pk.tasks.forEach((t,ti)=>{tt++;if(((t.status||'Offen'))==='Erledigt')dd++})));
  const taskPct=tt?Math.round(dd/tt*100):0;
  // Diff for color
  const diff=taskPct-timePct;
  const col=diff>=-5?'var(--green)':diff>=-20?'var(--yellow)':'var(--red)';
  const colBg=diff>=-5?'var(--green-bg)':diff>=-20?'var(--yellow-bg)':'var(--red-bg)';
  // Phase markers
  let markers='';
  c.phases.forEach(p=>{
    if(p.startDate){
      const pPct=Math.max(0,Math.min(100,((new Date(p.startDate)-startD)/totalMs)*100));
      markers+=`<div style="position:absolute;left:${pPct}%;top:0;bottom:0;width:1px;background:var(--border2);z-index:1" title="${esc(p.name)}"></div>`;
    }
  });
  el.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;width:100%">
      <div style="position:relative;flex:1;height:22px;background:var(--surface3);border-radius:11px;overflow:hidden;min-width:120px">
        ${markers}
        <div style="position:absolute;left:0;top:0;bottom:0;width:${timePct}%;background:var(--surface2);border-radius:9px;z-index:0" title="Soll: ${Math.round(timePct)}%"></div>
        <div style="position:absolute;left:0;top:4px;bottom:4px;width:${taskPct}%;background:${col};border-radius:7px;z-index:2;transition:width .3s" title="Ist: ${taskPct}%"></div>
        <div style="position:absolute;left:${timePct}%;top:0;bottom:0;width:2px;background:var(--red);z-index:3;border-radius:1px" title="Heute"></div>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--text);z-index:4;pointer-events:none;text-shadow:0 0 3px rgba(255,255,255,.8)">${taskPct}% erledigt · Soll ${Math.round(timePct)}%</div>
      </div>
    </div>`;
}

function renderDocs(){
  const c=getActiveClient();let h='<div class="docs-grid">';
  DOCS.forEach(d=>{
    if(isCV&&d.int)return;
    const has=c.docLinks[d.id];
    h+=`<div class="doc-card ${has?'has-link':''} ${d.int?'int-doc':''}" onclick="openDocLink('${d.id}')">
      <div class="doc-icon">${d.icon}</div><div class="doc-name">${d.name}</div><div class="doc-desc">${d.desc}</div>
      <button class="doc-link-btn" onclick="event.stopPropagation();editLink('${d.id}','${d.name}')" title="Link bearbeiten">⚙</button>
    </div>`;
  });
  h+='</div>';

  // Jourfix section
  if(!isCV){
    const jf=c.jourfix||{};
    const hasJF=jf.day&&jf.time;
    const jfLink=jf.meetLink||'';
    const dayNames=['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
    const jfDay=hasJF?`${dayNames[jf.day]}s`:''
    const jfTime=hasJF?jf.time:'';
    h+=`<div class="jf-section"><div class="sec-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">📅 Jourfix`;
    if(hasJF){
      if(jfLink){
        h+=`<a href="${esc(jfLink)}" target="_blank" style="font-size:11px;font-weight:600;color:var(--green);background:var(--green-bg);padding:2px 10px;border-radius:12px;text-decoration:none;cursor:pointer" title="Meeting öffnen">${jfDay}, ${jfTime} Uhr</a>`;
      }else{
        h+=`<span style="font-size:11px;font-weight:600;color:var(--text2);background:var(--surface2);padding:2px 10px;border-radius:12px">${jfDay}, ${jfTime} Uhr</span>`;
      }
      h+=`<span style="font-size:10px;color:var(--text3);cursor:pointer" onclick="setupJourfix()" title="Jourfix ändern">✏️</span>`;
      if(!jfLink){
        h+=`<span style="font-size:10px;color:var(--text3);cursor:pointer;border-bottom:1px dashed var(--border2)" onclick="editJFLink()" title="Meeting-Link hinzufügen">+ Link</span>`;
      }
    }else{
      h+=`<button class="btn sm" onclick="setupJourfix()" style="font-size:11px;background:var(--accent-bg);color:var(--accent);border-color:var(--accent)">+ Jourfix legen</button>`;
    }
    h+=`</div></div>`;
  }
  document.getElementById('docsView').innerHTML=h;
}
function renderFilterDropdowns(){
  const c=getActiveClient();if(!c)return;
  const owners=new Set();
  c.phases.forEach(ph=>ph.packages.forEach(a=>a.tasks.forEach(t=>{if(t.owner)owners.add(t.owner);})));
  const ownerList=[...owners].sort();
  const oPanel=document.getElementById('fdOwnerPanel');
  if(oPanel)oPanel.innerHTML='<div class="fdrop-item" onclick="clearFilter(\'owner\')" style="color:var(--text3);font-size:11px;font-style:italic">Alle Owner</div>'+ownerList.map(o=>'<div class="fdrop-item'+(fOwners.includes(o)?' selected':'')+'" data-fo="'+o+'" onclick="toggleFilterItem(\'owner\',\''+o+'\')" ><span class="fcheck">'+(fOwners.includes(o)?'\u2713':'')+'</span><span>'+o+'</span></div>').join('');
  const statusOpts=[{val:'Offen',label:'Offen'},{val:'In Arbeit',label:'Aktiv'},{val:'Warte auf Kunde',label:'Wartend'},{val:'overdue',label:'\u26A0\uFE0F \u00DCberf\u00E4llig'},{val:'Erledigt',label:'Fertig'}];
  const sPanel=document.getElementById('fdStatusPanel');
  if(sPanel)sPanel.innerHTML='<div class="fdrop-item" onclick="clearFilter(\'status\')" style="color:var(--text3);font-size:11px;font-style:italic">Alle Status</div>'+statusOpts.map(o=>'<div class="fdrop-item'+(fStatuses.includes(o.val)?' selected':'')+'" data-fs="'+o.val+'" onclick="toggleFilterItem(\'status\',\''+o.val+'\')" ><span class="fcheck">'+(fStatuses.includes(o.val)?'\u2713':'')+'</span><span>'+o.label+'</span></div>').join('');
}

function renderDashboard(){
  const el=document.getElementById('dashboardView');
  const now=new Date();
  const dayNames=['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];

  // Collect data across all clients
  let allOverdue=[];
  let allWaiting=[];
  let allThisWeek=[];
  let ownerMap={};
  const clientCards=[];

  DB.clients.forEach(c=>{
    let cTotal=0,cDone=0,cIP=0,cWait=0,cOpen=0,cEstMins=0,cDoneMins=0;
    let nearestLaunch=null;
    (c.projects||[]).forEach(proj=>{
      if(proj.completed)return; // skip completed for dashboard urgency
      let total=0,done=0,inProgress=0,waiting=0,open=0,estMins=0,doneMins=0;
      proj.phases.forEach((p,pi)=>{
        const phaseEnd=p.endDate?new Date(p.endDate):null;
        const isOverdue=phaseEnd&&phaseEnd<now;
        p.packages.forEach((pk,pai)=>pk.tasks.forEach((task,ti)=>{
          total++;
          const st=task.status||'Offen';
          const mins=task.min||30;
          estMins+=mins;
          const owner=task.owner||'?';
          if(!ownerMap[owner])ownerMap[owner]={total:0,done:0,active:0,waiting:0,mins:0,doneMins:0};
          ownerMap[owner].total++;
          ownerMap[owner].mins+=mins;

          if(st==='Erledigt'){done++;ownerMap[owner].done++;ownerMap[owner].doneMins+=mins;doneMins+=mins}
          else if(st==='In Arbeit'){inProgress++;ownerMap[owner].active++}
          else if(st==='Warte auf Kunde'){
            waiting++;ownerMap[owner].waiting++;
            allWaiting.push({client:c.name,clientId:c.id,task:task.t,owner,phase:p.name});
          }
          else{open++}

          if(st!=='Erledigt'&&isOverdue){
            const daysOver=Math.ceil((now-phaseEnd)/864e5);
            allOverdue.push({client:c.name,clientId:c.id,task:task.t,owner,phase:p.name,daysOver});
          }
          if(st!=='Erledigt'&&phaseEnd){
            const daysLeft=Math.ceil((phaseEnd-now)/864e5);
            if(daysLeft>=0&&daysLeft<=7){
              allThisWeek.push({client:c.name,clientId:c.id,task:task.t,owner,phase:p.name,daysLeft});
            }
          }
        }));
      });
      cTotal+=total;cDone+=done;cIP+=inProgress;cWait+=waiting;cOpen+=open;cEstMins+=estMins;cDoneMins+=doneMins;
      const ld=Math.ceil((new Date(proj.launchDate||futDate(30))-now)/864e5);
      if(nearestLaunch===null||ld<nearestLaunch)nearestLaunch=ld;
    });
    const pct=cTotal?Math.round(cDone/cTotal*100):0;
    const activeProjects=(c.projects||[]).filter(p=>!p.completed).length;
    const jf=(c.projects||[]).find(p=>p.jourfix&&p.jourfix.day);
    clientCards.push({id:c.id,name:c.name,pct,total:cTotal,done:cDone,inProgress:cIP,waiting:cWait,open:cOpen,estMins:cEstMins,doneMins:cDoneMins,
      launchDiff:nearestLaunch||0,activeProjects,
      jf:jf&&jf.jourfix.day?`${dayNames[jf.jourfix.day]} ${jf.jourfix.time}`:'–'});
  });

  allOverdue.sort((a,b)=>b.daysOver-a.daysOver);
  allThisWeek.sort((a,b)=>a.daysLeft-b.daysLeft);

  let h=`<div class="dash-header"><div>
    <div class="dash-title">Dashboard</div>
    <div class="dash-subtitle">${DB.clients.length} Kunde${DB.clients.length!==1?'n':''} · ${new Date().toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
  </div></div>`;

  // Client Cards
  h+=`<div class="dash-grid">`;
  clientCards.forEach(c=>{
    const barColor=c.pct>=80?'var(--green)':c.pct>=40?'var(--accent)':'var(--text3)';
    const pctBg=c.pct>=80?'var(--green-bg)':c.pct>=40?'var(--accent-bg)':'var(--surface2)';
    const pctCol=c.pct>=80?'var(--green)':c.pct>=40?'var(--accent)':'var(--text2)';
    const launchLabel=c.launchDiff>0?`${c.launchDiff}d bis Launch`:c.launchDiff===0?'LAUNCH DAY':'Launched';
    h+=`<div class="dash-card" onclick="switchClient('${c.id}')">
      <div class="dash-card-header">
        <span class="dash-card-name">${esc(c.name)}</span>
        <span class="dash-card-pct" style="background:${pctBg};color:${pctCol}">${c.pct}%</span>
      </div>
      <div class="dash-card-bar"><div class="dash-card-fill" style="width:${c.pct}%;background:${barColor}"></div></div>
      <div class="dash-card-meta">
        <span>✅ ${c.done}/${c.total}</span>
        <span>🔄 ${c.inProgress}</span>
        <span style="color:var(--pink)">⏳ ${c.waiting}</span>
        <span>📁 ${c.activeProjects||0} Projekte</span>
        <span>${launchLabel}</span>
      </div>
    </div>`;
  });
  h+=`</div>`;

  // Overdue Tasks
  if(allOverdue.length){
    h+=`<div class="dash-section">
      <div class="dash-section-title">🔴 Überfällig <span class="badge" style="background:var(--red)">${allOverdue.length}</span></div>
      <table class="dash-table"><thead><tr><th>Kunde</th><th>Task</th><th>Phase</th><th>Owner</th><th>Überfällig</th></tr></thead><tbody>`;
    allOverdue.slice(0,15).forEach(t=>{
      h+=`<tr><td><span class="client-link" onclick="switchClient('${t.clientId}')">${esc(t.client)}</span></td>
        <td>${esc(t.task)}</td><td style="font-size:11px;color:var(--text3)">${esc(t.phase)}</td>
        <td>${esc(t.owner)}</td><td style="color:var(--red);font-weight:600">${t.daysOver}d</td></tr>`;
    });
    h+=`</tbody></table></div>`;
  }

  // Waiting on Client
  if(allWaiting.length){
    h+=`<div class="dash-section">
      <div class="dash-section-title">⏳ Warte auf Kunde <span class="badge" style="background:var(--pink)">${allWaiting.length}</span></div>
      <table class="dash-table"><thead><tr><th>Kunde</th><th>Task</th><th>Phase</th><th>Owner</th></tr></thead><tbody>`;
    allWaiting.forEach(t=>{
      h+=`<tr><td><span class="client-link" onclick="switchClient('${t.clientId}')">${esc(t.client)}</span></td>
        <td>${esc(t.task)}</td><td style="font-size:11px;color:var(--text3)">${esc(t.phase)}</td>
        <td>${esc(t.owner)}</td></tr>`;
    });
    h+=`</tbody></table></div>`;
  }

  // This Week Deadlines
  if(allThisWeek.length){
    h+=`<div class="dash-section">
      <div class="dash-section-title">📅 Diese Woche fällig <span class="badge" style="background:var(--yellow)">${allThisWeek.length}</span></div>
      <table class="dash-table"><thead><tr><th>Kunde</th><th>Task</th><th>Phase</th><th>Owner</th><th>In</th></tr></thead><tbody>`;
    allThisWeek.slice(0,20).forEach(t=>{
      const urgColor=t.daysLeft<=2?'var(--red)':t.daysLeft<=4?'var(--yellow)':'var(--text2)';
      h+=`<tr><td><span class="client-link" onclick="switchClient('${t.clientId}')">${esc(t.client)}</span></td>
        <td>${esc(t.task)}</td><td style="font-size:11px;color:var(--text3)">${esc(t.phase)}</td>
        <td>${esc(t.owner)}</td><td style="color:${urgColor};font-weight:600">${t.daysLeft}d</td></tr>`;
    });
    h+=`</tbody></table></div>`;
  }

  // Owner Workload
  const owners=Object.entries(ownerMap).sort((a,b)=>b[1].total-a[1].total);
  if(owners.length){
    h+=`<div class="dash-section">
      <div class="dash-section-title">👥 Workload pro Owner</div>
      <div class="dash-owner-grid">`;
    owners.forEach(([name,d])=>{
      const pct=d.total?Math.round(d.done/d.total*100):0;
      const hrs=Math.round(d.mins/60);
      const doneHrs=Math.round(d.doneMins/60);
      h+=`<div class="dash-owner-card">
        <div class="dash-owner-name">${esc(name)}</div>
        <div class="dash-owner-stats">
          <span>✅ ${d.done}/${d.total}</span>
          <span>🔄 ${d.active}</span>
          <span>⏳ ${d.waiting}</span>
          <span>${doneHrs}/${hrs}h</span>
        </div>
        <div class="dash-owner-bar"><div class="dash-owner-fill" style="width:${pct}%"></div></div>
      </div>`;
    });
    h+=`</div></div>`;
  }

  if(!DB.clients.length){
    h+=`<div class="dash-empty">Noch keine Kunden angelegt. Klick auf "+ Neuer Kunde" um loszulegen.</div>`;
  }

  el.innerHTML=h;
}

// ============================================================
// TIME TRACKER
// ============================================================
function renderTeam(){const el=document.getElementById('teamView');if(!el)return;const owners=getAllOwners();if(!owners.length){el.innerHTML='<p style="color:var(--dim);padding:2rem">Keine Team-Mitglieder gefunden. Weise Tasks einen Owner zu.</p>';return;}let h='<div class="team-grid">';owners.forEach(o=>{const s=getOwnerStats(o);const role=teamRoles[o]||'';const total=s.open+s.done;const pct=total?Math.round(s.done/total*100):0;const loadClass=s.open>10?'load-red':s.open>5?'load-yellow':'load-green';h+='<div class="team-card">';h+='<div style="display:flex;justify-content:space-between;align-items:center"><strong>'+esc(o)+'</strong>';h+='<select class="team-role-select" onchange="setTeamRole(\''+esc(o)+'\',this.value);renderTeam()" value="'+esc(role)+'">';['','Content','Design','Dev','PM','Strategy'].forEach(r=>{h+='<option value="'+r+'"'+(r===role?' selected':'')+'>'+( r||'Rolle...')+'</option>';});h+='</select></div>';if(role)h+='<span class="team-role">'+esc(role)+'</span>';h+='<div class="team-stats">';h+='<div class="team-stat"><span>Offen</span><strong>'+s.open+'</strong></div>';h+='<div class="team-stat"><span>Done</span><strong>'+s.done+'</strong></div>';h+='<div class="team-stat"><span>Overdue</span><strong style="color:var(--red)">'+s.overdue+'</strong></div>';h+='</div>';h+='<div class="load-bar"><div class="load-fill '+loadClass+'" style="width:'+pct+'%"></div></div>';h+='<small style="color:var(--dim)">'+pct+'% erledigt</small>';if(s.tasks.filter(t=>!t.isDone).length){h+='<div class="team-tasks-list">';s.tasks.filter(t=>!t.isDone).slice(0,5).forEach(t=>{h+='<div style="font-size:.8rem;padding:2px 0;color:var(--txt)">• '+esc(t.task.t)+' <span style="color:var(--dim)">('+esc(t.client)+')</span></div>';});if(s.tasks.filter(t=>!t.isDone).length>5)h+='<div style="font-size:.75rem;color:var(--dim)">+'+(s.tasks.filter(t=>!t.isDone).length-5)+' weitere...</div>';h+='</div>';}h+='</div>';});h+='</div>';el.innerHTML=h;}
function renderTimerReport(){const el=document.getElementById('timerReportView');if(!el)return;const data=getTimerData();const owners=Object.keys(data).sort();let h='<div class="report-view">';h+='<div style="display:flex;gap:1rem;align-items:center;margin-bottom:1rem;flex-wrap:wrap"><strong style="font-size:1.1rem">⏱️ Timer Report</strong>';h+='<div class="tr-period-filter">';['week','month','lastMonth','year'].forEach(p=>{h+='<button onclick="setTRPeriod(\''+p+'\')"\ style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);cursor:pointer;font-size:.8rem;'+(trPeriod===p?'background:var(--accent);color:#fff':'background:var(--surface2);color:var(--txt)')+'">'+({week:'Woche',month:'Monat',lastMonth:'Letzter M.',year:'Jahr'}[p])+'</button>';});h+='</div>';h+='<button onclick="exportTimerReportCSV()" style="padding:4px 12px;border-radius:6px;background:var(--surface2);color:var(--txt);border:1px solid var(--border);cursor:pointer;font-size:.85rem">⬇ CSV</button></div>';
if(!owners.length){h+='<p style="color:var(--dim);padding:1rem">Keine Zeitdaten im gewählten Zeitraum.</p></div>';el.innerHTML=h;return;}const maxTotal=Math.max(...owners.map(o=>data[o].total),1);owners.forEach(o=>{const d=data[o];const clientNames=Object.keys(d.clients).sort();const compliance=d.planned>0?Math.round(d.total/d.planned*100):0;const compClass=compliance>120?'rpt-red':compliance>80?'rpt-green':'rpt-yellow';h+='<div class="report-section"><div style="display:flex;justify-content:space-between;align-items:center"><h4>'+esc(o)+'</h4><span style="font-size:.85rem">Gesamt: <strong>'+d.total+'</strong>m | Plan: '+d.planned+'m | <span class="'+compClass+'">'+compliance+'%</span></span></div>';h+='<div class="timer-report-bar" style="margin:8px 0">';const colors=['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16'];clientNames.forEach((cn,i)=>{const w=Math.round(d.clients[cn].logged/maxTotal*100);h+='<div title="'+esc(cn)+': '+d.clients[cn].logged+'m" style="width:'+w+'%;background:'+colors[i%colors.length]+';height:100%;display:inline-block"></div>';});h+='</div>';h+='<div style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:4px">';clientNames.forEach((cn,i)=>{h+='<span style="font-size:.75rem;color:var(--dim)"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:'+colors[i%colors.length]+';margin-right:3px"></span>'+esc(cn)+': '+d.clients[cn].logged+'m</span>';});h+='</div></div>';});h+='</div>';el.innerHTML=h;}
function renderDiffReview(changes) {
  var greens = changes.filter(function(c) { return c.severity === "green"; });
  var yellows = changes.filter(function(c) { return c.severity === "yellow"; });
  var reds = changes.filter(function(c) { return c.severity === "red"; });
  var h = "<h3>📥 Import-Review</h3>";
  h += "<p>" + changes.length + " Änderungen: " + greens.length + " 🟢  " + yellows.length + " 🟡  " + reds.length + " 🔴</p>";
  if (greens.length) h += "<button onclick=\"checkAllGreen()\" class=\"btn btn-sm\" style=\"margin-bottom:1rem\">✅ Alle Grünen annehmen</button>";
  function row(c, i) {
    var chk = (c.severity === "green" || c.type === "new_task" || c.type === "new_package") ? "checked" : "";
    var icon = c.severity === "green" ? "🟢" : c.severity === "yellow" ? "🟡" : "🔴";
    var desc = "";
    if (c.type === "status_change") desc = icon + " <b>" + esc(c.task) + "</b> — " + esc(c.oldStatus) + " → " + esc(c.newStatus);
    else if (c.type === "deadline_change") desc = icon + " <b>" + esc(c.task) + "</b> — Deadline: " + (c.oldDeadline||"–") + " → " + (c.newDeadline||"–");
    else if (c.type === "owner_change") desc = icon + " <b>" + esc(c.task) + "</b> — Owner: " + (c.oldOwner||"–") + " → " + (c.newOwner||"–");
    else if (c.type === "rename_task") desc = icon + " Umbenennung: " + esc(c.task) + " → " + esc(c.newName);
    else if (c.type === "notes_change") desc = icon + " <b>" + esc(c.task) + "</b> — Notiz aktualisiert";
    else if (c.type === "effort_change") desc = icon + " <b>" + esc(c.task) + "</b> — Aufwand: " + (c.oldMin||"–") + " → " + (c.newMin||"–");
    else if (c.type === "new_task") desc = icon + " NEUER TASK: <b>" + esc(c.data.t || c.data.text) + "</b> → " + esc(c.phase) + " / " + esc(c.package);
    else if (c.type === "new_package") desc = icon + " NEUES PACKAGE: <b>" + esc(c.data.name) + "</b> → " + esc(c.phase);
    else if (c.type === "new_phase") desc = icon + " NEUE PHASE: <b>" + esc(c.data.name) + "</b>";
    else if (c.type === "rename_phase") desc = icon + " Phase: " + esc(c.phase) + " → " + esc(c.newName);
    else if (c.type === "dependency_change") desc = icon + " <b>" + esc(c.task) + "</b> — Vorgänger: " + (c.oldVor||"–") + " → " + (c.newVor||"–");
    else if (c.type === "delete_task") desc = icon + " LÖSCHEN: <b>" + esc(c.task) + "</b> (" + esc(c.phase) + ")";
    else if (c.type === "delete_package") desc = icon + " PACKAGE LÖSCHEN: <b>" + esc(c["package"]) + "</b> (" + esc(c.phase) + ")";
    else if (c.type === "delete_phase") desc = icon + " PHASE LÖSCHEN: <b>" + esc(c.phase) + "</b>";
    else if (c.type === "new_client") desc = icon + " NEUER KUNDE: <b>" + esc(c.data.name) + "</b>";
    else if (c.type === "new_project") desc = icon + " NEUES PROJEKT: <b>" + esc(c.data.name) + "</b>";
    else desc = icon + " " + c.type;
    return "<label class=\"diff-row diff-" + c.severity + "\"><input type=\"checkbox\" data-idx=\"" + i + "\" " + chk + "> " + desc + "</label>";
  }
  if (greens.length) { h += "<h4>🟢 Status/Notiz-Änderungen</h4>"; greens.forEach(function(c) { h += row(c, changes.indexOf(c)); }); }
  if (yellows.length) { h += "<h4>🟡 Inhaltliche Änderungen</h4>"; yellows.forEach(function(c) { h += row(c, changes.indexOf(c)); }); }
  if (reds.length) { h += "<h4>🔴 Strukturelle Änderungen</h4>"; reds.forEach(function(c) { h += row(c, changes.indexOf(c)); }); }
  h += "<div style=\"display:flex;gap:1rem;margin-top:1.5rem\"><button onclick=\"applySelectedChanges()\" class=\"btn\" style=\"background:var(--green)\">💾 Ausgewählte übernehmen</button>";
  h += "<button onclick=\"closeModal('diffModal')\" class=\"btn\" style=\"background:var(--red)\">❌ Abbrechen</button></div>";
  document.getElementById("diffModal").querySelector(".modal-content").innerHTML = h;
  openModal("diffModal");
}
