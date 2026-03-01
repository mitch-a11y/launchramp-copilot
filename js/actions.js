var pendingChanges = [];

function openModal(id) {
  var el = document.getElementById(id);
  if (!el) return;
  if (el.classList.contains('modal-overlay')) {
    el.style.display = 'flex';
  } else {
    el.classList.add('show');
  }
}

function closeModal(id) {
  var el = document.getElementById(id);
  if (!el) return;
  if (el.classList.contains('modal-overlay')) {
    el.style.display = 'none';
  } else {
    el.classList.remove('show');
  }
}

function toast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(function() { el.classList.remove('show'); }, 2200);
}

function createSnapshot(clientIdx, label) {
  pushUndo(label);
}

function computeDiff(importData) {
  var changes = [];
  (importData.clients || []).forEach(function(ic) {
    var localClient = DB.clients.find(function(c) { return c._id === ic._id || c.id === ic.id; });
    if (!localClient) {
      changes.push({ type: "new_client", severity: "red", data: ic });
      return;
    }
    (ic.projects || []).forEach(function(ip) {
      var localProj = (localClient.projects || []).find(function(p) { return p._id === ip._id || p.id === ip.id; });
      if (!localProj) {
        changes.push({ type: "new_project", severity: "red", data: ip });
        return;
      }
      (ip.phases || []).forEach(function(iph) {
        var lph = (localProj.phases || []).find(function(p) { return p._id === iph._id; });
        if (!lph) {
          changes.push({ type: "new_phase", severity: "red", data: iph, _project: localProj });
          return;
        }
        if (iph.name !== lph.name) {
          changes.push({ type: "rename_phase", severity: "yellow", phase: lph.name, newName: iph.name, _phase: lph });
        }
        (iph.packages || []).forEach(function(ipk) {
          var lpk = (lph.packages || []).find(function(p) { return p._id === ipk._id; });
          if (!lpk) {
            changes.push({ type: "new_package", severity: "red", data: ipk, phase: iph.name, _phase: lph });
            return;
          }
          (ipk.tasks || []).forEach(function(it) {
            var lt = (lpk.tasks || []).find(function(t) { return t._id === it._id; });
            if (!lt) {
              changes.push({ type: "new_task", severity: "red", data: it, phase: iph.name, package: ipk.name, _pkg: lpk });
              return;
            }
            if ((it.status || "Offen") !== (lt.status || "Offen")) {
              var c = { type: "status_change", severity: "green", task: lt.t, oldStatus: lt.status || "Offen", newStatus: it.status || "Offen", _task: lt };
              changes.push(c);
            }
            if (it.t && it.t !== lt.t) {
              changes.push({ type: "rename_task", severity: "yellow", task: lt.t, newName: it.t, _task: lt });
            }
            if ((it.owner || "") !== (lt.owner || "")) {
              changes.push({ type: "owner_change", severity: "yellow", task: lt.t, oldOwner: lt.owner, newOwner: it.owner, _task: lt });
            }
            if ((it.customDeadline || "") !== (lt.customDeadline || "")) {
              changes.push({ type: "deadline_change", severity: "yellow", task: lt.t, oldDeadline: lt.customDeadline, newDeadline: it.customDeadline, _task: lt });
            }
            if ((it.vor || "") !== (lt.vor || "")) {
              changes.push({ type: "notes_change", severity: "green", task: lt.t, _task: lt, newVor: it.vor });
            }
            if (it.min && it.min !== lt.min) {
              changes.push({ type: "effort_change", severity: "yellow", task: lt.t, oldMin: lt.min, newMin: it.min, _task: lt });
            }
          });
          (lpk.tasks || []).forEach(function(lt) {
            var stillPresent = (ipk.tasks || []).find(function(it) { return it._id === lt._id; });
            if (!stillPresent) {
              changes.push({ type: "delete_task", severity: "red", task: lt.t, phase: iph.name, _task: lt, _pkg: lpk });
            }
          });
        });
      });
    });
  });
  return changes;
}

function handleImportFile(input) {
  var file = input.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var importData = JSON.parse(e.target.result);
      if (!importData.clients || !importData.clients.length) {
        document.getElementById("importStatus").innerHTML = "<p style=\"color:var(--red)\">Ungültige Datei: Kein clients-Array gefunden.</p>";
        return;
      }

      // AUTO-SNAPSHOT: Backup BEVOR Diff berechnet wird
      var clientIdx = DB.clients.findIndex(function(c) {
        return importData.clients.find(function(ic) { return ic._id === c._id; });
      });
      createSnapshot(clientIdx, "Auto-Backup vor Import (" + file.name + ")");

      var changes = computeDiff(importData);
      if (!changes.length) {
        document.getElementById("importStatus").innerHTML = "<p style=\"color:var(--green)\">Keine Änderungen gefunden.</p>";
        return;
      }
      pendingChanges = changes;
      document.getElementById("importStatus").innerHTML = "";
      closeImportModal();
      renderDiffReview(changes);
    } catch (err) {
      document.getElementById("importStatus").innerHTML = "<p style=\"color:var(--red)\">Fehler beim Lesen der Datei: " + esc(err.message) + "</p>";
    }
  };
  reader.readAsText(file);
}

function applySelectedChanges() {
  var indices = [];
  document.querySelectorAll("#diffModal input[type=checkbox]:checked").forEach(function(cb) {
    indices.push(parseInt(cb.getAttribute("data-idx"), 10));
  });
  if (!indices.length) { toast("Keine Änderungen ausgewählt"); return; }
  var applied = 0;
  indices.forEach(function(idx) {
    var c = pendingChanges[idx];
    if (!c) return;
    if (c.type === "status_change") {
      if (c._task) {
        c._task.status = c.newStatus;
      }
      applied++;
    } else if (c.type === "rename_task") {
      if (c._task) { c._task.t = c.newName; }
      applied++;
    } else if (c.type === "owner_change") {
      if (c._task) { c._task.owner = c.newOwner; }
      applied++;
    } else if (c.type === "deadline_change") {
      if (c._task) { c._task.customDeadline = c.newDeadline; }
      applied++;
    } else if (c.type === "notes_change") {
      if (c._task) { c._task.vor = c.newVor; }
      applied++;
    } else if (c.type === "effort_change") {
      if (c._task) { c._task.min = c.newMin; }
      applied++;
    } else if (c.type === "new_task") {
      if (c._pkg) { c._pkg.tasks.push(c.data); }
      applied++;
    } else if (c.type === "new_package") {
      if (c._phase) { c._phase.packages.push(c.data); }
      applied++;
    } else if (c.type === "new_phase") {
      if (c._project) { c._project.phases.push(c.data); }
      applied++;
    } else if (c.type === "rename_phase") {
      if (c._phase) { c._phase.name = c.newName; }
      applied++;
    } else if (c.type === "delete_task") {
      if (c._pkg) {
        c._pkg.tasks = c._pkg.tasks.filter(function(t) { return t !== c._task; });
      }
      applied++;
    }
  });
  save();
  renderAll();
  closeModal("diffModal");
  pendingChanges = [];
  toast(applied + " Änderung" + (applied !== 1 ? "en" : "") + " übernommen");
}

function checkAllGreen() {
  document.querySelectorAll("#diffModal input[type=checkbox]").forEach(function(cb) {
    var idx = parseInt(cb.getAttribute("data-idx"), 10);
    if (pendingChanges[idx] && pendingChanges[idx].severity === "green") {
      cb.checked = true;
    }
  });
}

function closeImportModal() {
  var m = document.getElementById("importModal");
  if (m) m.style.display = "none";
  var fi = document.getElementById("importFileInput");
  if (fi) fi.value = "";
}