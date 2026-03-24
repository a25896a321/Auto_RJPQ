import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, onValue, update, onDisconnect, push, serverTimestamp, remove, runTransaction } from "firebase/database";

let config = null;
let db = null;
let roomId = null;
let myUid = null;
let myInfo = { nick: '', color: '#7B241C', textColor: '#FFFFFF', isHost: false };
let roomData = null;
let options = { auto: true, members: true, chat: true, seq: '1234' };
let idleTimer = null;

const BOT_NAMES = ['💀A', '💀B', '💀C'];

// ===== INIT =====
async function init() {
    try {
        const resp = await fetch('app_config.json');
        config = await resp.json();
        setupUIStrings();

        // Firebase Init
        const app = initializeApp(config.firebaseConfig);
        db = getDatabase(app);

        // Real-time server stats and cleanup of ghost empty rooms
        onValue(ref(db, 'rooms'), (snap) => {
            const rooms = snap.val() || {};
            let totalPlayers = 0;
            let validRoomCount = 0;

            Object.entries(rooms).forEach(([rid, r]) => {
                const pCount = r.players ? Object.keys(r.players).length : 0;
                if (pCount === 0) {
                    remove(ref(db, `rooms/${rid}`));
                } else {
                    validRoomCount++;
                    totalPlayers += pCount;
                }
            });

            document.getElementById('stat-rooms').textContent = validRoomCount;
            document.getElementById('stat-users').textContent = totalPlayers;
        });

        // Local state UID
        myUid = localStorage.getItem('rjpq_uid') || 'u' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem('rjpq_uid', myUid);

        // Sync sequences in dropdown
        const seqSel = document.getElementById('cr-seq');
        config.gameSettings.gridSequences.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id; opt.textContent = s.label;
            if (s.id === '1234') opt.selected = true;
            seqSel.appendChild(opt);
        });

        // Color syncing
        document.getElementById('lb-col-inp').addEventListener('input', e => {
            document.getElementById('lb-col-sw').style.background = e.target.value;
            myInfo.color = e.target.value;
        });
        document.getElementById('lb-txt-inp').addEventListener('input', e => {
            document.getElementById('lb-txt-sw').style.background = e.target.value;
            myInfo.textColor = e.target.value;
        });

        // Check hash for auto-join
        const hash = window.location.hash.substring(1);
        if (hash && /^\d{8}$/.test(hash)) {
            showLanding(hash);
        }

        log('系統已就緒，請建立或加入房間。', 'ok');
    } catch (e) {
        console.error(e);
        log('設定檔加載失敗，請檢查 app_config.json', 'error');
    }
}

function setupUIStrings() {
    const s = config.uiStrings['zh-TW'];
    document.getElementById('txt-lobby-title').textContent = s.lobby.title;
    document.getElementById('txt-player-section').textContent = s.lobby.playerSection;
    document.getElementById('lb-nick').placeholder = s.lobby.nickPlaceholder;
    document.getElementById('txt-create-room').textContent = s.lobby.createRoom;
    document.getElementById('txt-join-room').textContent = s.lobby.joinRoom;
    document.getElementById('txt-btn-create').textContent = s.buttons.create;
    document.getElementById('txt-btn-join').textContent = s.buttons.join;
    document.getElementById('txt-stats-title').textContent = s.lobby.statsTitle;
}

// ===== CORE ACTIONS =====

async function doCreate() {
    const nick = document.getElementById('lb-nick').value.trim() || '未命名1';
    const pw = document.getElementById('cr-pw').value.trim();
    const newRoomId = Math.floor(10000000 + Math.random() * 90000000).toString();

    const configColors = config.gameSettings.defaultColors;
    myInfo = {
        nick,
        color: document.getElementById('lb-col-inp').value,
        textColor: document.getElementById('lb-txt-inp').value,
        isHost: true
    };

    // Initial Map Data (10x4)
    const mapData = Array(10).fill(null).map(() =>
        Array(4).fill(null).map(() => ({ v: 0, owner: null, errors: [], maybe: [], certain: false }))
    );

    const roomState = {
        config: {
            name: document.getElementById('cr-name').value.trim() || '未命名的房間',
            password: pw,
            options: {
                auto: document.getElementById('cr-auto').checked,
                members: document.getElementById('cr-members').checked,
                chat: document.getElementById('cr-chat').checked,
                seq: document.getElementById('cr-seq').value
            },
            createdAt: serverTimestamp(),
            lastActive: serverTimestamp(),
            hostId: myUid
        },
        players: {
            [myUid]: myInfo
        },
        mapData: mapData
    };

    log('正在建立房間...', 'info');
    try {
        await set(ref(db, `rooms/${newRoomId}`), roomState);
        joinRoomStream(newRoomId);
    } catch (err) {
        log('建立失敗: ' + err.message, 'error');
    }
}

async function doJoinLanding() {
    const rid = document.getElementById('landing-rid-badge').textContent.replace('#', '');
    const nick = document.getElementById('ld-nick').value.trim();
    const pw = document.getElementById('ld-pw').value.trim();
    const color = document.getElementById('ld-col-inp').value;
    const textColor = document.getElementById('ld-txt-inp').value;

    // Prefill main inputs just in case
    document.getElementById('lb-nick').value = nick;
    document.getElementById('lb-col-inp').value = color;
    document.getElementById('lb-txt-inp').value = textColor;
    document.getElementById('jo-id').value = rid;
    document.getElementById('jo-pw').value = pw;

    doJoin();
}

function showLanding(rid) {
    document.getElementById('screen-lobby').style.display = 'none';
    document.getElementById('screen-landing').style.display = 'flex';
    document.getElementById('landing-rid-badge').textContent = '#' + rid;

    // Sync color swatches in landing
    document.getElementById('ld-col-inp').addEventListener('input', e => {
        document.getElementById('ld-col-sw').style.background = e.target.value;
    });
    document.getElementById('ld-txt-inp').addEventListener('input', e => {
        document.getElementById('ld-txt-sw').style.background = e.target.value;
    });
}

async function doJoin() {
    const targetRoomId = document.getElementById('jo-id').value.trim();
    const pw = document.getElementById('jo-pw').value.trim();
    if (!/^\d{8}$/.test(targetRoomId)) return alert('房號應為 8 位數字。');

    log('正在加入房間...', 'info');
    try {
        const snapshot = await get(ref(db, `rooms/${targetRoomId}`));
        if (!snapshot.exists()) return alert('房間不存在。');

        const data = snapshot.val();
        if (data.config.password && data.config.password !== pw) return alert('密碼錯誤。');

        const playerArray = Object.values(data.players || {});
        if (playerArray.length >= 4) return alert('房間已滿。');

        const nick = document.getElementById('lb-nick').value.trim() || ('未命名' + (playerArray.length + 1));
        const colorList = config.gameSettings.defaultColors;
        const usedColors = playerArray.map(p => p.color.toUpperCase());
        let color = document.getElementById('lb-col-inp').value.toUpperCase();

        // High-precision color conflict resolution:
        // 1. If user didn't change default red (colorList[0])
        // 2. OR if user's choice is already taken by someone in the room
        if (color === colorList[0].toUpperCase() || usedColors.includes(color)) {
            const nextBest = colorList.find(c => !usedColors.includes(c.toUpperCase()));
            if (nextBest) {
                color = nextBest.toUpperCase();
                // Update UI right away so it doesn't revert
                document.getElementById('lb-col-inp').value = color;
                document.getElementById('lb-col-sw').style.background = color;
            }
        }

        myInfo = { nick, color, textColor: document.getElementById('lb-txt-inp').value, isHost: false };

        if (playerArray.some(p => p.nick === nick)) return alert('暱稱重複。');

        await set(ref(db, `rooms/${targetRoomId}/players/${myUid}`), myInfo);
        joinRoomStream(targetRoomId);
    } catch (err) {
        log('加入失敗: ' + err.message, 'error');
    }
}

function joinRoomStream(rid) {
    roomId = rid;
    window.location.hash = rid;
    document.getElementById('screen-lobby').style.display = 'none';
    document.getElementById('screen-landing').style.display = 'none';
    document.getElementById('screen-room').style.display = 'flex';
    document.getElementById('rid-box').textContent = `房號: ${rid}`;

    // Sync room-screen inputs from current info
    document.getElementById('rm-nick').value = myInfo.nick;
    document.getElementById('rm-col-inp').value = myInfo.color;
    document.getElementById('rm-col-sw').style.background = myInfo.color;
    document.getElementById('rm-txt-inp').value = myInfo.textColor;
    document.getElementById('rm-txt-sw').style.background = myInfo.textColor;

    // Room-screen color listeners
    document.getElementById('rm-col-inp').addEventListener('input', e => {
        document.getElementById('rm-col-sw').style.background = e.target.value;
    });
    document.getElementById('rm-txt-inp').addEventListener('input', e => {
        document.getElementById('rm-txt-sw').style.background = e.target.value;
    });

    // Logs subscription
    const logsRef = ref(db, `rooms/${rid}/logs`);
    let lastLogTime = Date.now();
    onValue(logsRef, (snap) => {
        const data = snap.val();
        if (!data) return;
        const entries = Object.values(data);
        entries.forEach(e => {
            if (e.time > lastLogTime) {
                log(e.msg, e.type);
                lastLogTime = e.time;
            }
        });
    });

    // Subscribe
    onValue(ref(db, `rooms/${rid}`), (snap) => {
        if (!snap.exists()) {
            if (roomId) {
                alert('房間已被刪除或失效。');
                leaveRoom();
            }
            return;
        }
        roomData = snap.val();
        options = roomData.config.options;
        renderRoom();
        resetIdleTimer();
    });

    // Auto remove on disconnect
    onDisconnect(ref(db, `rooms/${rid}/players/${myUid}`)).remove();

    log(`連線成功！房號: ${rid}`, 'ok');
}

function renderRoom() {
    if (!roomData) return;
    const players = Object.values(roomData.players || {});
    const isHost = roomData.config.hostId === myUid;
    myInfo.isHost = isHost;

    // Update labels
    document.getElementById('room-name-display').textContent = `房間: ${roomData.config.name || '未命名'}`;
    document.getElementById('room-badge').textContent = `成員: ${players.length}/4`;
    document.getElementById('btn-reset').style.display = isHost ? 'inline-flex' : 'none';
    document.getElementById('btn-edit-pw').style.display = isHost ? 'inline-flex' : 'none';
    document.getElementById('chat-sec').style.display = options.chat ? 'block' : 'none';
    document.getElementById('members-sec').style.display = options.members ? 'block' : 'none';

    // Password view
    if (roomData.config.password) {
        document.getElementById('pw-row').style.display = 'grid';
        document.getElementById('pw-box').textContent = `密碼: ${roomData.config.password}`;
    } else {
        document.getElementById('pw-row').style.display = isHost ? 'grid' : 'none';
        document.getElementById('pw-box').textContent = isHost ? '密碼: (未設定)' : '';
    }

    renderPlayerList(roomData.players || {});
    renderGrid();
    updatePathRecord();

    // Check for closed room
    if (roomData.config.status === 'closed') {
        alert('房主已重建/關閉房間，連線已失效。');
        leaveRoom();
        return;
    }
}

function renderPlayerList(playersObj) {
    const plist = document.getElementById('plist');
    plist.innerHTML = '';
    const players = Object.entries(playersObj);
    const isHost = roomData.config.hostId === myUid;

    // Real players
    players.forEach(([uid, p]) => {
        const span = document.createElement('span');
        span.className = 'mtag';
        span.style.color = p.color;
        span.style.background = p.color + '22';
        span.style.borderColor = p.color + '66';
        span.style.paddingRight = (isHost && uid !== myUid) ? '4px' : '10px';

        let html = (p.isHost ? '👑 ' : '🙎‍♂️ ') + p.nick;
        if (isHost && uid !== myUid) {
            html += ` <button onclick="app.kickPlayer('${uid}', '${p.nick}')" style="background:none; border:none; color:#ef4444; cursor:pointer; font-weight:bold; margin-left:5px;">x</button>`;
        }
        span.innerHTML = html;
        plist.appendChild(span);
    });

    // Bots
    const botCount = 4 - players.length;
    for (let i = 0; i < botCount; i++) {
        const span = document.createElement('span');
        span.className = 'mtag';
        span.style.opacity = '0.4';
        span.style.fontStyle = 'italic';
        span.textContent = BOT_NAMES[i];
        plist.appendChild(span);
    }
}

function renderGrid() {
    const container = document.getElementById('map-grid');
    container.innerHTML = '';

    for (let f = 0; f < 10; f++) {
        const floor = roomData.mapData[f];
        const row = document.createElement('div');
        row.className = 'floor-row';
        row.innerHTML = `<div class="floor-label">L${10 - f}</div>`;

        const grid = document.createElement('div');
        grid.className = 'door-grid';

        floor.forEach((cell, d) => {
            const door = document.createElement('div');
            door.id = `door-${f}-${d}`;
            door.className = 'door';

            // Background sequence hint
            let seq = '';
            if (options.seq === '1234') seq = (d + 1);
            else if (options.seq === '4321') seq = (4 - d);

            door.innerHTML = `<div class="door-seq">${seq}</div><div class="door-icon"></div><div class="door-owner"></div>`;

            const icon = door.querySelector('.door-icon');
            const owner = door.querySelector('.door-owner');

            if (cell.v === 1) {
                door.classList.add('is-correct');
                door.style.background = `linear-gradient(135deg, ${cell.ownerColor || '#888'}, #000)`;
                icon.textContent = 'O'; icon.style.color = '#fff';
                owner.textContent = cell.owner; owner.style.color = '#fff';
            } else {
                // Priority: Personal Errors -> Shared Certainty -> Shared Maybe
                if (cell.errors && cell.errors.includes(myInfo.nick)) {
                    door.classList.add('is-error');
                    icon.textContent = '✗'; icon.style.color = '#ef4444';
                    if (cell.maybe && cell.maybe.length > 0) owner.textContent = '(' + cell.maybe.join('/') + ')';
                } else if (cell.certain) {
                    door.classList.add('is-certain');
                    const winner = (cell.maybe && cell.maybe.length > 0) ? cell.maybe[0] : '???';
                    icon.textContent = '★'; icon.style.color = config?.gameSettings?.defaultColors?.[0] || '#f59e0b';
                    owner.textContent = winner;
                } else if (cell.maybe && cell.maybe.length > 0) {
                    icon.textContent = '?'; icon.style.color = '#8b5cf6';
                    owner.textContent = '(' + cell.maybe.join('/') + ')';
                }
            }

            door.onclick = () => handleCellClick(f, d, 'left');
            door.oncontextmenu = (e) => { e.preventDefault(); handleCellClick(f, d, 'right'); };

            grid.appendChild(door);
        });
        row.appendChild(grid);
        container.appendChild(row);
    }
}

/**
 * 計算樓層更新邏輯 (不直接寫入 DB，回傳 updates 物件)
 */
function getFloorUpdates(f, d, btn, floorData, currentNick, currentColor, auto) {
    const updates = {};
    const cell = floorData[d];
    let msg = '';
    let type = 'info';

    if (btn === 'left') {
        if (cell.v === 1 && cell.owner === currentNick) {
            // 本人取消標記
            updates[`${d}/v`] = 0;
            updates[`${d}/owner`] = null;
            updates[`${d}/ownerColor`] = null;
            if (auto) {
                // 清理此玩家在整層樓產生的所有自動 Errors
                for (let i = 0; i < 4; i++) {
                    const errKey = `${i}/errors`;
                    let eList = floorData[i].errors || [];
                    updates[errKey] = eList.filter(e => e !== currentNick);
                }
            }
            msg = `取消標記 L${10 - f}`;
            type = 'warn';
        } else {
            // 標記為正確 (點擊新格：不論是換位、或取代他人)
            
            // 1. 遍歷整層，清理所有原本存在的正確格及其對應的自動 Errors
            for (let i = 0; i < 4; i++) {
                if (floorData[i].v === 1) {
                    const prevNick = floorData[i].owner;
                    
                    // 清除原本格子的 Correct 狀態
                    updates[`${i}/v`] = 0;
                    updates[`${i}/owner`] = null;
                    updates[`${i}/ownerColor`] = null;
                    
                    // 清除該舊 OWNER 在整層產生的所有 Errors
                    if (auto && prevNick) {
                        for (let k = 0; k < 4; k++) {
                            const errKey = `${k}/errors`;
                            // 優先從本次 updates 中讀取已有的變更，否則從 floorData 讀取
                            let currentEList = updates[errKey] !== undefined ? updates[errKey] : (floorData[k].errors || []);
                            updates[errKey] = currentEList.filter(e => e !== prevNick);
                        }
                    }
                }
            }

            // 2. 設置新玩家為當前正確格
            updates[`${d}/v`] = 1;
            updates[`${d}/owner`] = currentNick;
            updates[`${d}/ownerColor`] = currentColor;

            // 3. 自動設定新玩家的 Errors (非正確格的其他格)
            if (auto) {
                for (let i = 0; i < 4; i++) {
                    const errKey = `${i}/errors`;
                    let currentEList = updates[errKey] !== undefined ? updates[errKey] : (floorData[i].errors || []);
                    if (i === d) {
                        // 正確格不應標記自己為 Error
                        updates[errKey] = currentEList.filter(e => e !== currentNick);
                    } else {
                        // 其他格標記自己為 Error
                        if (!currentEList.includes(currentNick)) {
                            updates[errKey] = [...currentEList, currentNick];
                        }
                    }
                }
            }
            msg = `標記 L${10 - f} 正確：第${d + 1}格`;
            type = 'ok';
        }
    } else if (btn === 'right') {
        if (cell.v === 1) return { updates: {} };
        let eList = cell.errors || [];
        if (eList.includes(currentNick)) {
            updates[`${d}/errors`] = eList.filter(e => e !== currentNick);
        } else {
            if (eList.length >= 4) return { updates: {} };
            updates[`${d}/errors`] = [...eList, currentNick];
        }
    }
    return { updates, msg, type };
}

/**
 * 核心：計算可能性標記 (純函數，直接修改傳入的 floor 陣列)
 */
function calculateFloorMaybe(floor, playersObj) {
    const playersInRoom = Object.values(playersObj).map(p => p.nick);
    const botCount = 4 - playersInRoom.length;
    const allPlayers = [...playersInRoom, ...BOT_NAMES.slice(0, botCount)];

    const passOwners = new Set();
    floor.forEach(c => { if (c.v === 1 && c.owner) passOwners.add(c.owner); });

    const activePlayers = allPlayers.filter(p => !passOwners.has(p));
    const unpassedIdx = [];
    floor.forEach((c, i) => { if (c.v !== 1) unpassedIdx.push(i); });

    if (activePlayers.length === 0 || unpassedIdx.length === 0) {
        unpassedIdx.forEach(d => { floor[d].maybe = []; floor[d].certain = false; });
        return floor;
    }

    const possible = {};
    activePlayers.forEach(p => {
        possible[p] = {};
        unpassedIdx.forEach(d => {
            possible[p][d] = !(floor[d].errors || []).includes(p);
        });
    });

    let changed = true;
    while (changed) {
        changed = false;
        unpassedIdx.forEach(d => {
            const potential = activePlayers.filter(p => possible[p][d]);
            if (potential.length === 1) {
                const winner = potential[0];
                unpassedIdx.forEach(d2 => {
                    if (d2 !== d && possible[winner][d2]) { possible[winner][d2] = false; changed = true; }
                });
            }
        });
        activePlayers.forEach(p => {
            const potentialDoors = unpassedIdx.filter(d => possible[p][d]);
            if (potentialDoors.length === 1) {
                const winnerDoor = potentialDoors[0];
                activePlayers.forEach(p2 => {
                    if (p2 !== p && possible[p2][winnerDoor]) { possible[p2][winnerDoor] = false; changed = true; }
                });
            }
        });
    }

    unpassedIdx.forEach(d => {
        const pps = activePlayers.filter(p => possible[p][d]);
        if (pps.length === activePlayers.length || pps.length === 0) {
            floor[d].maybe = [];
            floor[d].certain = false;
        } else {
            floor[d].maybe = pps;
            floor[d].certain = pps.length === 1;
        }
    });
    return floor;
}

async function handleCellClick(f, d, btn) {
    if (!roomId || !roomData) return;

    // A. 樂觀 UI 更新：先備份當前樓層狀態
    const backupFloor = JSON.parse(JSON.stringify(roomData.mapData[f]));
    
    // 計算預期變更
    const result = getFloorUpdates(f, d, btn, roomData.mapData[f], myInfo.nick, myInfo.color, options.auto);
    const { updates, msg, type } = result;
    if (Object.keys(updates).length === 0) return;

    // 直接在本地狀態應用變更 (樂觀更新)
    Object.keys(updates).forEach(key => {
        const [idx, prop] = key.split('/');
        roomData.mapData[f][idx][prop] = updates[key];
    });

    // 樂觀計算的可能性
    if (options.auto) {
        calculateFloorMaybe(roomData.mapData[f], roomData.players || {});
    }

    // 立即渲染畫面
    renderRoom();
    if (msg) log(`(樂觀) ${msg}`, type);

    // B. Firebase Transaction 寫入與衝突檢查
    const floorRef = ref(db, `rooms/${roomId}/mapData/${f}`);
    try {
        const txResult = await runTransaction(floorRef, (currentFloor) => {
            if (!currentFloor) return; // 房間可能已被刪除


            // 在伺服器最新數據上重新計算變更 (確保 errors 列表、maybe 列表都是最新的)
            const serverResult = getFloorUpdates(f, d, btn, currentFloor, myInfo.nick, myInfo.color, options.auto);
            if (Object.keys(serverResult.updates).length === 0) return currentFloor;

            // 應用變更到伺服器數據
            Object.keys(serverResult.updates).forEach(key => {
                const [idx, prop] = key.split('/');
                currentFloor[idx][prop] = serverResult.updates[key];
            });

            // 原子化計算可能性
            if (options.auto) {
                calculateFloorMaybe(currentFloor, roomData.players || {});
            }

            return currentFloor;
        });

        if (!txResult.committed) {
            // C. 回滾 (Rollback)：如果被別人搶走了、或交易未成功
            roomData.mapData[f] = backupFloor;
            renderRoom();
            log('標記衝突：該格已被其他玩家搶走', 'error');
        } else {
            // 成功寫入
            updateLastActive();
        }
    } catch (err) {
        console.error("Marker Transaction Error:", err);
        // 回滾
        roomData.mapData[f] = backupFloor;
        renderRoom();
        log('網路異常：已回滾操作', 'error');
    }
}


function updateLastActive() {
    update(ref(db, `rooms/${roomId}/config`), { lastActive: serverTimestamp() });
}

function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
        alert('閒置過久，請重新創建。');
        leaveRoom();
    }, config.gameSettings.idleTimeoutMs);
}

function leaveRoom() {
    if (roomId) {
        // Need to check players count before leaving
        const players = roomData ? roomData.players : {};
        const playerKeys = Object.keys(players || {});

        if (playerKeys.length <= 1 && players[myUid]) {
            // I am the last player
            remove(ref(db, `rooms/${roomId}`));
        } else {
            // Just remove myself
            remove(ref(db, `rooms/${roomId}/players/${myUid}`));
        }

        roomId = null;
        window.location.hash = '';
        document.getElementById('screen-lobby').style.display = 'flex';
        document.getElementById('screen-room').style.display = 'none';
        log('已斷開連線', 'warn');
    }
}

// Rebuild logic removed as requested


async function resetAll() {
    if (!confirm('確定清空所有標記？')) return;

    // Log everyone's path to room log (Shared)
    const players = Object.values(roomData.players || {});
    players.forEach(p => {
        let pRecord = getPathRecordText(p.nick);
        sendRoomLog(`[系統] 玩家 ${p.nick} 的紀錄: ${pRecord}`, 'info');
    });

    sendRoomLog('已由房主清空所有標記', 'warn');

    const initialMap = Array(10).fill(null).map(() =>
        Array(4).fill(null).map(() => ({ v: 0, owner: null, errors: [], maybe: [], certain: false }))
    );
    await update(ref(db, `rooms/${roomId}`), { mapData: initialMap });
}

function sendRoomLog(msg, type = 'info') {
    if (!roomId) return;
    push(ref(db, `rooms/${roomId}/logs`), {
        msg,
        type,
        time: serverTimestamp()
    });
}

// ===== UTILS =====
function log(msg, type = 'info') {
    const p = document.getElementById('log-panel');
    const entry = document.createElement('div');
    entry.style.color = type === 'ok' ? '#00ffaa' : type === 'warn' ? '#ffcc00' : type === 'error' ? '#ff4444' : '#ffffff';
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    p.appendChild(entry);
    p.scrollTop = p.scrollHeight;
}

function updatePathRecord() {
    const el = document.getElementById('path-record');
    el.textContent = getPathRecordText(myInfo.nick);
}

function getPathRecordText(nick) {
    const path = [];
    for (let f = 9; f >= 0; f--) {
        const floor = roomData.mapData[f];
        let found = '_';
        floor.forEach((cell, idx) => {
            if (cell.v === 1 && cell.owner === nick) {
                if (options.seq === '4321') found = (4 - idx);
                else found = (idx + 1);
            }
        });
        path.push(found);
    }
    return path.slice(0, 3).join('') + '-' + path.slice(3, 6).join('') + '-' + path.slice(6, 9).join('') + '-' + path[9];
}

// Define on window for HTML onclicks
window.app = {
    doCreate, doJoin, leaveRoom, resetAll,
    copyId: () => { navigator.clipboard.writeText(roomId); toast('房號已複製'); },
    copyPw: () => { navigator.clipboard.writeText(roomData.config.password); toast('密碼已複製'); },
    copyInvite: () => { navigator.clipboard.writeText(window.location.href); toast('邀請連結已複製'); },
    copyPath: () => { navigator.clipboard.writeText(document.getElementById('path-record').textContent); toast('活路紀錄已複製'); },
    sendChat: () => {
        const inp = document.getElementById('chat-inp');
        if (!inp.value.trim()) return;
        push(ref(db, `rooms/${roomId}/chat`), {
            nick: myInfo.nick,
            color: myInfo.color,
            msg: inp.value.trim(),
            time: serverTimestamp()
        });
        inp.value = '';
    },
    openEditNick: async () => {
        const newNick = document.getElementById('rm-nick').value.trim();
        const newColor = document.getElementById('rm-col-inp').value;
        const newTextColor = document.getElementById('rm-txt-inp').value;

        if (!newNick) return alert('暱稱不能為空');
        if (newNick === myInfo.nick && newColor === myInfo.color && newTextColor === myInfo.textColor) return;

        if (confirm(`確定要將資訊修改為 ${newNick} 嗎？`)) {
            myInfo.nick = newNick;
            myInfo.color = newColor;
            myInfo.textColor = newTextColor;

            await update(ref(db, `rooms/${roomId}/players/${myUid}`), {
                nick: newNick,
                color: newColor,
                textColor: newTextColor
            });
            log('個人資訊已更新', 'ok');
            renderRoom();
        }
    },
    doJoinLanding,
    editPassword: async () => {
        const newPw = prompt('請輸入新密碼 (留空則取消密碼):', roomData.config.password || '');
        if (newPw === null) return;
        await update(ref(db, `rooms/${roomId}/config`), { password: newPw.trim() });
        log('密碼已更新', 'ok');
    },
    kickPlayer: async (uid, nick) => {
        if (!confirm(`確定要將 ${nick} 移出房間嗎？`)) return;
        await remove(ref(db, `rooms/${roomId}/players/${uid}`));
        log(`已將 ${nick} 移出房間`, 'warn');
    }
};

function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2000);
}

init();
