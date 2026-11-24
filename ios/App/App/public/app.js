// Constants
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwWsbYHKhrTX0C2FQSrV07gsIuQSYCtxYeVXft8ctnSneUma1E6XgQe64qCsM8zxdYmRw/exec";

// Element Selectors
const scanBtn = document.getElementById('scan-btn');
const adminTrigger = document.getElementById('admin-trigger');
const adminModal = document.getElementById('admin-modal');
const panelModal = document.getElementById('panel-modal');
const closeModals = document.querySelectorAll('.close-modal');
const loginBtn = document.getElementById('login-btn');
const adminUserInp = document.getElementById('admin-user');
const adminPassInp = document.getElementById('admin-pass');
const resultCard = document.getElementById('result-card');
const scannerOverlay = document.getElementById('scanner-overlay');
const toast = document.getElementById('toast');
const nameInputCard = document.getElementById('name-input-card');
const savedUserCard = document.getElementById('saved-user-card');
const savedUserNameEl = document.getElementById('saved-user-name');
const quickScanBtn = document.getElementById('quick-scan-btn');
const changeUserBtn = document.getElementById('change-user-btn');
const cancelChangeUserBtn = document.getElementById('cancel-change-user-btn');
const staffDatalist = document.getElementById('staff-datalist');
const newScanBtn = document.getElementById('new-scan-btn');
const backHomeBtn = document.getElementById('back-home-btn');
const personnelInput = document.getElementById('personnel-name-input');
const readyScanBtn = document.getElementById('ready-scan-btn');
const cancelScanBtn = document.getElementById('cancel-scan-btn');
const scannerSection = document.getElementById('scanner-section');

// Settings Elements
const settingsTrigger = document.getElementById('settings-trigger');
const settingsModal = document.getElementById('settings-modal');
const settingCameraSelect = document.getElementById('setting-camera');
const settingNotificationsSelect = document.getElementById('setting-notifications');
const saveSettingsBtn = document.getElementById('save-settings-btn');

// Result elements
const resName = document.getElementById('res-name');
const resLocation = document.getElementById('res-location');
const resTime = document.getElementById('res-time');
const statusBadge = document.getElementById('status-badge');
const resultOfflineNote = document.getElementById('result-offline-note');

// Connection & Offline Queue Elements
const connectionStatusEl = document.getElementById('connection-status');
const connectionStatusTextEl = document.getElementById('connection-status-text');
const processingCard = document.getElementById('processing-card');
const pendingQueueCard = document.getElementById('pending-queue-card');
const pendingCountEl = document.getElementById('pending-count');
const pendingListEl = document.getElementById('pending-list');
const syncNowBtn = document.getElementById('sync-now-btn');

// Safe Storage Helpers
function safeLoadJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return Array.isArray(fallback) ? (Array.isArray(parsed) ? parsed : fallback) : (parsed ?? fallback);
    } catch (err) {
        console.error(`localStorage okuma hatası (${key}):`, err);
        return fallback;
    }
}

function safeSaveJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (err) {
        console.error(`localStorage yazma hatası (${key}):`, err);
        return false;
    }
}

function createEntryId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTurkishUpper(text) {
    return text.toString().replace(/\s+/g, ' ').replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase().trim();
}

function formatDateTimeTr(dateObj) {
    const d = dateObj instanceof Date ? dateObj : new Date();
    const pad = n => String(n).padStart(2, '0');
    return {
        dateStr: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`,
        timeStr: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
    if (typeof AbortController === 'undefined') {
        return fetch(url, options);
    }
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timerId);
    }
}

// App State
let html5QrCode = null;
let currentScannedLocation = "";
let isProcessingScan = false;
let isStartingCamera = false;
let toastTimeout = null;
let lastKnownReachable = navigator.onLine;
if (localStorage.getItem('adminPass') === 'tobbihl2026') {
    localStorage.setItem('adminPass', 'sumer2026');
}
let currentConfig = {
    user: localStorage.getItem('adminUser') || 'Mudur',
    pass: localStorage.getItem('adminPass') || 'sumer2026'
};
let appSettings = {
    camera: localStorage.getItem('settingCamera') || 'environment',
    notifications: localStorage.getItem('settingNotifications') || 'on'
};

// Offline Data State
function getNativeOfflineSync() {
    return (typeof Capacitor !== 'undefined' && Capacitor.Plugins && Capacitor.Plugins.OfflineSync)
        ? Capacitor.Plugins.OfflineSync
        : null;
}

function normalizeQueueArray(list) {
    if (!Array.isArray(list)) return [];
    return list.map(entry => ({
        id: (entry && entry.id) ? String(entry.id) : createEntryId(),
        location: (entry && entry.location) ? String(entry.location) : '',
        name: (entry && entry.name) ? String(entry.name) : '',
        date: (entry && entry.date) ? String(entry.date) : '',
        time: (entry && entry.time) ? String(entry.time) : '',
        createdAt: (entry && entry.createdAt) ? Number(entry.createdAt) : Date.now(),
        lastError: (entry && entry.lastError && entry.lastError !== 'null') ? String(entry.lastError) : null
    }));
}

async function checkRealOnlineStatus() {
    const nativeSync = getNativeOfflineSync();
    if (nativeSync) {
        try {
            const res = await nativeSync.getNetworkStatus();
            return !!(res && res.online);
        } catch (err) {
            console.warn("Native ağ durumu alınamadı:", err);
        }
    }
    return navigator.onLine;
}

let offlineStaffList = safeLoadJSON('offlineStaffList', []).map(name => normalizeTurkishUpper(name)).filter(Boolean);
let pendingEntries = normalizeQueueArray(safeLoadJSON('pendingEntries', []));
if (!getNativeOfflineSync()) {
    safeSaveJSON('pendingEntries', pendingEntries);
}

let savedPersonnelName = localStorage.getItem('savedPersonnelName') || '';
if (savedPersonnelName) {
    savedPersonnelName = normalizeTurkishUpper(savedPersonnelName);
}
let activePersonnelName = savedPersonnelName;
let isSyncing = false;
let manualSyncInFlight = false;

function savePendingEntries() {
    if (!getNativeOfflineSync()) {
        safeSaveJSON('pendingEntries', pendingEntries);
    }
}

async function removePendingEntry(id) {
    const nativeSync = getNativeOfflineSync();
    if (nativeSync) {
        try {
            const res = await nativeSync.removeEntry({ id });
            pendingEntries = normalizeQueueArray(res && res.entries);
        } catch (err) {
            console.error("Native kayıt silme hatası:", err);
        }
    } else {
        pendingEntries = pendingEntries.filter(e => e.id !== id);
        savePendingEntries();
    }
    renderPendingQueue();
    showToast('Kayıt listeden kaldırıldı.');
}

function updateConnectionStatus(isOnlineOverride = null) {
    if (!connectionStatusEl || !connectionStatusTextEl) return;
    const isOnline = isOnlineOverride !== null ? isOnlineOverride : navigator.onLine;
    lastKnownReachable = isOnline;

    if (isOnline) {
        connectionStatusEl.classList.remove('offline');
        connectionStatusEl.classList.add('online');
        connectionStatusTextEl.textContent = 'İnternet Bağlı';
    } else {
        connectionStatusEl.classList.remove('online');
        connectionStatusEl.classList.add('offline');
        connectionStatusTextEl.textContent = 'Çevrimdışı Mod — QR kayıtları telefona kaydedilir';
    }
}

function renderPendingQueue() {
    if (!pendingQueueCard || !pendingCountEl || !pendingListEl || !syncNowBtn) return;

    const isScannerOpen = !scannerSection.classList.contains('hidden');
    pendingCountEl.textContent = String(pendingEntries.length);

    if (pendingEntries.length === 0 || isScannerOpen) {
        pendingQueueCard.classList.add('hidden');
        return;
    }

    pendingQueueCard.classList.remove('hidden');
    pendingListEl.innerHTML = '';

    pendingEntries.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'pending-item';

        const info = document.createElement('div');
        info.className = 'pending-item-info';

        const locEl = document.createElement('div');
        locEl.className = 'pending-item-loc';
        locEl.textContent = entry.location || '-';

        const metaEl = document.createElement('div');
        metaEl.className = 'pending-item-meta';
        metaEl.textContent = `${entry.name || '-'} • ${entry.date} ${entry.time}`;

        info.appendChild(locEl);
        info.appendChild(metaEl);

        if (entry.lastError) {
            const errEl = document.createElement('div');
            errEl.className = 'pending-item-error';
            errEl.textContent = `Sunucu uyarısı: ${entry.lastError}`;
            info.appendChild(errEl);
        }

        item.appendChild(info);

        if (entry.lastError) {
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'pending-remove-btn';
            delBtn.textContent = 'Sil';
            delBtn.addEventListener('click', () => {
                removePendingEntry(entry.id);
            });
            item.appendChild(delBtn);
        }

        pendingListEl.appendChild(item);
    });

    if (isSyncing) {
        syncNowBtn.disabled = true;
        syncNowBtn.innerHTML = '<span class="icon">⏳</span> Google Sheet\'e Gönderiliyor...';
    } else {
        syncNowBtn.disabled = false;
        syncNowBtn.innerHTML = `<span class="icon">☁️</span> Şimdi Google Sheet'e Gönder (${pendingEntries.length})`;
    }
}

function fixQrTurkishEncoding(text) {
    if (!text) return '';
    let result = text.toString();

    // 1. UTF-8 baytlari Latin-1 olarak yanlis cozulduyse duzelt
    if (/[ÃÄÅ]/.test(result)) {
        try {
            const bytes = new Uint8Array([...result].map(ch => ch.charCodeAt(0) & 0xFF));
            const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
            if (decoded) result = decoded;
        } catch (_) {}
    }

    // 2. QR ureticisinin UTF-16 alt baytini kesmesi (charCode & 0xFF) sonucu bozulan Turkce harfler:
    // U+011F (ğ) -> 0x1F, U+011E (Ğ) -> 0x1E
    result = result.replace(/\u001f/g, 'ğ').replace(/\u001e/g, 'Ğ');

    // U+0131 (ı) -> 0x31 ('1')
    result = result.replace(/([a-zçöüğşı])1([a-zçöüğşı])/g, '$1ı$2');
    result = result.replace(/([a-zçöüğşı])1([a-zçöüğşı])/g, '$1ı$2');
    result = result.replace(/([a-zçöüğşı])1(?![0-9])/g, '$1ı');
    result = result.replace(/([A-ZÇÖÜĞŞİ])1([a-zçöüğşı])/g, '$1ı$2');
    result = result.replace(/([A-ZÇÖÜĞŞİ]{2,})1([A-ZÇÖÜĞŞİ])/g, '$1I$2');
    result = result.replace(/([A-ZÇÖÜĞŞİ]{2,})1([A-ZÇÖÜĞŞİ])/g, '$1I$2');
    result = result.replace(/([A-ZÇÖÜĞŞİ]{2,})1(?![0-9A-Za-z])/g, '$1I');

    // U+0130 (İ) -> 0x30 ('0')
    result = result.replace(/(^|[^0-9A-Za-zÇÖÜçöüğşıİ])0([a-zçöüğşı])/g, '$1İ$2');
    result = result.replace(/([A-ZÇÖÜĞŞİ]{2,})0([A-ZÇÖÜĞŞİ])/g, '$1İ$2');

    // U+015F (ş) -> 0x5F ('_') ve U+015E (Ş) -> 0x5E ('^')
    result = result.replace(/([A-Za-zÇÖÜçöüğşıİ])_([a-zçöüğşı])/g, '$1ş$2');
    result = result.replace(/([a-zçöüğşı])_(?![A-Za-z0-9])/g, '$1ş');
    result = result.replace(/(^|\s)\^([a-zçöüğşı])/g, '$1Ş$2');
    result = result.replace(/([A-ZÇÖÜĞŞİ])\^([A-ZÇÖÜĞŞİ])/g, '$1Ş$2');
    result = result.replace(/([A-ZÇÖÜĞŞİ])\^(?![A-Za-z0-9])/g, '$1Ş');

    // Kontrol karakteri (0x1F) QR uretilirken tamamen dusurulduyse yaygin kelimeleri duzelt
    result = result
        .replace(/Öretmen/g, 'Öğretmen')
        .replace(/öretmen/g, 'öğretmen')
        .replace(/ÖRETMEN/g, 'ÖĞRETMEN')
        .replace(/Örenci/g, 'Öğrenci')
        .replace(/örenci/g, 'öğrenci')
        .replace(/ÖRENCİ/g, 'ÖĞRENCİ')
        .replace(/Salık/g, 'Sağlık')
        .replace(/salık/g, 'sağlık');

    return result.trim();
}

function updateStaffDatalist() {
    if (!staffDatalist) return;
    staffDatalist.innerHTML = '';
    offlineStaffList.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        staffDatalist.appendChild(option);
    });
}

function showHomeView() {
    scannerSection.classList.add('hidden');
    processingCard.classList.add('hidden');
    resultCard.classList.add('hidden');

    if (savedPersonnelName) {
        savedUserNameEl.textContent = savedPersonnelName;
        savedUserCard.classList.remove('hidden');
        nameInputCard.classList.add('hidden');
    } else {
        savedUserCard.classList.add('hidden');
        nameInputCard.classList.remove('hidden');
        cancelChangeUserBtn.classList.add('hidden');
    }

    renderPendingQueue();
}

// Initialize App
async function initOfflineBridge() {
    const nativeSync = getNativeOfflineSync();
    if (nativeSync) {
        try {
            await nativeSync.setScriptUrl({ url: GOOGLE_SCRIPT_URL });

            // Eski sürümden localStorage'da bekleyen kayıt kaldıysa Android yerel kuyruğuna aktar
            const legacyEntries = normalizeQueueArray(safeLoadJSON('pendingEntries', []));
            if (legacyEntries.length > 0) {
                for (const entry of legacyEntries) {
                    await nativeSync.enqueueEntry(entry);
                }
                safeSaveJSON('pendingEntries', []);
            }

            const queueState = await nativeSync.getPendingEntries();
            pendingEntries = normalizeQueueArray(queueState && queueState.entries);
            isSyncing = !!(queueState && queueState.isSyncing);
            renderPendingQueue();

            const netState = await nativeSync.getNetworkStatus();
            updateConnectionStatus(!!(netState && netState.online));

            if (typeof nativeSync.addListener === 'function') {
                nativeSync.addListener('queueUpdated', (data) => {
                    if (!data) return;
                    if (Array.isArray(data.entries)) {
                        pendingEntries = normalizeQueueArray(data.entries);
                    }
                    if (typeof data.isSyncing === 'boolean') {
                        isSyncing = data.isSyncing;
                    }
                    renderPendingQueue();

                    if (!manualSyncInFlight && data.successCount > 0) {
                        updateConnectionStatus(true);
                        if (data.remainingCount === 0) {
                            showToast(`Başarılı! ${data.successCount} kayıt Google Sheet'e aktarıldı.`);
                        } else {
                            showToast(`${data.successCount} kayıt aktarıldı, ${data.remainingCount} kayıt bekliyor.`);
                        }
                    }
                });

                nativeSync.addListener('networkChanged', (data) => {
                    const isOnline = !!(data && data.online);
                    updateConnectionStatus(isOnline);
                    if (isOnline) {
                        fetchAndSaveStaffList();
                    }
                });
            }
        } catch (err) {
            console.error("Native offline bridge başlatma hatası:", err);
        }
    }

    fetchAndSaveStaffList();
    if (pendingEntries.length > 0) {
        syncPendingEntries(false);
    }
}

function init() {
    setupEventListeners();
    updateStaffDatalist();
    updateConnectionStatus();
    showHomeView();
    initOfflineBridge();

    // iOS Safari / PWA çevrimdışı önbellek desteği (yalnızca HTTPS web modunda)
    if (
        typeof Capacitor === 'undefined' &&
        'serviceWorker' in navigator &&
        window.location &&
        window.location.protocol === 'https:'
    ) {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
            console.log('Service Worker kaydı atlandı:', err);
        });
    }

    window.addEventListener('online', () => {
        updateConnectionStatus(true);
        fetchAndSaveStaffList();
        syncPendingEntries(false);
    });

    window.addEventListener('offline', () => {
        updateConnectionStatus(false);
    });

    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            const isOnline = await checkRealOnlineStatus();
            updateConnectionStatus(isOnline);
            if (isOnline) {
                fetchAndSaveStaffList();
            }
            if (pendingEntries.length > 0) {
                syncPendingEntries(false);
            }
        }
    });

    window.addEventListener('focus', async () => {
        const isOnline = await checkRealOnlineStatus();
        updateConnectionStatus(isOnline);
        if (pendingEntries.length > 0) {
            syncPendingEntries(false);
        }
    });

    // Bekleyen kayıt varsa her 10 saniyede bir gerçek bağlantıyla senkronize etmeyi dene (navigator.onLine'a takılmadan)
    setInterval(() => {
        if (document.visibilityState === 'visible' && pendingEntries.length > 0 && !isSyncing) {
            syncPendingEntries(false);
        }
    }, 10000);
}

function setupEventListeners() {
    scanBtn.addEventListener('click', startScanning);
    if (syncNowBtn) {
        syncNowBtn.addEventListener('click', () => syncPendingEntries(true));
    }
    adminTrigger.addEventListener('click', () => showModal(adminModal));

    closeModals.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.target.closest('.modal').classList.add('hidden');
            if (html5QrCode && html5QrCode.isScanning) {
                await stopScanning();
            }
        });
    });

    loginBtn.addEventListener('click', handleLogin);

    document.getElementById('forgot-pass').addEventListener('click', handleForgotPassword);
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    document.getElementById('change-pass-btn').addEventListener('click', () => {
        hideAdminSections();
        document.getElementById('change-pass-section').classList.toggle('hidden');
    });

    document.getElementById('add-staff-btn').addEventListener('click', () => {
        hideAdminSections();
        document.getElementById('add-staff-section').classList.toggle('hidden');
    });

    document.getElementById('view-logs-btn').addEventListener('click', () => {
        hideAdminSections();
        document.getElementById('view-logs-section').classList.remove('hidden');
        handleFetchLogs();
    });

    document.getElementById('save-staff-btn').addEventListener('click', handleAddStaff);

    // Auto-uppercase for add staff input
    document.getElementById('new-staff-name').addEventListener('input', (e) => {
        let val = e.target.value;
        val = val.replace(/i/g, 'İ').replace(/ı/g, 'I');
        e.target.value = val.toUpperCase();
    });

    document.getElementById('save-creds-btn').addEventListener('click', saveNewCredentials);
    
    // Uygulama ayarları tetikleyicileri
    settingsTrigger.addEventListener('click', () => {
        settingCameraSelect.value = appSettings.camera;
        settingNotificationsSelect.value = appSettings.notifications;
        showModal(settingsModal);
    });
    saveSettingsBtn.addEventListener('click', handleSaveSettings);

    // "Kamera ile Oku" butonuna basınca (Önce İsim kontrol edilir)
    readyScanBtn.addEventListener('click', handleReadyToScan);

    // Kayıtlı kullanıcı hızlı tarama ve kullanıcı değiştirme
    quickScanBtn.addEventListener('click', handleQuickScan);
    changeUserBtn.addEventListener('click', handleChangeUser);
    cancelChangeUserBtn.addEventListener('click', showHomeView);

    // İşlem özeti sonrası aksiyonlar
    newScanBtn.addEventListener('click', handleQuickScan);
    backHomeBtn.addEventListener('click', showHomeView);
    
    // Kamera tarama işlemi iptal tuşu
    cancelScanBtn.addEventListener('click', handleCancelScan);

    // Auto-uppercase for name input
    personnelInput.addEventListener('input', (e) => {
        let val = e.target.value;
        val = val.replace(/i/g, 'İ').replace(/ı/g, 'I');
        e.target.value = val.toUpperCase();
    });

    // Enter tuşu ile hızlı geçiş
    personnelInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleReadyToScan();
        }
    });
}

// Native Camera Functions
async function checkCameraPermissions() {
    try {
        // Fallback for web browser testing
        if (typeof Capacitor === 'undefined' || !Capacitor.Plugins || !Capacitor.Plugins.Camera) {
            return true; // Let html5-qrcode handle web permissions natively
        }

        const { Camera } = Capacitor.Plugins;
        const status = await Camera.checkPermissions();

        if (status.camera === 'granted') {
            return true;
        }

        if (status.camera === 'denied' || status.camera === 'prompt-with-rationale' || status.camera === 'prompt') {
            const request = await Camera.requestPermissions({ permissions: ['camera'] });
            return request.camera === 'granted';
        }

        return false;
    } catch (err) {
        console.error("Camera permission check failed:", err);
        // MainActivity zaten native kamera izni istedigi icin WebView akisina izin ver
        return true;
    }
}

function waitMs(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function releaseLeftoverVideoStreams() {
    try {
        const videos = document.querySelectorAll('#reader video');
        videos.forEach(video => {
            if (video.srcObject && typeof video.srcObject.getTracks === 'function') {
                video.srcObject.getTracks().forEach(track => {
                    try { track.stop(); } catch (_) {}
                });
                video.srcObject = null;
            }
        });
    } catch (_) {}
}

// Scanning Logic
async function startScanning() {
    if (isStartingCamera) return;

    if (html5QrCode && html5QrCode.isScanning) {
        await stopScanning();
        return;
    }

    if (typeof Html5Qrcode === 'undefined') {
        showToast("HATA: QR okuyucu kütüphanesi yüklenemedi.");
        return;
    }

    isStartingCamera = true;
    isProcessingScan = false;
    resultCard.classList.add('hidden');
    scannerOverlay.style.background = 'transparent';
    scannerOverlay.innerHTML = '<div class="scanner-line"></div>';
    scannerOverlay.style.display = 'block';

    try {
        // Ensure permissions are granted natively first
        const hasPermission = await checkCameraPermissions();
        if (!hasPermission) {
            showToast("Kamera izni verilmedi. Lütfen ayarlardan izin verin.");
            scannerOverlay.style.display = 'none';
            return;
        }

        // Eski ornek varsa once temizle
        if (html5QrCode) {
            try { await html5QrCode.clear(); } catch (_) {}
            html5QrCode = null;
        }
        releaseLeftoverVideoStreams();
        document.getElementById('reader').innerHTML = '';

        // KRITIK: Android WebView'de native BarcodeDetector bazi telefonlarda uygulamayi cokertiyor.
        // Bu yuzden daima guvenli JS ZXing cozucuyu kullaniyoruz.
        const qrConfig = {
            verbose: false,
            useBarCodeDetectorIfSupported: false,
            experimentalFeatures: {
                useBarCodeDetectorIfSupported: false
            }
        };
        if (typeof Html5QrcodeSupportedFormats !== 'undefined') {
            qrConfig.formatsToSupport = [Html5QrcodeSupportedFormats.QR_CODE];
        }
        html5QrCode = new Html5Qrcode("reader", qrConfig);

        // qrbox olmadan tum kareyi tara + 800x600 net goruntu + 10 fps (hem cokmez hem kolay okur)
        const scanOptions = {
            fps: 10,
            videoConstraints: {
                facingMode: { ideal: appSettings.camera },
                width: { ideal: 800 },
                height: { ideal: 600 }
            }
        };

        try {
            await html5QrCode.start(
                { facingMode: appSettings.camera },
                scanOptions,
                onScanSuccess,
                onScanFailure
            );
        } catch (primaryErr) {
            console.warn("800x600 facingMode baslatma basarisiz, standart moda geciliyor:", primaryErr);
            try {
                await html5QrCode.start(
                    { facingMode: appSettings.camera },
                    { fps: 10 },
                    onScanSuccess,
                    onScanFailure
                );
            } catch (secondErr) {
                console.warn("Standart facingMode basarisiz, kamera listesine geciliyor:", secondErr);
                const cameras = await Html5Qrcode.getCameras();
                if (!cameras || cameras.length === 0) {
                    showToast("HATA: Cihazda algılanan bir kamera yok.");
                    scannerOverlay.style.display = 'none';
                    return;
                }

                let selectedCamId = cameras[0].id;
                if (appSettings.camera === 'environment') {
                    const backCam = cameras.find(c =>
                        c.label.toLowerCase().includes('back') ||
                        c.label.toLowerCase().includes('rear') ||
                        c.label.toLowerCase().includes('arka') ||
                        c.label.toLowerCase().includes('0')
                    );
                    if (backCam) selectedCamId = backCam.id;
                } else {
                    const frontCam = cameras.find(c =>
                        c.label.toLowerCase().includes('front') ||
                        c.label.toLowerCase().includes('ön') ||
                        c.label.toLowerCase().includes('1')
                    );
                    if (frontCam) selectedCamId = frontCam.id;
                    else if (cameras.length > 1) selectedCamId = cameras[1].id;
                }

                await html5QrCode.start(
                    selectedCamId,
                    { fps: 10 },
                    onScanSuccess,
                    onScanFailure
                );
            }
        }

        scanBtn.innerHTML = '<span class="icon">⏹</span> Durdur';
        showToast("Kamera açıldı, kodu okutun.");
    } catch (err) {
        console.error("Kamera hatası:", err);
        showToast("HATA: Kamera başlatılamadı. Lütfen izinleri kontrol edin.");
        scannerOverlay.style.display = 'none';
        releaseLeftoverVideoStreams();
    } finally {
        isStartingCamera = false;
    }
}

async function stopScanning() {
    if (html5QrCode) {
        try {
            const state = html5QrCode.getState ? html5QrCode.getState() : 0;
            // 2 = SCANNING, 3 = PAUSED
            if (html5QrCode.isScanning || state === 2 || state === 3) {
                await html5QrCode.stop();
            }
        } catch (err) {
            console.error("Durdurma hatası:", err);
        }

        releaseLeftoverVideoStreams();

        // Android WebView GPU/SurfaceTexture serbest kalmasi icin kisa bekleme
        await waitMs(180);

        try {
            await html5QrCode.clear();
        } catch (_) {}
        html5QrCode = null;
    } else {
        releaseLeftoverVideoStreams();
    }

    scannerOverlay.style.display = 'none';
    scannerOverlay.style.background = 'transparent';
    scannerOverlay.innerHTML = '<div class="scanner-line"></div>';
    scannerSection.classList.add('hidden');
    scanBtn.innerHTML = '<span class="icon">📷</span> QR Kod Oku';
}

function onScanSuccess(decodedText, decodedResult) {
    if (isProcessingScan) return;
    isProcessingScan = true;

    const scanTime = new Date();

    scannerOverlay.style.display = 'block';
    scannerOverlay.style.background = 'rgba(0,0,0,0.8)';
    scannerOverlay.innerHTML = '<div style="color:#00ff88; font-size:22px; font-weight:bold; margin-top:40%; text-align:center;">OKUNDU!<br>Kaydediliyor...</div>';

    const name = activePersonnelName || savedPersonnelName || normalizeTurkishUpper(personnelInput.value);
    const cleanedLocation = fixQrTurkishEncoding(decodedText);

    // html5-qrcode kare isleme dongusunden cikarak kamerayi guvenle kapat, sonra isle
    setTimeout(async () => {
        try {
            await stopScanning();
            const isSuccess = await processEntry(cleanedLocation, name, scanTime);
            if (!isSuccess) {
                showHomeView();
            }
        } catch (err) {
            console.error("Tarama isleme hatasi:", err);
            const { dateStr, timeStr } = formatDateTimeTr(scanTime);
            await saveEntryOffline(cleanedLocation, name, dateStr, timeStr, true);
        } finally {
            isProcessingScan = false;
        }
    }, 60);
}

// Handlers for new workflow and settings
async function startScanForPersonnel(checkedName, saveAsDefault = false) {
    // Yerel (Çevrimdışı) Yetki Kontrolü
    if (offlineStaffList.length > 0 && !offlineStaffList.includes(checkedName)) {
        showToast("HATA: Yetkisiz Kullanıcı (" + checkedName + "). Listede bulunamadı.");
        return;
    }

    if (saveAsDefault) {
        savedPersonnelName = checkedName;
        localStorage.setItem('savedPersonnelName', savedPersonnelName);
        savedUserNameEl.textContent = savedPersonnelName;
    }

    activePersonnelName = checkedName;

    // İsim uygunsa kartları gizle, okuyucu bölgesini göster ve başlat
    nameInputCard.classList.add('hidden');
    savedUserCard.classList.add('hidden');
    processingCard.classList.add('hidden');
    resultCard.classList.add('hidden');
    scannerSection.classList.remove('hidden');
    renderPendingQueue();
    
    await startScanning();
}

async function handleReadyToScan() {
    const checkedName = normalizeTurkishUpper(personnelInput.value);
    if (!checkedName) {
        showToast("Lütfen önce adınızı giriniz.");
        return;
    }
    
    await startScanForPersonnel(checkedName, true);
}

async function handleQuickScan() {
    if (!savedPersonnelName) {
        showHomeView();
        return;
    }

    await startScanForPersonnel(savedPersonnelName, false);
}

function handleChangeUser() {
    savedUserCard.classList.add('hidden');
    resultCard.classList.add('hidden');
    personnelInput.value = '';
    nameInputCard.classList.remove('hidden');
    if (savedPersonnelName) {
        cancelChangeUserBtn.classList.remove('hidden');
    } else {
        cancelChangeUserBtn.classList.add('hidden');
    }
    personnelInput.focus();
}

async function handleCancelScan() {
    await stopScanning();
    showHomeView();
}

function handleSaveSettings() {
    appSettings.camera = settingCameraSelect.value;
    appSettings.notifications = settingNotificationsSelect.value;
    
    localStorage.setItem('settingCamera', appSettings.camera);
    localStorage.setItem('settingNotifications', appSettings.notifications);
    
    settingsModal.classList.add('hidden');
    showToast("Ayarlar kaydedildi.");
}

function onScanFailure(error) {
    // Silent fail or low prio log
}

// Data Processing
async function processEntry(location, name, scanDateObj = new Date()) {
    const { dateStr, timeStr } = formatDateTimeTr(scanDateObj);

    try {
        const isOnline = await checkRealOnlineStatus();
        if (!isOnline) {
            updateConnectionStatus(false);
            await saveEntryOffline(location, name, dateStr, timeStr, false);
            return true;
        }

        // Bağlantı varsa kısa zaman aşımıyla (8 sn) sunucuya gönder; bekleme ekranı göster
        nameInputCard.classList.add('hidden');
        savedUserCard.classList.add('hidden');
        resultCard.classList.add('hidden');
        processingCard.classList.remove('hidden');

        const formData = new URLSearchParams();
        formData.append('action', 'add_entry');
        formData.append('location', location);
        formData.append('name', name);
        formData.append('date', dateStr);
        formData.append('time', timeStr);

        const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: formData
        }, 8000);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        processingCard.classList.add('hidden');

        if (result && result.success) {
            updateConnectionStatus(true);
            showSuccessCard(name, location, dateStr, timeStr, false);
            showToast("İşlem Google Sheet'e kaydedildi.");
            if (pendingEntries.length > 0) {
                syncPendingEntries(false);
            }
            return true;
        } else if (result && result.success === false) {
            updateConnectionStatus(true);
            showToast("HATA: " + (result.message || "İşlem reddedildi."));
            return false;
        } else {
            throw new Error("Geçersiz sunucu yanıtı");
        }
    } catch (err) {
        console.error("API Hatası (çevrimdışı kaydediliyor):", err);
        processingCard.classList.add('hidden');
        updateConnectionStatus(false);
        await saveEntryOffline(location, name, dateStr, timeStr, true);
        return true;
    }
}

// Çevrimdışı Kayıt Desteği
async function saveEntryOffline(location, name, dateStr, timeStr, fromNetworkError = false) {
    const newEntry = {
        id: createEntryId(),
        location,
        name,
        date: dateStr,
        time: timeStr,
        createdAt: Date.now(),
        lastError: null
    };

    const nativeSync = getNativeOfflineSync();
    if (nativeSync) {
        try {
            const res = await nativeSync.enqueueEntry(newEntry);
            pendingEntries = normalizeQueueArray(res && res.entries);
        } catch (err) {
            console.error("Native kuyruğa ekleme hatası, localStorage kullanılıyor:", err);
            pendingEntries.push(newEntry);
            safeSaveJSON('pendingEntries', pendingEntries);
        }
    } else {
        pendingEntries.push(newEntry);
        savePendingEntries();
    }

    showSuccessCard(name, location, dateStr, timeStr, true);
    renderPendingQueue();
    showToast(
        fromNetworkError
            ? "Sunucuya ulaşılamadı. Kayıt telefon hafızasına alındı."
            : "İnternet yok. Kayıt telefon hafızasına alındı."
    );
}

function showSuccessCard(name, location, dateStr, timeStr, isOfflineSaved = false) {
    nameInputCard.classList.add('hidden');
    savedUserCard.classList.add('hidden');
    processingCard.classList.add('hidden');

    resName.textContent = name;
    resLocation.textContent = location;
    resTime.textContent = `${dateStr} ${timeStr}`;

    if (statusBadge) {
        if (isOfflineSaved) {
            statusBadge.textContent = "Hafızaya Alındı (Çevrimdışı)";
            statusBadge.classList.add('offline-badge');
        } else {
            statusBadge.textContent = "Google Sheet'e İşlendi";
            statusBadge.classList.remove('offline-badge');
        }
    }

    if (resultOfflineNote) {
        if (isOfflineSaved) {
            resultOfflineNote.classList.remove('hidden');
        } else {
            resultOfflineNote.classList.add('hidden');
        }
    }

    resultCard.classList.remove('hidden');
    renderPendingQueue();
}

// Personel Listesini Çekme Fonksiyonu
async function fetchAndSaveStaffList() {
    const isOnline = await checkRealOnlineStatus();
    if (!isOnline) return;
    try {
        const formData = new URLSearchParams();
        formData.append('action', 'get_staff_list');
        const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, { method: 'POST', body: formData }, 8000);
        if (!response.ok) return;
        const result = await response.json();
        if (result && result.success && Array.isArray(result.data)) {
            offlineStaffList = result.data.map(name => normalizeTurkishUpper(name)).filter(Boolean);
            safeSaveJSON('offlineStaffList', offlineStaffList);
            updateStaffDatalist();
            updateConnectionStatus(true);
        }
    } catch (err) {
        console.log("Personel listesi güncellenemedi", err);
    }
}

// Çevrimdışı Kayıtları Senkronize Etme
async function syncPendingEntries(isManual = false) {
    const nativeSync = getNativeOfflineSync();
    if (nativeSync) {
        if (isSyncing) {
            if (isManual) showToast("Senkronizasyon zaten devam ediyor...");
            return;
        }

        try {
            if (pendingEntries.length === 0) {
                const state = await nativeSync.getPendingEntries();
                pendingEntries = normalizeQueueArray(state && state.entries);
            }
            if (pendingEntries.length === 0) {
                renderPendingQueue();
                if (isManual) showToast("Hafızada bekleyen kayıt yok.");
                return;
            }

            if (!isManual) {
                const isOnline = await checkRealOnlineStatus();
                if (!isOnline) {
                    updateConnectionStatus(false);
                    return;
                }
            }

            isSyncing = true;
            manualSyncInFlight = isManual;
            renderPendingQueue();
            if (isManual) {
                showToast(`Bekleyen ${pendingEntries.length} kayıt Google Sheet'e gönderiliyor...`);
            }

            const res = await nativeSync.syncNow({ manual: isManual });
            if (res && Array.isArray(res.entries)) {
                pendingEntries = normalizeQueueArray(res.entries);
            }
            isSyncing = false;
            manualSyncInFlight = false;
            renderPendingQueue();

            if (res && res.successCount > 0) {
                updateConnectionStatus(true);
                if (res.remainingCount === 0) {
                    showToast(`Başarılı! ${res.successCount} kayıt Google Sheet'e aktarıldı.`);
                } else {
                    showToast(`${res.successCount} kayıt aktarıldı, ${res.remainingCount} kayıt bekliyor.`);
                }
            } else if (res && res.rejectedCount > 0 && isManual) {
                updateConnectionStatus(true);
                showToast("HATA: Bazı kayıtlar sunucu tarafından reddedildi. Listeyi kontrol edin.");
            } else if (res && res.networkError && isManual) {
                updateConnectionStatus(false);
                showToast("Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.");
            } else if (res && res.alreadySyncing && isManual) {
                showToast("Senkronizasyon zaten devam ediyor...");
            }
        } catch (err) {
            console.error("Native senkronizasyon hatası:", err);
            isSyncing = false;
            manualSyncInFlight = false;
            renderPendingQueue();
            if (isManual) {
                showToast("Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.");
            }
        }
        return;
    }

    // Web tarayıcısı fallback (Android uygulaması dışındaki testler için)
    if (isSyncing) {
        if (isManual) showToast("Senkronizasyon zaten devam ediyor...");
        return;
    }

    if (pendingEntries.length === 0) {
        renderPendingQueue();
        if (isManual) showToast("Hafızada bekleyen kayıt yok.");
        return;
    }

    isSyncing = true;
    renderPendingQueue();

    if (isManual) {
        showToast(`Bekleyen ${pendingEntries.length} kayıt Google Sheet'e gönderiliyor...`);
    }

    const snapshot = [...pendingEntries];
    let successCount = 0;
    let rejectedCount = 0;
    let networkFailed = false;

    try {
        for (const entry of snapshot) {
            try {
                const formData = new URLSearchParams();
                formData.append('action', 'add_entry');
                formData.append('location', entry.location);
                formData.append('name', entry.name);
                formData.append('date', entry.date);
                formData.append('time', entry.time);

                const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    body: formData
                }, 15000);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const result = await response.json();

                if (result && result.success) {
                    pendingEntries = pendingEntries.filter(item => item.id !== entry.id);
                    savePendingEntries();
                    successCount++;
                    updateConnectionStatus(true);
                    renderPendingQueue();
                    await waitMs(250);
                } else if (result && result.success === false) {
                    const target = pendingEntries.find(item => item.id === entry.id);
                    if (target) {
                        target.lastError = result.message || "Sunucu kaydı reddetti.";
                        savePendingEntries();
                    }
                    rejectedCount++;
                    updateConnectionStatus(true);
                    renderPendingQueue();
                } else {
                    throw new Error("Geçersiz sunucu yanıtı");
                }
            } catch (err) {
                console.warn("Senkronizasyon bağlantı hatası:", err);
                networkFailed = true;
                updateConnectionStatus(false);
                break;
            }
        }
    } finally {
        isSyncing = false;
        renderPendingQueue();

        if (successCount > 0 && pendingEntries.length === 0) {
            showToast(`Başarılı! ${successCount} kayıt Google Sheet'e aktarıldı.`);
        } else if (successCount > 0) {
            showToast(`${successCount} kayıt aktarıldı, ${pendingEntries.length} kayıt bekliyor.`);
        } else if (rejectedCount > 0 && isManual) {
            showToast("HATA: Bazı kayıtlar sunucu tarafından reddedildi. Listeyi kontrol edin.");
        } else if (networkFailed && isManual) {
            showToast("Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.");
        }
    }
}

// Auth Logic
function handleLogin() {
    const user = adminUserInp.value.trim();
    const pass = adminPassInp.value.trim();

    if (user === currentConfig.user && pass === currentConfig.pass) {
        adminModal.classList.add('hidden');
        showModal(panelModal);
        showToast("Giriş başarılı.");
    } else {
        // Fallback for default exact match in case localstorage is corrupted but they know the hardcoded default
        if (user === 'Mudur' && pass === 'sumer2026') {
            currentConfig.user = 'Mudur';
            currentConfig.pass = 'sumer2026';
            localStorage.setItem('adminUser', 'Mudur');
            localStorage.setItem('adminPass', 'sumer2026');
            adminModal.classList.add('hidden');
            showModal(panelModal);
            showToast("Giriş başarılı (Varsayılan şifre ile sıfırlandı).");
        } else {
            showToast("Kullanıcı adı veya şifre hatalı.");
        }
    }
}

function handleLogout() {
    panelModal.classList.add('hidden');
    showToast("Çıkış yapıldı.");
}

function saveNewCredentials() {
    const newUser = document.getElementById('new-user').value;
    const newPass = document.getElementById('new-pass').value;

    if (newUser && newPass) {
        currentConfig.user = newUser;
        currentConfig.pass = newPass;
        localStorage.setItem('adminUser', newUser);
        localStorage.setItem('adminPass', newPass);
        showToast("Bilgiler güncellendi.");
        document.getElementById('change-pass-section').classList.add('hidden');
    } else {
        showToast("Boş alan bırakmayınız.");
    }
}

async function handleForgotPassword(e) {
    e.preventDefault();
    showToast("İstek gönderiliyor...");

    try {
        const formData = new URLSearchParams();
        formData.append('action', 'forgot_password');

        const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: formData
        }, 10000);
        
        const result = await response.json();
        if (result.success) {
            showToast("Şifre sıfırlama linki haslan_2000@yahoo.com adresine gönderildi.");
        } else {
            showToast("Hata: " + result.message);
        }
    } catch (err) {
        showToast("İşlem başarısız oldu.");
    }
}

// Helpers
function showModal(modal) {
    modal.classList.remove('hidden');
}

function showToast(msg) {
    // Check if notifications are set to "Sadece Hatalar" (off)
    if (appSettings.notifications === 'off' && !msg.toUpperCase().includes('HATA')) {
        return; // Suppress notification if it's not an error message
    }
    
    toast.textContent = msg;
    toast.classList.remove('hidden');
    
    // Background color based on error or normal info
    if (msg.toUpperCase().includes('HATA')) {
        toast.style.background = 'rgba(231, 76, 60, 0.9)'; // Reddish for errors
    } else {
        toast.style.background = 'rgba(0, 0, 0, 0.85)'; // Default dark
    }
    
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }
    toastTimeout = setTimeout(() => toast.classList.add('hidden'), 3500);
}

// Admin Panel Functions
function hideAdminSections() {
    const sections = document.querySelectorAll('.admin-section');
    sections.forEach(sec => sec.classList.add('hidden'));
}

async function handleAddStaff() {
    const nameInput = document.getElementById('new-staff-name');
    const name = nameInput.value.trim();
    if (!name) {
        showToast("Lütfen personel adını giriniz.");
        return;
    }

    showToast("Ekleme işlemi başlatılıyor...");
    const btn = document.getElementById('save-staff-btn');
    btn.textContent = "Ekleniyor...";
    btn.disabled = true;

    try {
        const formData = new URLSearchParams();
        formData.append('action', 'add_staff');
        formData.append('name', name);

        const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: formData
        }, 10000);

        const result = await response.json();
        if (result.success) {
            const normalizedAdded = normalizeTurkishUpper(name);
            if (!offlineStaffList.includes(normalizedAdded)) {
                offlineStaffList.push(normalizedAdded);
                safeSaveJSON('offlineStaffList', offlineStaffList);
                updateStaffDatalist();
            }
            showToast("Personel başarıyla eklendi.");
            nameInput.value = "";
        } else {
            showToast("HATA: " + result.message);
        }
    } catch(err) {
        showToast("Sunucu ile bağlantı kurulamadı.");
    } finally {
        btn.textContent = "Kaydet";
        btn.disabled = false;
    }
}

async function handleFetchLogs() {
    const tbody = document.getElementById('logs-table-body');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 15px;">Yükleniyor... Lütfen bekleyin.</td></tr>';

    try {
        const formData = new URLSearchParams();
        formData.append('action', 'get_logs');

        const response = await fetchWithTimeout(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            body: formData
        }, 10000);

        const result = await response.json();
        
        if (result.success && result.data) {
            tbody.innerHTML = '';
            if(result.data.length === 0) {
                 tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 15px;">Kayıt bulunamadı.</td></tr>';
                 return;
            }

            result.data.forEach(row => {
               // row format: [İsim, Lokasyon, Tarih, Saat]
               const tr = document.createElement('tr');
               row.forEach(cellText => {
                   const td = document.createElement('td');
                   td.textContent = cellText || "-";
                   tr.appendChild(td);
               });
               tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 15px; color: var(--error);">Tablo Çekilemedi: ${result.message}</td></tr>`;
        }
    } catch(err) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 15px; color: var(--error);">Bağlantı Hatası</td></tr>';
    }
}

init();
