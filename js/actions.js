// Assuming the necessary imports are already present

function computeDiff(/* your parameters */) {
    // ... existing logic
    // Update status_change dual-write bug
    if (status_change) {
        status_change._task = ct; // Add direct task reference
    }
    // ... rest of the existing logic
}

function applySelectedChanges(changes) {
    let applied = 0;
    changes.forEach(c => {
        if (c.type === "status_change") {
            if (c._task) {
                c._task.status = c.newStatus; // Write to task.status directly
            } else if (c._project && c._stKey) {
                var _pts = c._stKey.split("-");
                var ph = c._project.phases[_pts[0]];
                if (ph) {
                    var pk = ph.packages[_pts[1]];
                    if (pk) {
                        var tk = pk.tasks[_pts[2]];
                        if (tk) tk.status = c.newStatus; // Write to task.status
                    }
                }
            }
            applied++;
        }
        // Keep behavior otherwise unchanged
    });
}

// Status cycle array
var SC=['Offen','In Arbeit','Warte auf Kunde','Erledigt'];

// Cycle task status to next value (called from rendered task rows)
function cycle(id){
  var c=getActiveClient();
  var r=resolveTaskById(c,id);
  if(!r)return;
  var cur=r.task.status||'Offen';
  setTaskStatus(c,r.pi,r.pai,r.ti,SC[(SC.indexOf(cur)+1)%SC.length]);
  save();renderAll();
}

// Set task status to specific value (called from rendered task rows)
function setSt(id,v){
  var c=getActiveClient();
  var r=resolveTaskById(c,id);
  if(!r)return;
  setTaskStatus(c,r.pi,r.pai,r.ti,v);
  save();renderAll();
}
