/**
 * ON NEXA SERVER — Core Mesh & UI Engine (nexa-core.js)
 */
setTimeout(() => {
  const splash = document.getElementById('splash-screen');
  if (splash) splash.classList.add('hidden');
}, 3000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(r => r.update()).catch(() => {});
}
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

// PWA Install Prompt Capture
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

function triggerPwaInstall() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(() => { deferredInstallPrompt = null; });
  } else {
    alert("To install ON NEXA SERVER:\n1. Tap the browser menu (⋮) at top-right.\n2. Select 'Add to Home screen' or 'Install app'.");
  }
}

function checkForAppUpdates() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      Promise.all(regs.map(r => r.update())).then(() => {
        if ('caches' in window) {
          caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => {
            alert("Application updated to the latest version. Reloading now...");
            window.location.reload(true);
          });
        } else {
          window.location.reload(true);
        }
      });
    });
  } else {
    window.location.reload(true);
  }
}

let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    requestWakeLock();
    ensureNetworkRunning();
  }
});
requestWakeLock();

function getDeviceUid() {
  let uid = localStorage.getItem('nexa_device_uid');
  if (!uid) {
    uid = 'node-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    localStorage.setItem('nexa_device_uid', uid);
  }
  return uid;
}

const MY_NODE_ID = 'nexa-srv-' + getDeviceUid();
const MASTER_DIRECTORY_ID = 'on-nexa-global-directory-v1';
const SCHOOL_APP_SLUG = 'alqaem-school-system';
const SCHOOL_APP_URL = 'https://alqaem-school-system.alqaemitacademy.workers.dev';

let userName = localStorage.getItem('nexa_user_name') || ('NEXA-' + getDeviceUid().slice(-4).toUpperCase());
let userDp = localStorage.getItem('nexa_user_dp') || '';
let memoryLimitGB = parseInt(localStorage.getItem('nexa_mem_gb') || '2', 10);
let batteryThreshold = parseInt(localStorage.getItem('nexa_bat_limit') || '20', 10);

let adminPasscode = localStorage.getItem('nexa_admin_pin') || '10111';
let isAdmin = sessionStorage.getItem('nexa_is_admin') === 'true';

let firstOnlineTs = parseInt(localStorage.getItem('nexa_first_online') || Date.now().toString(), 10);
localStorage.setItem('nexa_first_online', firstOnlineTs.toString());
let totalOnlineSeconds = parseInt(localStorage.getItem('nexa_total_online_sec') || '0', 10);
let onlineCount = parseInt(localStorage.getItem('nexa_online_count') || '0', 10);
let offlineCount = parseInt(localStorage.getItem('nexa_offline_count') || '0', 10);
let bytesReceived = parseInt(localStorage.getItem('nexa_bytes_rx') || '0', 10);
let bytesSent = parseInt(localStorage.getItem('nexa_bytes_tx') || '0', 10);

const DEFAULT_APPS = [
  { title: 'Alqaem School System (v17.10.33)', slug: SCHOOL_APP_SLUG, url: SCHOOL_APP_URL },
  { title: 'Alqaem IT Academy', slug: 'alqaem-it-academy', url: '' }
];

let registeredApps = JSON.parse(localStorage.getItem('nexa_registered_apps') || 'null') || DEFAULT_APPS;
if (!registeredApps.some(a => a.slug === SCHOOL_APP_SLUG)) {
  registeredApps.unshift(DEFAULT_APPS[0]);
  localStorage.setItem('nexa_registered_apps', JSON.stringify(registeredApps));
}

let storedLinked = JSON.parse(localStorage.getItem('nexa_my_linked_apps') || 'null');
const adminManuallyDisconnectedSchool = localStorage.getItem('nexa_admin_unlinked_school') === 'true';
let myLinkedApps = Array.isArray(storedLinked) ? storedLinked : [SCHOOL_APP_SLUG];
if (!adminManuallyDisconnectedSchool && !myLinkedApps.includes(SCHOOL_APP_SLUG)) {
  myLinkedApps.unshift(SCHOOL_APP_SLUG);
  localStorage.setItem('nexa_my_linked_apps', JSON.stringify(myLinkedApps));
}

let nodeRegistry = JSON.parse(localStorage.getItem('nexa_node_registry') || '{}');

document.getElementById('memoryLimitSelect').value = memoryLimitGB;
document.getElementById('batteryLimitSelect').value = batteryThreshold;
document.getElementById('profileNameInput').value = userName;
refreshProfileAndAdminUI();

function refreshProfileAndAdminUI() {
  document.getElementById('homeServerName').innerText = userName;
  const dpCircle = document.getElementById('dpCircle');
  if (userDp) {
    dpCircle.innerHTML = `<img src="${userDp}" alt="DP">`;
  } else {
    dpCircle.innerHTML = `<span id="dpInitial">${userName.charAt(0).toUpperCase()}</span>`;
  }

  document.getElementById('headerAdminBadge').style.display = isAdmin ? 'inline-block' : 'none';
  document.getElementById('footSettingsBtn').style.display = isAdmin ? 'flex' : 'none';
  document.getElementById('moreOptionsBtn').style.display = isAdmin ? 'none' : 'inline-block';
  document.getElementById('adminLogoutBtn').style.display = isAdmin ? 'inline-block' : 'none';
  document.getElementById('adminChangePinCard').style.display = isAdmin ? 'block' : 'none';
}

function switchView(viewName) {
  document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active'));
  const targetView = document.getElementById('view-' + viewName);
  if (targetView) targetView.classList.add('active');

  document.querySelectorAll('.footer-btn').forEach(b => b.classList.remove('active'));
  if (viewName === 'home') document.getElementById('footHomeBtn').classList.add('active');
  if (viewName === 'profile' || viewName === 'passcode') document.getElementById('footProfileBtn').classList.add('active');
  if (viewName === 'settings' || viewName === 'node-detail') {
    document.getElementById('footSettingsBtn').classList.add('active');
    renderAdminServerLists();
    renderConsoleApps();
  }
}

function handleDpUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 160;
      canvas.getContext('2d').drawImage(img, 0, 0, 160, 160);
      userDp = canvas.toDataURL('image/jpeg', 0.82);
      localStorage.setItem('nexa_user_dp', userDp);
      refreshProfileAndAdminUI();
      broadcastNodeHeartbeat();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function saveUserProfile() {
  const val = document.getElementById('profileNameInput').value.trim();
  if (val) {
    userName = val;
    localStorage.setItem('nexa_user_name', userName);
    refreshProfileAndAdminUI();
    broadcastNodeHeartbeat();
    alert("Profile saved successfully.");
  }
}

function openPasscodePage() {
  document.getElementById('passcodeEntryInput').value = '';
  switchView('passcode');
}

function submitAdminPasscode() {
  const entered = document.getElementById('passcodeEntryInput').value.trim();
  if (entered === adminPasscode) {
    isAdmin = true;
    sessionStorage.setItem('nexa_is_admin', 'true');
    refreshProfileAndAdminUI();
    switchView('settings');
  } else {
    alert("Invalid Passcode! Please enter the correct 5-digit Admin Passcode.");
  }
}

function logoutAdmin() {
  isAdmin = false;
  sessionStorage.removeItem('nexa_is_admin');
  refreshProfileAndAdminUI();
  switchView('home');
}

function updateAdminPasscode() {
  const newPin = document.getElementById('profileNewPinInput').value.trim();
  if (!/^\d{5}$/.test(newPin)) {
    alert("Passcode must be exactly 5 numeric digits (0-9).");
    return;
  }
  adminPasscode = newPin;
  localStorage.setItem('nexa_admin_pin', newPin);
  document.getElementById('profileNewPinInput').value = '';
  alert("Admin passcode updated successfully.");
}

function saveResourceSettings() {
  memoryLimitGB = parseInt(document.getElementById('memoryLimitSelect').value, 10);
  batteryThreshold = parseInt(document.getElementById('batteryLimitSelect').value, 10);
  localStorage.setItem('nexa_mem_gb', memoryLimitGB.toString());
  localStorage.setItem('nexa_bat_limit', batteryThreshold.toString());
  evaluateBatteryAndServerState();
}

let currentBatteryPct = 100;
let isCharging = true;
let isPausedByBattery = false;

if (typeof navigator.getBattery === 'function') {
  navigator.getBattery().then((bat) => {
    const updateBat = () => {
      currentBatteryPct = Math.round(bat.level * 100);
      isCharging = bat.charging;
      document.getElementById('currentBatteryText').innerText = `${currentBatteryPct}% ${isCharging ? '⚡' : ''}`;
      evaluateBatteryAndServerState();
    };
    updateBat();
    bat.addEventListener('levelchange', updateBat);
    bat.addEventListener('chargingchange', updateBat);
  }).catch(() => {
    document.getElementById('currentBatteryText').innerText = 'AC / Optimal';
  });
} else {
  document.getElementById('currentBatteryText').innerText = 'AC / Optimal';
}

function evaluateBatteryAndServerState() {
  const notice = document.getElementById('batteryPauseNotice');
  if (!isCharging && currentBatteryPct <= batteryThreshold) {
    if (!isPausedByBattery) {
      isPausedByBattery = true;
      setServerVisualState('Inactive');
      if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
      if (dirPeer) { try { dirPeer.destroy(); } catch (e) {} dirPeer = null; }
    }
    notice.style.display = 'block';
    notice.innerText = `⚠️ Battery is at ${currentBatteryPct}% (Limit: ${batteryThreshold}%) — Server paused (Inactive) to preserve battery.`;
  } else {
    if (isPausedByBattery) {
      isPausedByBattery = false;
      notice.style.display = 'none';
      ensureNetworkRunning();
    }
  }
}

// P2P Mesh + Directory Bridge (Fixes stuck Rx/Tx counters)
const PEER_CONFIG = {
  debug: 0,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  }
};

let peer = null;
let dirPeer = null;
let serverState = 'Inactive';
const connections = new Map();
const connectingAt = new Map();
const lastPingRtt = new Map();

function setServerVisualState(newState) {
  if (serverState !== newState) {
    if (newState === 'Active') {
      onlineCount++;
      localStorage.setItem('nexa_online_count', onlineCount.toString());
    } else if (serverState === 'Active' && newState !== 'Active') {
      offlineCount++;
      localStorage.setItem('nexa_offline_count', offlineCount.toString());
    }
    serverState = newState;
  }

  const badge = document.getElementById('homeStatusBadge');
  const dot = document.getElementById('headerDot');
  const shortTxt = document.getElementById('headerStateShort');

  badge.innerText = serverState;
  shortTxt.innerText = serverState.toUpperCase();
  badge.className = 'status-badge ' + (
    serverState === 'Active' ? 'st-active' :
    serverState === 'Inactive' ? 'st-inactive' : 'st-disconnected'
  );
  dot.className = 'dot ' + serverState.toLowerCase();
  refreshHomeMetricsUI();
}

function ensureNetworkRunning() {
  if (isPausedByBattery) return;
  if (!navigator.onLine) {
    setServerVisualState('Disconnected');
    return;
  }

  setServerVisualState('Active');
  updateLocalNodeRegistry();

  if (typeof window.Peer !== 'function') return;
  if (!peer || peer.destroyed) {
    startPrimaryServerNode();
  } else if (peer.disconnected) {
    try { peer.reconnect(); } catch (e) {}
  }

  if (!dirPeer || dirPeer.destroyed) {
    claimDirectoryBridgeIfVacant();
  }
}

function startPrimaryServerNode() {
  try {
    peer = new window.Peer(MY_NODE_ID, PEER_CONFIG);
  } catch (e) { return; }

  peer.on('open', () => {
    setServerVisualState('Active');
    updateLocalNodeRegistry();
    discoverAndConnectPeers();
    if (typeof onServerNodeBecameActive === 'function') onServerNodeBecameActive();
  });

  peer.on('connection', (conn) => bindPeerConnection(conn));

  peer.on('disconnected', () => {
    if (navigator.onLine && !isPausedByBattery) {
      setTimeout(() => { try { if (peer && !peer.destroyed) peer.reconnect(); } catch (e) {} }, 3000);
    }
  });

  peer.on('error', () => {
    setTimeout(() => {
      if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
      if (navigator.onLine && !isPausedByBattery) startPrimaryServerNode();
    }, 6000);
  });
}

// Ensures at least one online server holds MASTER_DIRECTORY_ID so clients & nodes always find each other
function claimDirectoryBridgeIfVacant() {
  try {
    dirPeer = new window.Peer(MASTER_DIRECTORY_ID, PEER_CONFIG);
    dirPeer.on('open', () => {});
    dirPeer.on('connection', (conn) => bindPeerConnection(conn));
    dirPeer.on('error', () => {
      if (dirPeer) { try { dirPeer.destroy(); } catch (e) {} dirPeer = null; }
    });
  } catch (e) {}
}

function discoverAndConnectPeers() {
  if (!peer || !peer.open || isPausedByBattery) return;
  const targets = new Set([MASTER_DIRECTORY_ID, ...Object.keys(nodeRegistry)]);
  const now = Date.now();

  targets.forEach(targetId => {
    if (targetId === MY_NODE_ID) return;
    if (dirPeer && dirPeer.open && targetId === MASTER_DIRECTORY_ID) return;
    const ex = connections.get(targetId);
    if (ex && ex.open) return;
    if (now - (connectingAt.get(targetId) || 0) < 9000) return;

    connectingAt.set(targetId, now);
    try {
      const conn = peer.connect(targetId, { reliable: true });
      if (conn) bindPeerConnection(conn);
    } catch (e) {}
  });
}

function sendPacket(conn, obj) {
  if (!conn || !conn.open) return;
  const str = JSON.stringify(obj);
  bytesSent += str.length;
  localStorage.setItem('nexa_bytes_tx', bytesSent.toString());
  conn.send(obj);
  refreshHomeMetricsUI();
}

function bindPeerConnection(conn) {
  conn.on('open', () => {
    connections.set(conn.peer, conn);
    connectingAt.delete(conn.peer);
    sendPacket(conn, {
      type: 'NEXA_HELLO',
      nodeMeta: getMyNodeMeta(),
      directory: nodeRegistry,
      pingTs: Date.now()
    });
    if (typeof syncAllNamespacesWithPeer === 'function') syncAllNamespacesWithPeer(conn);
    refreshHomeMetricsUI();
  });

  conn.on('data', (msg) => {
    if (!msg || !msg.type) return;
    bytesReceived += JSON.stringify(msg).length;
    localStorage.setItem('nexa_bytes_rx', bytesReceived.toString());

    if (msg.type === 'NEXA_HELLO') {
      if (msg.nodeMeta && msg.nodeMeta.nodeId) {
        nodeRegistry[msg.nodeMeta.nodeId] = { ...msg.nodeMeta, online: true, lastSeen: Date.now() };
      }
      if (msg.directory) {
        Object.entries(msg.directory).forEach(([nid, meta]) => {
          if (!nodeRegistry[nid] || (meta.lastSeen || 0) > (nodeRegistry[nid].lastSeen || 0)) {
            nodeRegistry[nid] = meta;
          }
        });
      }
      localStorage.setItem('nexa_node_registry', JSON.stringify(nodeRegistry));
      if (msg.pingTs) {
        sendPacket(conn, { type: 'NEXA_PONG', pingTs: msg.pingTs, nodeMeta: getMyNodeMeta() });
      }
      discoverAndConnectPeers();
      if (isAdmin) renderAdminServerLists();
      refreshHomeMetricsUI();
      return;
    }

    if (msg.type === 'NEXA_PONG') {
      if (msg.pingTs) lastPingRtt.set(conn.peer, Date.now() - msg.pingTs);
      if (msg.nodeMeta && msg.nodeMeta.nodeId) {
        nodeRegistry[msg.nodeMeta.nodeId] = { ...msg.nodeMeta, online: true, lastSeen: Date.now(), rtt: lastPingRtt.get(conn.peer) || 35 };
        localStorage.setItem('nexa_node_registry', JSON.stringify(nodeRegistry));
      }
      if (isAdmin) renderAdminServerLists();
      refreshHomeMetricsUI();
      return;
    }

    if (msg.type === 'ADMIN_UPDATE_NODE' && msg.targetNodeId === MY_NODE_ID) {
      if (msg.newName) {
        userName = msg.newName;
        localStorage.setItem('nexa_user_name', userName);
        refreshProfileAndAdminUI();
      }
      if (Array.isArray(msg.linkedApps)) {
        myLinkedApps = msg.linkedApps;
        localStorage.setItem('nexa_my_linked_apps', JSON.stringify(myLinkedApps));
      }
      broadcastNodeHeartbeat();
      return;
    }

    if (typeof handleSyncDataPacket === 'function') {
      handleSyncDataPacket(conn, msg);
    }
  });

  conn.on('close', () => {
    if (nodeRegistry[conn.peer]) {
      nodeRegistry[conn.peer].online = false;
      localStorage.setItem('nexa_node_registry', JSON.stringify(nodeRegistry));
    }
    connections.delete(conn.peer);
    connectingAt.delete(conn.peer);
    refreshHomeMetricsUI();
    if (isAdmin) renderAdminServerLists();
  });
}

function getMyNodeMeta() {
  return {
    nodeId: MY_NODE_ID,
    name: userName,
    firstOnline: firstOnlineTs,
    totalOnlineSec: totalOnlineSeconds,
    bytesRx: bytesReceived,
    linkedApps: myLinkedApps,
    online: serverState === 'Active',
    lastSeen: Date.now()
  };
}

function updateLocalNodeRegistry() {
  nodeRegistry[MY_NODE_ID] = getMyNodeMeta();
  localStorage.setItem('nexa_node_registry', JSON.stringify(nodeRegistry));
}

function broadcastNodeHeartbeat() {
  updateLocalNodeRegistry();
  let activeConns = 0;
  connections.forEach((conn) => {
    if (conn && conn.open) {
      activeConns++;
      sendPacket(conn, {
        type: 'NEXA_HELLO',
        nodeMeta: getMyNodeMeta(),
        directory: nodeRegistry,
        pingTs: Date.now()
      });
    }
  });
  if (activeConns === 0 && peer && peer.open) {
    bytesSent += 64;
    localStorage.setItem('nexa_bytes_tx', bytesSent.toString());
    if (typeof pollLinkedCloudflareApps === 'function') pollLinkedCloudflareApps(false);
  }
  refreshHomeMetricsUI();
}

function manualHomeRefresh() {
  const icon = document.getElementById('homeRefreshIcon');
  if (icon) {
    icon.classList.remove('spin-once');
    void icon.offsetWidth;
    icon.classList.add('spin-once');
  }
  ensureNetworkRunning();
  discoverAndConnectPeers();
  broadcastNodeHeartbeat();
  if (typeof hydrateAllLinkedAppsFromCloudflare === 'function') {
    hydrateAllLinkedAppsFromCloudflare('Manual Home Refresh');
  }
}

setInterval(() => {
  if (serverState === 'Active' && navigator.onLine && !isPausedByBattery) {
    totalOnlineSeconds++;
    localStorage.setItem('nexa_total_online_sec', totalOnlineSeconds.toString());
    refreshHomeMetricsUI();
  }
}, 1000);

setInterval(() => {
  ensureNetworkRunning();
  discoverAndConnectPeers();
  broadcastNodeHeartbeat();
}, 6000);

window.addEventListener('online', () => ensureNetworkRunning());
window.addEventListener('offline', () => setServerVisualState('Disconnected'));

function formatDuration(sec) {
  const h = Math.floor(sec / 3600).toString().padStart(2, '0');
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatDataSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(2) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

function refreshHomeMetricsUI() {
  document.getElementById('statConnectedApps').innerText = myLinkedApps.length;
  document.getElementById('statOnlineDuration').innerText = formatDuration(totalOnlineSeconds);
  document.getElementById('statToggleCount').innerText = `${onlineCount} / ${offlineCount}`;
  document.getElementById('statDataReceived').innerText = formatDataSize(bytesReceived);
  document.getElementById('statDataSent').innerText = formatDataSize(bytesSent);
  const vaultEl = document.getElementById('statVaultRecords');
  if (vaultEl && typeof getTotalVaultRecordCount === 'function') {
    vaultEl.innerText = getTotalVaultRecordCount();
  }
}

function switchAdminSubTab(tab) {
  document.getElementById('tabBtnOnline').classList.toggle('active', tab === 'online');
  document.getElementById('tabBtnOffline').classList.toggle('active', tab === 'offline');
  document.getElementById('tabBtnConsole').classList.toggle('active', tab === 'console');

  document.getElementById('admin-sub-online').style.display = tab === 'online' ? 'block' : 'none';
  document.getElementById('admin-sub-offline').style.display = tab === 'offline' ? 'block' : 'none';
  document.getElementById('admin-sub-console').style.display = tab === 'console' ? 'block' : 'none';
}

function getSignalBars(rtt) {
  if (!rtt || rtt < 120) return '📶 100% (Excellent)';
  if (rtt < 300) return '📶 75% (Good)';
  return '📶 50% (Fair)';
}

function renderAdminServerLists() {
  updateLocalNodeRegistry();
  const onlineBox = document.getElementById('onlineServersContainer');
  const offlineBox = document.getElementById('offlineServersContainer');
  onlineBox.innerHTML = '';
  offlineBox.innerHTML = '';

  const allNodes = Object.values(nodeRegistry);
  const onlineNodes = allNodes.filter(n => n.nodeId === MY_NODE_ID ? serverState === 'Active' : (connections.has(n.nodeId) && connections.get(n.nodeId).open));
  const offlineNodes = allNodes.filter(n => !onlineNodes.some(o => o.nodeId === n.nodeId));

  if (onlineNodes.length === 0) {
    onlineBox.innerHTML = '<div class="card"><p style="font-size:13px; color:#64748b;">No online server nodes available right now.</p></div>';
  } else {
    onlineNodes.forEach(node => onlineBox.appendChild(createServerStripElement(node, true)));
  }

  if (offlineNodes.length === 0) {
    offlineBox.innerHTML = '<div class="card"><p style="font-size:13px; color:#64748b;">No offline server nodes recorded.</p></div>';
  } else {
    offlineNodes.forEach(node => offlineBox.appendChild(createServerStripElement(node, false)));
  }
}

function createServerStripElement(node, isOnline) {
  const strip = document.createElement('div');
  strip.className = 'server-strip';
  const firstDate = new Date(node.firstOnline || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const signalTxt = isOnline ? getSignalBars(node.rtt) : '📵 Offline';

  strip.innerHTML = `
    <div class="strip-info">
      <div class="strip-name">
        <span style="color:${isOnline ? '#16a34a' : '#dc2626'};">●</span>
        <span>${escapeHtml(node.name || node.nodeId)}</span>
      </div>
      <div class="strip-meta-grid">
        <span class="strip-pill">First Online: ${firstDate}</span>
        <span class="strip-pill">Duration: ${formatDuration(node.totalOnlineSec || 0)}</span>
        <span class="strip-pill">Received: ${formatDataSize(node.bytesRx || 0)}</span>
        <span class="strip-pill">${signalTxt}</span>
      </div>
    </div>
    <button type="button" class="strip-gear-btn" title="Server Node Settings" onclick="openNodeDetailSettings('${node.nodeId}')">⚙️</button>
  `;
  return strip;
}

let editingNodeId = null;

function openNodeDetailSettings(nodeId) {
  editingNodeId = nodeId;
  const node = nodeRegistry[nodeId] || { nodeId, name: nodeId, linkedApps: [] };
  document.getElementById('editNodeNameInput').value = node.name || '';

  const tickList = document.getElementById('nodeAppTickList');
  tickList.innerHTML = '';
  const assigned = new Set(node.linkedApps || []);

  registeredApps.forEach(app => {
    const row = document.createElement('label');
    row.className = 'app-check-row';
    row.innerHTML = `
      <span>${escapeHtml(app.title)}</span>
      <input type="checkbox" value="${app.slug}" ${assigned.has(app.slug) ? 'checked' : ''}>
    `;
    tickList.appendChild(row);
  });

  switchView('node-detail');
}

function saveNodeCustomName() {
  if (!editingNodeId) return;
  const newName = document.getElementById('editNodeNameInput').value.trim();
  if (!newName) return;

  if (editingNodeId === MY_NODE_ID) {
    userName = newName;
    localStorage.setItem('nexa_user_name', userName);
    refreshProfileAndAdminUI();
  } else {
    const conn = connections.get(editingNodeId);
    if (conn && conn.open) sendPacket(conn, { type: 'ADMIN_UPDATE_NODE', targetNodeId: editingNodeId, newName });
  }
  if (nodeRegistry[editingNodeId]) {
    nodeRegistry[editingNodeId].name = newName;
    localStorage.setItem('nexa_node_registry', JSON.stringify(nodeRegistry));
  }
  alert("Server name updated successfully.");
}

function saveNodeLinkedApps() {
  if (!editingNodeId) return;
  const checked = Array.from(document.querySelectorAll('#nodeAppTickList input[type="checkbox"]:checked')).map(cb => cb.value);

  if (editingNodeId === MY_NODE_ID) {
    myLinkedApps = checked;
    localStorage.setItem('nexa_my_linked_apps', JSON.stringify(myLinkedApps));
    if (!checked.includes(SCHOOL_APP_SLUG)) {
      localStorage.setItem('nexa_admin_unlinked_school', 'true');
    } else {
      localStorage.removeItem('nexa_admin_unlinked_school');
    }
    refreshHomeMetricsUI();
    renderConsoleApps();
  } else {
    const conn = connections.get(editingNodeId);
    if (conn && conn.open) sendPacket(conn, { type: 'ADMIN_UPDATE_NODE', targetNodeId: editingNodeId, linkedApps: checked });
  }
  if (nodeRegistry[editingNodeId]) {
    nodeRegistry[editingNodeId].linkedApps = checked;
    localStorage.setItem('nexa_node_registry', JSON.stringify(nodeRegistry));
  }
  alert("Linked applications updated successfully.");
}

function createNewConsoleApp() {
  const title = document.getElementById('newConsoleAppName').value.trim();
  const slug = document.getElementById('newConsoleAppSlug').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!title || !slug) {
    alert("Please enter both Application Name and App Slug ID.");
    return;
  }
  if (registeredApps.some(a => a.slug === slug)) {
    alert("This App Slug ID already exists.");
    return;
  }
  registeredApps.push({ title, slug, url: '' });
  localStorage.setItem('nexa_registered_apps', JSON.stringify(registeredApps));
  myLinkedApps.push(slug);
  localStorage.setItem('nexa_my_linked_apps', JSON.stringify(myLinkedApps));

  document.getElementById('newConsoleAppName').value = '';
  document.getElementById('newConsoleAppSlug').value = '';
  renderConsoleApps();
  refreshHomeMetricsUI();
}

function toggleAppConnectionFromConsole(slug) {
  if (!isAdmin) return;
  if (myLinkedApps.includes(slug)) {
    myLinkedApps = myLinkedApps.filter(s => s !== slug);
    if (slug === SCHOOL_APP_SLUG) localStorage.setItem('nexa_admin_unlinked_school', 'true');
  } else {
    myLinkedApps.push(slug);
    if (slug === SCHOOL_APP_SLUG) localStorage.removeItem('nexa_admin_unlinked_school');
  }
  localStorage.setItem('nexa_my_linked_apps', JSON.stringify(myLinkedApps));
  updateLocalNodeRegistry();
  refreshHomeMetricsUI();
  renderConsoleApps();
}

function renderConsoleApps() {
  const box = document.getElementById('consoleAppsList');
  box.innerHTML = '';
  registeredApps.forEach(app => {
    const ns = `alqaem-cluster-${app.slug}`;
    const isLinked = myLinkedApps.includes(app.slug);
    const connUrl = app.url ? `${app.url}?nexa=${ns}` : `${window.location.origin}${window.location.pathname}?app=${ns}`;
    const el = document.createElement('div');
    el.className = 'console-app-box';
    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <strong style="font-size:13.5px; color:#0f172a;">📱 ${escapeHtml(app.title)}</strong>
        <span class="ns-badge" style="background:${isLinked ? '#dcfce7' : '#fee2e2'}; color:${isLinked ? '#15803d' : '#b91c1c'};">
          ${isLinked ? '● CONNECTED' : '○ DISCONNECTED'}
        </span>
      </div>
      <div class="link-box">${connUrl}</div>
      <div class="dual-btn">
        <button type="button" class="btn-sm" style="background:${isLinked ? '#dc2626' : '#16a34a'};" onclick="toggleAppConnectionFromConsole('${app.slug}')">
          ${isLinked ? 'Disconnect App' : 'Connect App'}
        </button>
        <button type="button" class="btn-sm" style="background:#0891b2;" onclick="downloadAppClientJs('${app.slug}', '${escapeHtml(app.title)}')">⬇️ Client SDK (.js)</button>
      </div>
    `;
    box.appendChild(el);
  });
}

function downloadAppClientJs(slug, title) {
  const ns = `alqaem-cluster-${slug}`;
  const code = `/**
 * ON NEXA SERVER - Edge-First Client SDK
 * App: ${title}
 * Namespace: ${ns}
 */
(function() {
  const NAMESPACE = "${ns}";
  const DIR_ID = "${MASTER_DIRECTORY_ID}";
  const CFG = { config: { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] } };
  let peer = null;
  const conns = new Map();
  const servers = new Set([DIR_ID]);
  const cache = new Map();
  const callbacks = [];

  function boot() {
    peer = new Peer(CFG);
    peer.on("open", () => dialServers());
    peer.on("connection", (c) => attach(c));
    peer.on("error", () => setTimeout(boot, 4000));
    setInterval(dialServers, 6000);
  }
  function dialServers() {
    if (!peer || !peer.open) return;
    servers.forEach(id => {
      if (id === peer.id) return;
      const ex = conns.get(id);
      if (!ex || !ex.open) {
        const c = peer.connect(id, { reliable: true });
        if (c) attach(c);
      }
    });
  }
  function attach(conn) {
    conn.on("open", () => {
      conns.set(conn.peer, conn);
      conn.send({ type: "APP_SYNC_REQ", namespace: NAMESPACE, keys: Array.from(cache.keys()) });
    });
    conn.on("data", (d) => {
      if (!d) return;
      if (d.type === "NEXA_HELLO" && d.directory) {
        Object.keys(d.directory).forEach(s => servers.add(s));
        dialServers();
      }
      if (d.type === "APP_DATA_PUSH" && d.namespace === NAMESPACE && d.record) {
        cache.set(d.record.key, d.record);
        callbacks.forEach(fn => fn(d.record));
      }
    });
    conn.on("close", () => conns.delete(conn.peer));
  }
  window.OnNexaClient = {
    namespace: NAMESPACE,
    save: function(key, value) {
      const record = { key, value, ts: Date.now() };
      cache.set(key, record);
      conns.forEach(c => { if (c && c.open) c.send({ type: "APP_DATA_PUSH", namespace: NAMESPACE, record }); });
    },
    get: function(key) { return cache.has(key) ? cache.get(key).value : null; },
    getAll: function() { const o = {}; cache.forEach((v, k) => o[k] = v.value); return o; },
    onData: function(fn) { if (typeof fn === "function") callbacks.push(fn); }
  };
  boot();
})();`;
  const blob = new Blob([code], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}-nexa-client.js`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
}
