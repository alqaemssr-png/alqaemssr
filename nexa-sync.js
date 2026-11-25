/**
 * ON NEXA SERVER — Edge Vault & Scheduled Cloudflare Sync Engine (nexa-sync.js)
 */
let db = null;
const appDataStore = new Map();

function initDatabase() {
  return new Promise((resolve) => {
    if (!window.indexedDB) return resolve();
    const req = indexedDB.open('OnNexaServerVault_v2', 1);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('records')) {
        d.createObjectStore('records', { keyPath: 'uid' });
      }
    };
    req.onsuccess = (e) => {
      db = e.target.result;
      const tx = db.transaction('records', 'readonly');
      tx.objectStore('records').getAll().onsuccess = (ev) => {
        (ev.target.result || []).forEach(rec => {
          if (!appDataStore.has(rec.namespace)) appDataStore.set(rec.namespace, new Map());
          appDataStore.get(rec.namespace).set(rec.key, rec);
        });
        resolve();
      };
    };
    req.onerror = () => resolve();
  });
}

function getTotalVaultRecordCount() {
  let count = 0;
  appDataStore.forEach(nsMap => { count += nsMap.size; });
  return count;
}

function saveRecordToVault(namespace, record) {
  const slug = namespace.replace('alqaem-cluster-', '');
  if (!myLinkedApps.includes(slug) && !myLinkedApps.includes(namespace)) return false;

  if (!appDataStore.has(namespace)) appDataStore.set(namespace, new Map());
  const existing = appDataStore.get(namespace).get(record.key);
  if (existing && existing.ts >= record.ts) return false;

  const fullRec = { uid: `${namespace}::${record.key}`, namespace, ...record };
  appDataStore.get(namespace).set(record.key, fullRec);

  if (db) {
    const tx = db.transaction('records', 'readwrite');
    tx.objectStore('records').put(fullRec);
  }
  refreshHomeMetricsUI();
  return true;
}

// Handle incoming P2P data push & edge database read requests from connected apps
function handleSyncDataPacket(conn, msg) {
  if (msg.type === 'APP_DATA_PUSH' && msg.namespace && msg.record) {
    const saved = saveRecordToVault(msg.namespace, msg.record);
    sendPacket(conn, { type: 'APP_DATA_ACK', namespace: msg.namespace, key: msg.record.key, serverId: MY_NODE_ID });
    if (saved) {
      connections.forEach((c, pid) => {
        if (pid !== conn.peer && c && c.open) sendPacket(c, msg);
      });
    }
    return;
  }

  if (msg.type === 'APP_SYNC_REQ' && msg.namespace) {
    const nsMap = appDataStore.get(msg.namespace);
    if (nsMap) {
      const clientKeys = new Set(msg.keys || []);
      nsMap.forEach((rec, k) => {
        if (!clientKeys.has(k)) {
          sendPacket(conn, { type: 'APP_DATA_PUSH', namespace: msg.namespace, record: rec });
        }
      });
    }
    return;
  }

  if (msg.type === 'APP_FULL_DB_SNAPSHOT' && msg.namespace && Array.isArray(msg.records)) {
    let imported = 0;
    msg.records.forEach(rec => {
      if (rec && rec.key && saveRecordToVault(msg.namespace, rec)) imported++;
    });
    if (imported > 0) {
      connections.forEach((c, pid) => {
        if (pid !== conn.peer && c && c.open) {
          sendPacket(c, { type: 'APP_FULL_DB_SNAPSHOT', namespace: msg.namespace, records: msg.records });
        }
      });
    }
    return;
  }

  if (msg.type === 'CF_SYNC_COMPLETED') {
    localStorage.setItem('nexa_last_cf_sync_date_slot', msg.slotKey || '');
    localStorage.setItem('nexa_last_cf_sync_label', msg.label || 'Synced via Peer');
    updateSyncStatusBanner();
  }
}

function syncAllNamespacesWithPeer(conn) {
  appDataStore.forEach((nsMap, ns) => {
    nsMap.forEach((rec) => {
      sendPacket(conn, { type: 'APP_DATA_PUSH', namespace: ns, record: rec });
    });
  });
}

// ==================== SCHEDULED CLOUDFLARE SYNC & CATCH-UP ====================
let cfScheduleSlots = JSON.parse(localStorage.getItem('nexa_cf_schedule_slots') || '["08:30","14:00","21:00"]');

function loadScheduleInputs() {
  if (document.getElementById('syncSlot1')) document.getElementById('syncSlot1').value = cfScheduleSlots[0] || '08:30';
  if (document.getElementById('syncSlot2')) document.getElementById('syncSlot2').value = cfScheduleSlots[1] || '14:00';
  if (document.getElementById('syncSlot3')) document.getElementById('syncSlot3').value = cfScheduleSlots[2] || '21:00';
  updateSyncStatusBanner();
}

function saveCloudflareSchedule() {
  const s1 = document.getElementById('syncSlot1').value || '08:30';
  const s2 = document.getElementById('syncSlot2').value || '14:00';
  const s3 = document.getElementById('syncSlot3').value || '21:00';
  cfScheduleSlots = [s1, s2, s3];
  localStorage.setItem('nexa_cf_schedule_slots', JSON.stringify(cfScheduleSlots));
  updateSyncStatusBanner();
  alert(`Cloudflare Sync Schedule saved:\nSlot 1: ${s1}\nSlot 2: ${s2}\nSlot 3: ${s3}`);
}

function updateSyncStatusBanner() {
  const banner = document.getElementById('cfSyncStatusBanner');
  if (!banner) return;
  const lastLabel = localStorage.getItem('nexa_last_cf_sync_label') || 'Ready (Auto-Hydrated on Active)';
  banner.innerText = `Last Cloudflare Sync: ${lastLabel} | Vault Records: ${getTotalVaultRecordCount()}`;
}

// Hydrate complete database when server node becomes Active
function onServerNodeBecameActive() {
  hydrateAllLinkedAppsFromCloudflare('Auto-Hydration on Active');
  checkScheduledAndMissedSlots();
}

async function pollLinkedCloudflareApps(forceFull) {
  if (!navigator.onLine || isPausedByBattery) return;
  for (const slug of myLinkedApps) {
    const app = registeredApps.find(a => a.slug === slug);
    const ns = `alqaem-cluster-${slug}`;
    connections.forEach((conn) => {
      if (conn && conn.open) {
        sendPacket(conn, { type: 'APP_REQUEST_FULL_DB', namespace: ns });
      }
    });
    if (app && app.url && forceFull) {
      try {
        const res = await fetch(`${app.url}/api/nexa-snapshot`, { method: 'GET', cache: 'no-store' });
        if (res.ok) {
          const payload = await res.json();
          bytesReceived += JSON.stringify(payload).length;
          localStorage.setItem('nexa_bytes_rx', bytesReceived.toString());
          if (Array.isArray(payload.records)) {
            payload.records.forEach(r => saveRecordToVault(ns, r));
          }
        }
      } catch (e) {}
    }
  }
  refreshHomeMetricsUI();
}

async function hydrateAllLinkedAppsFromCloudflare(reason) {
  await pollLinkedCloudflareApps(true);
  const stamp = `${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${reason})`;
  localStorage.setItem('nexa_last_cf_sync_label', stamp);
  updateSyncStatusBanner();
}

// Push & Pull full backup with Cloudflare (single elected online leader avoids duplicate uploads)
async function triggerCloudflareFullSync(reason, slotKey) {
  if (!navigator.onLine || isPausedByBattery) {
    if (reason === 'Manual Sync Now') alert("Device is offline or paused by battery limit.");
    return;
  }

  if (reason !== 'Manual Sync Now') {
    const onlineIds = [MY_NODE_ID];
    connections.forEach((conn, pid) => {
      if (conn && conn.open && pid.startsWith('nexa-srv-')) onlineIds.push(pid);
    });
    onlineIds.sort();
    if (onlineIds[0] !== MY_NODE_ID) return;
  }

  for (const slug of myLinkedApps) {
    const app = registeredApps.find(a => a.slug === slug);
    const ns = `alqaem-cluster-${slug}`;
    const records = appDataStore.has(ns) ? Array.from(appDataStore.get(ns).values()) : [];

    connections.forEach((conn) => {
      if (conn && conn.open) {
        sendPacket(conn, { type: 'APP_FULL_DB_SNAPSHOT', namespace: ns, records });
      }
    });

    if (app && app.url) {
      try {
        const bodyStr = JSON.stringify({ namespace: ns, sourceNode: MY_NODE_ID, records });
        bytesSent += bodyStr.length;
        localStorage.setItem('nexa_bytes_tx', bytesSent.toString());
        const res = await fetch(`${app.url}/api/nexa-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyStr
        });
        if (res.ok) {
          const pullData = await res.json();
          bytesReceived += JSON.stringify(pullData).length;
          localStorage.setItem('nexa_bytes_rx', bytesReceived.toString());
          if (Array.isArray(pullData.records)) {
            pullData.records.forEach(r => saveRecordToVault(ns, r));
          }
        }
      } catch (e) {}
    }
  }

  const effectiveSlotKey = slotKey || `${new Date().toISOString().slice(0, 10)}_manual`;
  const stamp = `${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — ${reason}`;
  localStorage.setItem('nexa_last_cf_sync_date_slot', effectiveSlotKey);
  localStorage.setItem('nexa_last_cf_sync_label', stamp);

  connections.forEach((conn) => {
    if (conn && conn.open) {
      sendPacket(conn, { type: 'CF_SYNC_COMPLETED', slotKey: effectiveSlotKey, label: stamp });
    }
  });

  refreshHomeMetricsUI();
  updateSyncStatusBanner();
  if (reason === 'Manual Sync Now') {
    alert(`Sync Complete! All ${getTotalVaultRecordCount()} records synced across Cloudflare & Mobile Mesh.`);
  }
}

// Check every 30s if a scheduled slot arrived OR if a previous slot was missed while all nodes were offline
function checkScheduledAndMissedSlots() {
  if (serverState !== 'Active' || !navigator.onLine || isPausedByBattery) return;
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentHHMM = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const lastCompletedSlotKey = localStorage.getItem('nexa_last_cf_sync_date_slot') || '';

  const sortedSlots = [...cfScheduleSlots].filter(Boolean).sort();
  let dueSlot = null;
  for (const slot of sortedSlots) {
    if (currentHHMM >= slot) {
      dueSlot = `${todayStr}_${slot}`;
    }
  }

  if (dueSlot && dueSlot !== lastCompletedSlotKey) {
    const label = dueSlot.endsWith(currentHHMM) ? `Scheduled (${currentHHMM})` : `Missed-Slot Catch-Up (${dueSlot.split('_')[1]})`;
    triggerCloudflareFullSync(label, dueSlot);
  }
}

setInterval(checkScheduledAndMissedSlots, 30000);

// Boot initialization
initDatabase().then(() => {
  loadScheduleInputs();
  refreshHomeMetricsUI();
  ensureNetworkRunning();
});
