/**
 * Heritage Vault v1.0 — Application Controller & Engine
 * Coordinates:
 * - PC-style Administrator & Role Delegation Access Control
 * - Executive Dashboard & Chronological Life Stream
 * - Interactive Calendar & "On This Day" Time Capsule
 * - High-Capacity Document Vault (PDFs, scans, expiry countdowns)
 * - Granular Folder Encryption (AES-256-GCM + PBKDF2)
 * - Children's Growth Timelapse & Side-by-Side Comparison Slider
 * - House Logs Safe Deposit Locker (Disaster recovery)
 * - Zero-Knowledge Master .vault Encrypted Backup / Restore
 */

(function () {
    'use strict';

    // Application State
    const AppState = {
        currentUser: null,       // { userId, displayName, role, permissions }
        sessionKey: null,        // RAM-only Master CryptoKey
        unlockedFolders: new Map(), // Map<folderId, CryptoKey>
        activeTab: 'tab-dashboard',
        activeFolderId: 'all',
        privacyMaskEnabled: true,
        currentFilter: 'all',
        calendarDate: new Date(),
        selectedCalendarDay: null,
        autoLockMinutes: 5,
        autoLockTimer: null,
        currentViewingDocBlobUrl: null,
        // Anti-Tamper Cross-APK Security & Search Filters
        vaultClusterId: null,
        searchPersonFilter: 'all',
        searchTypeFilter: 'all',
        activeMedMemberFilter: 'all',
        // Brute-force lockout
        loginAttempts: 0,
        loginLockedUntil: 0,
        // Admin reset target
        _adminResetTargetUserId: null,
        // Pending import file
        _pendingImportFile: null
    };

    /* Crypto Loading Spinner */
    function showCryptoSpinner(label = 'Securing with AES-256-GCM…') {
        const el = document.getElementById('cryptoLoadingOverlay');
        const lbl = document.getElementById('cryptoLoadingLabel');
        if (el) { el.classList.add('active'); el.style.display = 'flex'; }
        if (lbl) lbl.textContent = label;
    }
    function hideCryptoSpinner() {
        const el = document.getElementById('cryptoLoadingOverlay');
        if (el) { el.classList.remove('active'); el.style.display = 'none'; }
    }

    /* Toast notification helper */
    function showToast(message, type = 'info') {
        const existing = document.getElementById('heritageToast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'heritageToast';
        const bg = type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#1e293b';
        toast.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:${bg};color:#fff;padding:0.65rem 1.1rem;border-radius:10px;font-size:0.82rem;font-weight:600;z-index:99999;max-width:90vw;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.3);animation:fadeInUp 0.25s ease;`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }
    if (!document.getElementById('toastStyle')) {
        const s = document.createElement('style');
        s.id = 'toastStyle';
        s.textContent = `@keyframes fadeInUp{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translateX(-50%)}}`;
        document.head.appendChild(s);
    }



    /* =============================================================
       INITIALIZATION & ONBOARDING
       ============================================================= */
    window.addEventListener('DOMContentLoaded', async () => {
        // Register Offline ServiceWorker for standalone PWA capability
        if ('serviceWorker' in navigator && (window.location.protocol === 'http:' || window.location.protocol === 'https:')) {
            navigator.serviceWorker.register('./sw.js').catch(() => {});
        }
        setupGlobalEventListeners();
        await initializeApp();
    });

    async function initializeApp() {
        try {
            await HeritageStorage.openDatabase();
            const profiles = await HeritageStorage.getAllProfiles();

            if (!profiles || profiles.length === 0) {
                // First launch: show Master Admin Onboarding
                openModal('modalOnboarding');
            } else {
                // Profiles exist: populate login selector and show PIN unlock
                populateLoginUserSelect(profiles);
                openModal('modalLogin');
            }
        } catch (err) {
            console.error('Initialization error:', err);
            alert('Error initializing My Vault database: ' + err.message);
        }
    }

    /* Seed standard starter folders if none exist */
    async function seedDefaultFolders() {
        const folders = await HeritageStorage.getAllFolders();
        if (folders.length === 0) {
            const defaults = [
                {
                    id: 'public_shelf',
                    name: '🌟 Family Public Shelf',
                    icon: '🌟',
                    category: 'official',
                    security: { isProtected: false, salt: '', token: null },
                    createdAt: Date.now()
                },
                {
                    id: 'deeds_property',
                    name: '🏠 Property & Rental Deeds',
                    icon: '🏠',
                    category: 'official',
                    security: { isProtected: false, salt: '', token: null },
                    createdAt: Date.now()
                },
                {
                    id: 'itr_tax',
                    name: '📑 ITR & Tax Filings',
                    icon: '📑',
                    category: 'financial',
                    security: { isProtected: false, salt: '', token: null },
                    createdAt: Date.now()
                },
                {
                    id: 'pediatric_health',
                    name: '💉 Pediatric Health & Immunization',
                    icon: '💉',
                    category: 'medical',
                    security: { isProtected: false, salt: '', token: null },
                    createdAt: Date.now()
                },
                {
                    id: 'education_marks',
                    name: '🎓 Education & Marksheets',
                    icon: '🎓',
                    category: 'education',
                    security: { isProtected: false, salt: '', token: null },
                    createdAt: Date.now()
                },
                {
                    id: 'private_vault',
                    name: '🔒 Private Family Vault',
                    icon: '🔒',
                    category: 'personal',
                    security: { isProtected: false, salt: '', token: null },
                    createdAt: Date.now()
                }
            ];

            for (const f of defaults) {
                await HeritageStorage.saveFolder(f);
            }
        }
    }

    /* =============================================================
       AUTHENTICATION & PC-STYLE USER ACCESS MANAGEMENT
       ============================================================= */

    // Setup Mode toggle (New Standalone vs Pair Existing)
    const setupModeSel = document.getElementById('setupModeSelect');
    if (setupModeSel) {
        setupModeSel.addEventListener('change', (e) => {
            const isPair = e.target.value === 'pair';
            const pairGroup = document.getElementById('setupPairIdGroup');
            if (pairGroup) pairGroup.style.display = isPair ? 'block' : 'none';
        });
    }

    // First Launch: Master Admin Setup
    document.getElementById('btnCompleteSetup').addEventListener('click', async () => {
        const setupMode = document.getElementById('setupModeSelect') ? document.getElementById('setupModeSelect').value : 'new';
        let clusterId = '';

        if (setupMode === 'pair') {
            clusterId = document.getElementById('setupPairIdInput').value.trim().toUpperCase();
            const clusterIdRegex = /^HV-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/i;
            if (!clusterId || !clusterIdRegex.test(clusterId)) {
                alert('Please enter a valid Vault Cluster ID in format: HV-XXXX-XXXX-XXXX-XXXX');
                return;
            }
        } else {
            clusterId = HeritageCrypto.generateVaultClusterId();
        }

        const adminId = document.getElementById('setupAdminId').value.trim() || 'admin';
        const displayName = document.getElementById('setupAdminName').value.trim() || 'Master Admin';
        const pin = document.getElementById('setupAdminPin').value;
        const confirmPin = document.getElementById('setupAdminPinConfirm').value;

        if (pin.length < 4) {
            alert('PIN must be at least 4 characters.');
            return;
        }
        if (pin !== confirmPin) {
            alert('PINs do not match.');
            return;
        }

        try {
            showCryptoSpinner('Initializing encrypted vault…');
            const salt = HeritageCrypto.generateSalt(16);
            const pinHash = await HeritageCrypto.hashPassphrase(pin, salt);
            const masterKey = await HeritageCrypto.deriveKey(pin, salt);

            const adminProfile = {
                userId: adminId,
                displayName: displayName,
                role: 'admin', // PC Administrator
                salt: salt,
                pinHash: pinHash,
                permissions: {
                    canAddEvents: true,
                    canAddGrowth: true,
                    canViewConfidential: true,
                    canAccessHouseLogs: true,
                    canManageUsers: true,
                    canExport: true
                },
                createdAt: Date.now()
            };

            await HeritageStorage.saveProfile(adminProfile);
            await HeritageStorage.setSetting('vaultClusterId', clusterId);
            AppState.vaultClusterId = clusterId;

            await seedDefaultFolders();

            AppState.currentUser = adminProfile;
            AppState.sessionKey = masterKey;
            hideCryptoSpinner();

            closeModal('modalOnboarding');
            onUserLoggedIn();
        } catch (err) {
            hideCryptoSpinner();
            alert('Failed to initialize Master Admin: ' + err.message);
        }
    });


    // Login Selector Population
    function populateLoginUserSelect(profiles) {
        const select = document.getElementById('loginUserSelect');
        select.innerHTML = '';
        profiles.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.userId;
            opt.textContent = `${p.displayName} (${getRoleDisplay(p.role)})`;
            select.appendChild(opt);
        });
    }

    // Submit PIN Login
    document.getElementById('btnLoginSubmit').addEventListener('click', async () => {
        const userId = document.getElementById('loginUserSelect').value;
        const pin = document.getElementById('loginPinInput').value;
        const errMsg = document.getElementById('loginErrorMessage');

        // Brute-force lockout check
        const now = Date.now();
        if (AppState.loginLockedUntil > now) {
            const secsLeft = Math.ceil((AppState.loginLockedUntil - now) / 1000);
            errMsg.textContent = `Too many failed attempts. Try again in ${secsLeft}s.`;
            errMsg.style.display = 'block';
            return;
        }

        try {
            const profile = await HeritageStorage.getProfile(userId);
            if (!profile) throw new Error('User not found.');

            showCryptoSpinner('Verifying PIN…');
            const computedHash = await HeritageCrypto.hashPassphrase(pin, profile.salt);
            hideCryptoSpinner();

            if (computedHash !== profile.pinHash) {
                AppState.loginAttempts++;
                if (AppState.loginAttempts >= 3) {
                    const lockSecs = AppState.loginAttempts >= 6 ? 300 : (AppState.loginAttempts >= 5 ? 60 : 30);
                    AppState.loginLockedUntil = Date.now() + lockSecs * 1000;
                    errMsg.textContent = `Incorrect PIN. Too many attempts — locked for ${lockSecs} seconds.`;
                } else {
                    errMsg.textContent = `Incorrect PIN. ${3 - AppState.loginAttempts} attempt(s) remaining before lockout.`;
                }
                errMsg.style.display = 'block';
                return;
            }

            AppState.loginAttempts = 0;
            AppState.loginLockedUntil = 0;
            errMsg.style.display = 'none';
            document.getElementById('loginPinInput').value = '';

            showCryptoSpinner('Deriving session key…');
            const sessionKey = await HeritageCrypto.deriveKey(pin, profile.salt);
            hideCryptoSpinner();

            AppState.currentUser = profile;
            AppState.sessionKey = sessionKey;

            closeModal('modalLogin');
            onUserLoggedIn();
        } catch (err) {
            hideCryptoSpinner();
            errMsg.textContent = 'Login error: ' + err.message;
            errMsg.style.display = 'block';
        }
    });



    // Session Unlocked Callback
    async function onUserLoggedIn() {
        renderHeaderUserInfo();
        applyRolePermissions();

        // Load or initialize Vault Cluster ID (Anti-Tamper Lock)
        AppState.vaultClusterId = await HeritageStorage.getSetting('vaultClusterId');
        if (!AppState.vaultClusterId) {
            AppState.vaultClusterId = HeritageCrypto.generateVaultClusterId();
            await HeritageStorage.setSetting('vaultClusterId', AppState.vaultClusterId);
        }
        const disp = document.getElementById('displayVaultClusterId');
        if (disp) disp.textContent = AppState.vaultClusterId;

        // Load last backup timestamp
        const lastBackupAt = await HeritageStorage.getSetting('lastBackupAt');
        const lbDisplay = document.getElementById('lastBackupDisplay');
        if (lbDisplay) {
            if (lastBackupAt) {
                const d = new Date(lastBackupAt);
                lbDisplay.textContent = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const daysSince = Math.floor((Date.now() - lastBackupAt) / (1000 * 60 * 60 * 24));
                if (daysSince > 14) lbDisplay.style.color = 'var(--accent-rose)';
                else if (daysSince > 7) lbDisplay.style.color = 'var(--warning-text)';
                else lbDisplay.style.color = 'var(--success-text)';
            } else {
                lbDisplay.textContent = 'Never — backup recommended!';
                lbDisplay.style.color = 'var(--accent-rose)';
            }
        }

        await loadDashboard();
        await renderFolders();
        await renderMedicalHub();
        await renderGrowthTimelapse();
        await renderHouseLogsCatalog();
        await renderUsersTable();
        startAutoLockCountdown();
        handlePwaShortcuts();
    }



    function getRoleDisplay(role) {
        switch (role) {
            case 'admin': return 'Master Admin';
            case 'co-admin': return 'Co-Admin (Equal Rights)';
            case 'standard': return 'Standard Contributor';
            case 'viewer': return 'Restricted Viewer';
            default: return role;
        }
    }

    function renderHeaderUserInfo() {
        const u = AppState.currentUser;
        if (!u) return;

        document.getElementById('headerUserName').textContent = u.displayName || u.userId;
        const rolePill = document.getElementById('headerUserRole');
        rolePill.textContent = u.role === 'admin' ? 'Admin' : (u.role === 'co-admin' ? 'Co-Admin' : (u.role === 'standard' ? 'Standard' : 'Viewer'));
        rolePill.className = `role-pill role-${u.role}`;
    }

    function applyRolePermissions() {
        const u = AppState.currentUser;
        const isAdmin = u.role === 'admin' || u.role === 'co-admin';

        // House Logs Locker Tab visibility
        const hlTab = document.getElementById('navTabHouseLogs');
        if (isAdmin || (u.permissions && u.permissions.canAccessHouseLogs)) {
            hlTab.style.display = 'flex';
        } else {
            hlTab.style.display = 'none';
        }

        // Settings User Management visibility
        const userPanel = document.getElementById('adminUserManagementPanel');
        if (isAdmin) {
            userPanel.style.display = 'block';
        } else {
            userPanel.style.display = 'none';
        }

        // Action Buttons visibility for Viewer role
        const isViewer = u.role === 'viewer';
        document.getElementById('btnOpenAddEvent').style.display = isViewer ? 'none' : 'inline-flex';
        document.getElementById('btnOpenAddDoc').style.display = isViewer ? 'none' : 'inline-flex';
        document.getElementById('btnOpenAddFolder').style.display = isViewer ? 'none' : 'inline-flex';
        document.getElementById('btnOpenAddGrowth').style.display = isViewer ? 'none' : 'inline-flex';
    }

    // Switch User or Lock Session
    document.getElementById('currentUserBadge').addEventListener('click', lockSession);
    document.getElementById('btnLockSession').addEventListener('click', lockSession);

    async function lockSession() {
        AppState.currentUser = null;
        AppState.sessionKey = null;
        AppState.unlockedFolders.clear();
        clearTimeout(AppState.autoLockTimer);

        const profiles = await HeritageStorage.getAllProfiles();
        populateLoginUserSelect(profiles);
        openModal('modalLogin');
    }

    // Inactivity Auto-Lock
    function startAutoLockCountdown() {
        clearTimeout(AppState.autoLockTimer);
        const mins = Number(AppState.autoLockMinutes);
        if (mins <= 0) return;

        AppState.autoLockTimer = setTimeout(() => {
            lockSession();
        }, mins * 60 * 1000);
    }

    function resetAutoLockActivity() {
        if (AppState.currentUser) {
            startAutoLockCountdown();
        }
    }

    document.getElementById('settingAutoLock').addEventListener('change', (e) => {
        AppState.autoLockMinutes = Number(e.target.value);
        startAutoLockCountdown();
    });

    /* =============================================================
       DASHBOARD: KPIS, CALENDAR & LIFE STREAM
       ============================================================= */

    async function loadDashboard() {
        await updateStorageMetrics();
        await renderCalendar();
        await renderEventsStream(AppState.currentFilter);
        await renderTimeCapsule();
    }

    // Storage Metrics & KPI Update
    async function updateStorageMetrics() {
        const metrics = await HeritageStorage.getStorageMetrics();

        document.getElementById('kpiDocCount').textContent = metrics.docCount;
        document.getElementById('kpiDocSize').textContent = `${metrics.docFormatted} Stored Securely`;
        document.getElementById('kpiEventsCount').textContent = metrics.eventsCount;
        document.getElementById('kpiTotalStorage').textContent = metrics.totalFormatted;

        // Metric breakdown bar in Settings
        document.getElementById('metricDocSize').textContent = metrics.docFormatted;
        document.getElementById('metricGrowthSize').textContent = metrics.growthFormatted;
        document.getElementById('metricHLSize').textContent = metrics.hlFormatted;
        document.getElementById('metricTotalSize').textContent = metrics.totalFormatted;

        if (metrics.totalBytes > 0) {
            const docPct = ((metrics.docBytes / metrics.totalBytes) * 100).toFixed(1);
            const growthPct = ((metrics.growthBytes / metrics.totalBytes) * 100).toFixed(1);
            const hlPct = ((metrics.hlBytes / metrics.totalBytes) * 100).toFixed(1);

            document.getElementById('storageBarDocs').style.width = docPct + '%';
            document.getElementById('storageBarGrowth').style.width = growthPct + '%';
            document.getElementById('storageBarHL').style.width = hlPct + '%';
        }

        // Calculate Next Expiry Countdown (Prioritize upcoming over historical)
        const docs = await HeritageStorage.getAllDocuments();
        const docsWithExpiry = docs.filter(d => !!d.expiryDate).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
        const todayStart = new Date(new Date().toDateString());
        const upcomingDocs = docsWithExpiry.filter(d => new Date(d.expiryDate) >= todayStart);
        const targetDoc = upcomingDocs.length > 0 ? upcomingDocs[0] : (docsWithExpiry.length > 0 ? docsWithExpiry[docsWithExpiry.length - 1] : null);

        if (targetDoc) {
            const diffDays = Math.ceil((new Date(targetDoc.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
            const el = document.getElementById('kpiNextExpiry');
            const sub = document.getElementById('kpiNextExpiryName');

            sub.textContent = targetDoc.title || 'Document';
            if (diffDays < 0) {
                el.textContent = `${Math.abs(diffDays)}d Overdue`;
                el.style.color = 'var(--accent)';
            } else if (diffDays === 0) {
                el.textContent = 'Expires Today';
                el.style.color = 'var(--accent)';
            } else {
                el.textContent = `${diffDays} Days Left`;
                el.style.color = diffDays <= 30 ? 'var(--warning-text)' : 'var(--success-text)';
            }
        } else {
            document.getElementById('kpiNextExpiry').textContent = 'None';
            document.getElementById('kpiNextExpiryName').textContent = 'No upcoming expiries';
        }
    }

    // Calendar Widget
    const MONTH_NAMES = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    async function renderCalendar() {
        const year = AppState.calendarDate.getFullYear();
        const month = AppState.calendarDate.getMonth();

        const monthLabel = document.getElementById('calMonthYearLabel');
        if (monthLabel) monthLabel.textContent = `${MONTH_NAMES[month]} ${year}`;

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const grid = document.getElementById('calendarDaysGrid');
        if (!grid) return;
        grid.innerHTML = '';

        // Fetch events and medical records for dot indicators
        const [events, medicalVisits] = await Promise.all([
            HeritageStorage.getAllEvents(),
            HeritageStorage.getAllMedicalVisits()
        ]);
        const eventDatesSet = new Set(events.map(e => e.date));
        const medDatesMap = new Map();
        medicalVisits.forEach(m => {
            if (m.visitDate) medDatesMap.set(m.visitDate, `🩺 Medical Visit: ${m.doctorName} (${m.familyMember})`);
            if (m.nextVisitDate) medDatesMap.set(m.nextVisitDate, `⏳ Scheduled Checkup: ${m.nextVisitReason || 'Follow-up'} with ${m.doctorName} (${m.familyMember})`);
        });

        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        // Empty padding cells
        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement('div');
            empty.className = 'calendar-cell';
            empty.style.cursor = 'default';
            empty.style.opacity = '0.2';
            grid.appendChild(empty);
        }

        // Day cells
        for (let day = 1; day <= daysInMonth; day++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-cell';
            cell.textContent = day;

            const dayDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            if (eventDatesSet.has(dayDateStr)) {
                cell.classList.add('has-event');
            }

            if (medDatesMap.has(dayDateStr)) {
                cell.classList.add('has-med');
                cell.title = medDatesMap.get(dayDateStr);
            }

            if (dayDateStr === todayStr) {
                cell.classList.add('today');
            }

            if (AppState.selectedCalendarDay === dayDateStr) {
                cell.classList.add('selected');
            }

            cell.addEventListener('click', () => {
                if (AppState.selectedCalendarDay === dayDateStr) {
                    AppState.selectedCalendarDay = null; // deselect to show all
                } else {
                    AppState.selectedCalendarDay = dayDateStr;
                }
                renderCalendar();
                renderEventsStream(AppState.currentFilter);
            });

            grid.appendChild(cell);
        }
    }

    document.getElementById('btnCalPrev').addEventListener('click', () => {
        AppState.calendarDate.setDate(1); // prevent 31st month-overflow bug
        AppState.calendarDate.setMonth(AppState.calendarDate.getMonth() - 1);
        renderCalendar();
    });

    document.getElementById('btnCalNext').addEventListener('click', () => {
        AppState.calendarDate.setDate(1); // prevent 31st month-overflow bug
        AppState.calendarDate.setMonth(AppState.calendarDate.getMonth() + 1);
        renderCalendar();
    });

    const btnCalToday = document.getElementById('btnCalToday');
    if (btnCalToday) {
        btnCalToday.addEventListener('click', () => {
            const now = new Date();
            AppState.calendarDate = new Date();
            AppState.selectedCalendarDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            renderCalendar();
            renderEventsStream(AppState.currentFilter);
        });
    }

    // "On This Day" Time Capsule
    async function renderTimeCapsule() {
        const events = await HeritageStorage.getAllEvents();
        const today = new Date();
        const todayMonthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const matches = events.filter(e => {
            if (!e.date) return false;
            const parts = e.date.split('-');
            if (parts.length >= 3) {
                return `${parts[1]}-${parts[2]}` === todayMonthDay;
            }
            return false;
        });

        const container = document.getElementById('timeCapsuleContent');
        if (matches.length > 0) {
            let html = '';
            matches.forEach(m => {
                const year = m.date.split('-')[0];
                const yearsAgo = today.getFullYear() - Number(year);
                const yearLabel = yearsAgo === 0 ? 'Earlier this year' : `${yearsAgo} year${yearsAgo > 1 ? 's' : ''} ago`;

                html += `
                    <div style="margin-bottom: 0.6rem; border-left: 2px solid var(--md-sys-color-primary); padding-left: 0.5rem;">
                        <span style="font-weight: 700; color: var(--md-sys-color-primary);">${yearLabel} (${year}):</span>
                        <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(m.title)}</div>
                        <div style="font-size: 0.75rem; color: var(--text-secondary);">${escapeHtml(m.description || '')}</div>
                    </div>
                `;
            });
            container.innerHTML = html;
        } else {
            container.innerHTML = `
                <div style="color: var(--text-muted);">
                    No recorded events for today's date (${today.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}).
                    Every new milestone you record today will resurface here in future years!
                </div>
            `;
        }
    }

    // Chronological Life Events Stream (Integrated with Calendar & Medical Records)
    async function renderEventsStream(filter = 'all') {
        const [events, medicalVisits] = await Promise.all([
            HeritageStorage.getAllEvents(),
            HeritageStorage.getAllMedicalVisits()
        ]);
        const container = document.getElementById('timelineContainer');
        const filterBar = document.getElementById('calendarActiveFilterBar');

        let matchedEvents = [];
        let matchedVisits = [];

        if (AppState.selectedCalendarDay) {
            matchedEvents = events.filter(e => e.date === AppState.selectedCalendarDay);
            matchedVisits = medicalVisits.filter(m => m.visitDate === AppState.selectedCalendarDay || m.nextVisitDate === AppState.selectedCalendarDay);

            if (filter !== 'all') {
                matchedEvents = matchedEvents.filter(e => e.category === filter);
            }

            const totalCount = matchedEvents.length + matchedVisits.length;
            const [y, m, d] = AppState.selectedCalendarDay.split('-');
            const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
            const formattedDate = dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

            if (filterBar) {
                filterBar.style.display = 'block';
                filterBar.innerHTML = `
                    <div class="cal-filter-banner">
                        <div class="cal-filter-text">
                            <span class="cal-filter-badge">📅 Active Day</span>
                            <strong>${formattedDate}</strong>
                            <span class="cal-filter-count">(${totalCount} record${totalCount === 1 ? '' : 's'})</span>
                        </div>
                        <div class="cal-filter-buttons">
                            <button class="btn btn-sm btn-primary" onclick="window.openAddEventForDate('${AppState.selectedCalendarDay}')">➕ Log on this Date</button>
                            <button class="btn btn-sm btn-secondary" onclick="window.clearCalendarDateFilter()">✕ Show All</button>
                        </div>
                    </div>
                `;
            }
        } else {
            if (filterBar) filterBar.style.display = 'none';
            matchedEvents = filter === 'all' ? events : events.filter(e => e.category === filter);
        }

        if (matchedEvents.length === 0 && matchedVisits.length === 0) {
            if (AppState.selectedCalendarDay) {
                const [y, m, d] = AppState.selectedCalendarDay.split('-');
                const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
                const formattedDate = dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

                container.innerHTML = `
                    <div class="empty-state-card">
                        <div class="empty-state-icon">📅</div>
                        <div class="empty-state-title">No Records for ${formattedDate}</div>
                        <div class="empty-state-text">
                            You have no milestones, diary entries, or scheduled doctor checkups on this date.
                        </div>
                        <button class="btn btn-primary" onclick="window.openAddEventForDate('${AppState.selectedCalendarDay}')">
                            ➕ Log Life Milestone or Note on this Date
                        </button>
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <div class="empty-state-card">
                        <div class="empty-state-icon">📜</div>
                        <div class="empty-state-title">Your Family Chronicle is Empty</div>
                        <div class="empty-state-text">
                            Start recording your family's lifetime milestones, baby steps, educational achievements, and private memories.
                        </div>
                        <button class="btn btn-primary" onclick="window.openAddEventForDate()">
                            ➕ Log Your First Milestone
                        </button>
                    </div>
                `;
            }
            return;
        }

        let html = '';

        // Render Medical visits that fall on selected date first
        matchedVisits.forEach(mv => {
            const isVisit = mv.visitDate === AppState.selectedCalendarDay;
            const title = isVisit ? `🩺 Medical Checkup: ${mv.doctorName}` : `⏳ Scheduled Follow-up: ${mv.nextVisitReason || 'Doctor Checkup'}`;
            const badgeClass = isVisit ? 'timeline-node-health' : 'timeline-node-milestone';

            html += `
                <div class="timeline-node ${badgeClass}">
                    <div class="timeline-node-dot">${isVisit ? '🩺' : '⏳'}</div>
                    <div class="event-card" style="border-left: 4px solid var(--accent);">
                        <div class="event-meta">
                            <span class="event-date">📅 ${AppState.selectedCalendarDay}</span>
                            <span class="event-category-badge" style="background: var(--info-bg); color: var(--info-text); border: 1px solid var(--info-border);">
                                🩺 Medical • ${escapeHtml(mv.familyMember || 'Family')}
                            </span>
                        </div>
                        <div class="event-title">${escapeHtml(title)}</div>
                        <div class="event-desc">
                            <strong>Doctor:</strong> ${escapeHtml(mv.doctorName)} (${escapeHtml(mv.clinicHospital || 'Clinic/Hospital')})<br>
                            ${mv.symptomsDiagnosis ? `<strong>Diagnosis/Notes:</strong> ${escapeHtml(mv.symptomsDiagnosis)}` : ''}
                        </div>
                        <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.6rem;">
                            <button class="btn btn-secondary btn-sm" onclick="document.getElementById('navTabMedical').click();">View in Medical Hub →</button>
                        </div>
                    </div>
                </div>
            `;
        });

        // Render Life events
        matchedEvents.forEach(ev => {
            const isMasked = ev.isPrivate && AppState.privacyMaskEnabled;
            const categoryBadge = getCategoryBadge(ev.category);
            const nodeClass = `timeline-node-${ev.category || 'general'}`;

            html += `
                <div class="timeline-node ${nodeClass}">
                    <div class="timeline-node-dot">📍</div>
                    <div class="event-card">
                        <div class="event-meta">
                            <span class="event-date">📅 ${ev.date || 'Undated'}</span>
                            <span class="event-category-badge">${categoryBadge}</span>
                        </div>
                        <div class="event-title">${escapeHtml(ev.title)}</div>
                        <div class="event-desc ${isMasked ? 'privacy-masked' : 'privacy-unmasked'}">
                            ${escapeHtml(ev.description || 'No additional notes.')}
                        </div>
                        <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.6rem;">
                            <button class="btn btn-secondary btn-sm" onclick="HeritageApp.deleteEvent('${ev.id}')">🗑️ Delete</button>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    function getCategoryBadge(cat) {
        switch (cat) {
            case 'milestone': return '🌟 Milestone';
            case 'health': return '💉 Health & Vaccine';
            case 'education': return '🎓 Education';
            case 'family': return '👨‍👩‍👧 Family';
            case 'diary': return '📖 Diary';
            case 'legal': return '⚖️ Official';
            default: return '📝 General';
        }
    }

    // Filter Chips Event Listener
    document.querySelectorAll('.event-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.event-filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            AppState.currentFilter = e.target.dataset.filter;
            renderEventsStream(AppState.currentFilter);
        });
    });

    // Global Calendar Helpers
    window.openAddEventForDate = function (dateStr) {
        document.getElementById('evTitle').value = '';
        document.getElementById('evDate').value = dateStr || AppState.selectedCalendarDay || new Date().toISOString().split('T')[0];
        document.getElementById('evDescription').value = '';
        document.getElementById('evIsPrivate').checked = false;
        openModal('modalAddEvent');
    };

    window.clearCalendarDateFilter = function () {
        AppState.selectedCalendarDay = null;
        renderCalendar();
        renderEventsStream(AppState.currentFilter);
    };

    // Privacy Mask Toggle
    document.getElementById('btnPrivacyPeek').addEventListener('click', () => {
        AppState.privacyMaskEnabled = !AppState.privacyMaskEnabled;
        const btn = document.getElementById('btnPrivacyPeek');
        btn.style.color = AppState.privacyMaskEnabled ? 'var(--text-primary)' : 'var(--accent-blue)';
        renderEventsStream(AppState.currentFilter);
    });

    // Add Event Modal
    document.getElementById('btnOpenAddEvent').addEventListener('click', () => {
        window.openAddEventForDate(AppState.selectedCalendarDay);
    });

    document.getElementById('btnSaveEvent').addEventListener('click', async () => {
        const title = document.getElementById('evTitle').value.trim();
        const date = document.getElementById('evDate').value;
        const category = document.getElementById('evCategory').value;
        const importance = document.getElementById('evImportance').value;
        const description = document.getElementById('evDescription').value.trim();
        const isPrivate = document.getElementById('evIsPrivate').checked;

        if (!title) {
            alert('Please enter an event headline.');
            return;
        }

        const newEvent = {
            id: 'ev_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            title,
            date,
            category,
            importance,
            description,
            isPrivate,
            authorId: AppState.currentUser ? AppState.currentUser.userId : 'admin',
            createdAt: Date.now()
        };

        try {
            await HeritageStorage.saveEvent(newEvent);
            closeModal('modalAddEvent');
            await loadDashboard();
        } catch (err) {
            alert('Failed to save event: ' + err.message);
        }
    });

    /* =============================================================
       DOCUMENT VAULT: FOLDERS, PDFS, EXPIRY & ENCRYPTION
       ============================================================= */

    async function renderFolders() {
        const folders = await HeritageStorage.getAllFolders();
        const container = document.getElementById('folderGridContainer');
        const docSelect = document.getElementById('docFolderSelect');

        container.innerHTML = '';
        docSelect.innerHTML = '';

        // Add "All Folders" virtual card
        const allCard = document.createElement('div');
        allCard.className = `folder-card ${AppState.activeFolderId === 'all' ? 'active' : ''}`;
        allCard.innerHTML = `
            <div class="folder-top">
                <span class="folder-icon">🗂️</span>
                <span class="security-badge public">All Vault</span>
            </div>
            <div class="folder-name">All Documents</div>
            <div class="folder-subtext">Unified Document Shelf</div>
        `;
        allCard.addEventListener('click', () => selectFolder('all'));
        container.appendChild(allCard);

        const currentCat = AppState.vaultCategoryFilter || 'all';
        const filteredFolders = currentCat === 'all' ? folders : folders.filter(f => f.category === currentCat);

        for (const f of filteredFolders) {
            const isUnlocked = !f.security || !f.security.isProtected || AppState.unlockedFolders.has(f.id);
            const isProtected = f.security && f.security.isProtected;

            const card = document.createElement('div');
            card.className = `folder-card ${AppState.activeFolderId === f.id ? 'active' : ''}`;
            card.innerHTML = `
                <div class="folder-top">
                    <span class="folder-icon">${f.icon || '📁'}</span>
                    <span class="security-badge ${isProtected ? (isUnlocked ? 'public' : 'protected') : 'public'}">
                        ${isProtected ? (isUnlocked ? '🔓 Unlocked' : '🔒 Encrypted') : '🌟 Public Shelf'}
                    </span>
                </div>
                <div class="folder-name">${escapeHtml(f.name)}</div>
                <div class="folder-subtext">${f.category ? f.category.toUpperCase() : 'OFFICIAL'}</div>
            `;
            card.addEventListener('click', () => selectFolder(f.id));
            container.appendChild(card);
        }

        // Always populate full folders list in upload select
        for (const f of folders) {
            const opt = document.createElement('option');
            opt.value = f.id;
            opt.textContent = `${f.icon || '📁'} ${f.name}`;
            docSelect.appendChild(opt);
        }

        await renderDocuments(AppState.activeFolderId);
    }

    // Attach vault category listeners
    document.querySelectorAll('.vault-category-pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.vault-category-pill').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            AppState.vaultCategoryFilter = e.target.dataset.cat;
            renderFolders();
        });
    });

    async function selectFolder(folderId) {
        if (folderId === 'all') {
            AppState.activeFolderId = 'all';
            document.getElementById('activeFolderTitle').innerHTML = '<span>📂</span> All Documents';
            await renderFolders();
            return;
        }

        const folder = await HeritageStorage.getFolder(folderId);
        if (!folder) return;

        // Check if folder is protected and not unlocked yet
        if (folder.security && folder.security.isProtected && !AppState.unlockedFolders.has(folder.id)) {
            // Check if Master Admin override or require folder password
            promptFolderPassword(folder);
            return;
        }

        AppState.activeFolderId = folderId;
        document.getElementById('activeFolderTitle').innerHTML = `<span>${folder.icon || '📁'}</span> ${escapeHtml(folder.name)}`;
        await renderFolders();
    }

    function promptFolderPassword(folder) {
        document.getElementById('unlockFolderPasswordInput').value = '';
        document.getElementById('unlockFolderError').style.display = 'none';
        document.getElementById('unlockFolderDesc').textContent = `Folder "${folder.name}" is protected with AES-256-GCM encryption. Enter its custom password.`;

        AppState._pendingUnlockFolder = folder;
        openModal('modalUnlockFolder');
    }

    document.getElementById('btnSubmitUnlockFolder').addEventListener('click', async () => {
        const folder = AppState._pendingUnlockFolder;
        if (!folder) return;

        const pwd = document.getElementById('unlockFolderPasswordInput').value;
        const errEl = document.getElementById('unlockFolderError');

        showCryptoSpinner('Deriving folder key…');
        const result = await HeritageCrypto.unlockFolder(pwd, folder.security);
        hideCryptoSpinner();
        if (result.success) {
            AppState.unlockedFolders.set(folder.id, result.key);
            closeModal('modalUnlockFolder');
            AppState._pendingUnlockFolder = null;
            AppState.activeFolderId = folder.id;
            document.getElementById('activeFolderTitle').innerHTML = `<span>${folder.icon || '📁'}</span> ${escapeHtml(folder.name)}`;
            await renderFolders();
        } else {
            errEl.textContent = result.error || 'Incorrect password.';
            errEl.style.display = 'block';
        }
    });


    // Render Document Cards inside active folder
    async function renderDocuments(folderId) {
        let docs = [];
        if (folderId === 'all') {
            docs = await HeritageStorage.getAllDocuments();
        } else {
            docs = await HeritageStorage.getDocumentsByFolder(folderId);
        }

        document.getElementById('activeFolderCount').textContent = `${docs.length} File${docs.length === 1 ? '' : 's'}`;
        const container = document.getElementById('documentGridContainer');
        container.innerHTML = '';

        if (docs.length === 0) {
            container.innerHTML = `
                <div class="empty-state-card" style="grid-column: 1 / -1;">
                    <div class="empty-state-icon">📄</div>
                    <div class="empty-state-title">No Documents in this Compartment</div>
                    <div class="empty-state-text">
                        Upload official contracts, Aadhaar cards, lease agreements, or property deeds securely with local encryption.
                    </div>
                    <button class="btn btn-primary" onclick="document.getElementById('btnOpenAddDoc').click();">
                        ➕ Upload First Document
                    </button>
                </div>
            `;
            return;
        }

        docs.forEach(doc => {
            const card = document.createElement('div');
            card.className = 'doc-card';

            const expiryBadge = getExpiryBadge(doc.expiryDate);

            card.innerHTML = `
                <div>
                    <div class="doc-header">
                        <div class="doc-thumb">${doc.fileType && doc.fileType.includes('pdf') ? '📑' : '🖼️'}</div>
                        <div style="flex: 1;">
                            <div class="doc-title">${escapeHtml(doc.title)}</div>
                            <div style="font-size: 0.72rem; color: var(--text-muted);">${doc.fileName || 'document'}</div>
                            ${expiryBadge}
                        </div>
                    </div>
                    ${doc.notes ? `<div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.5rem;">${escapeHtml(doc.notes)}</div>` : ''}
                </div>
                <div class="doc-footer">
                    <span>${HeritageStorage.formatBytes(doc.fileSize || 0)}</span>
                    <div style="display: flex; gap: 0.4rem;">
                        <button class="btn btn-primary btn-sm" onclick="HeritageApp.viewDoc('${doc.id}')">👁️ View</button>
                        <button class="btn btn-secondary btn-sm" onclick="HeritageApp.downloadDoc('${doc.id}')">💾 Save</button>
                        <button class="btn btn-danger btn-sm" onclick="HeritageApp.deleteDoc('${doc.id}')">🗑️</button>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    function getExpiryBadge(expiryDate) {
        if (!expiryDate) return '';
        const today = new Date();
        const exp = new Date(expiryDate);
        const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return `<span class="doc-expiry-badge expiry-urgent">⚠️ Expired ${Math.abs(diffDays)}d ago</span>`;
        } else if (diffDays === 0) {
            return `<span class="doc-expiry-badge expiry-urgent">⏳ Expires Today</span>`;
        } else if (diffDays <= 30) {
            return `<span class="doc-expiry-badge expiry-upcoming">⏳ Expires in ${diffDays}d</span>`;
        } else {
            return `<span class="doc-expiry-badge expiry-safe">✅ Valid until ${expiryDate}</span>`;
        }
    }

    // Add Document Modal
    document.getElementById('btnOpenAddDoc').addEventListener('click', () => {
        document.getElementById('docTitle').value = '';
        document.getElementById('docFileInput').value = '';
        document.getElementById('docExpiryDate').value = '';
        document.getElementById('docNotes').value = '';
        const autoBadge = document.getElementById('docFolderAutoBadge');
        if (autoBadge) autoBadge.style.display = 'none';
        const noticeBox = document.getElementById('docFolderSuggestionNotice');
        if (noticeBox) noticeBox.style.display = 'none';
        const alreadyBox = document.getElementById('docAlreadyPresentContainer');
        if (alreadyBox) alreadyBox.style.display = 'none';
        openModal('modalAddDoc');
    });

    document.getElementById('btnSaveDoc').addEventListener('click', async () => {
        const folderId = document.getElementById('docFolderSelect').value;
        const title = document.getElementById('docTitle').value.trim();
        const fileInput = document.getElementById('docFileInput');
        const expiryDate = document.getElementById('docExpiryDate').value;
        const notes = document.getElementById('docNotes').value.trim();

        const familyMemberSelect = document.getElementById('docFamilyMemberSelect');
        const familyMember = familyMemberSelect ? familyMemberSelect.value : 'All Family';

        if (!title) {
            alert('Please enter a document title.');
            return;
        }
        if (!fileInput.files || fileInput.files.length === 0) {
            alert('Please select a file to upload.');
            return;
        }

        const file = fileInput.files[0];
        const reader = new FileReader();

        reader.onload = async function (e) {
            try {
                const arrayBuffer = e.target.result;
                const folder = await HeritageStorage.getFolder(folderId);

                let isEncrypted = false;
                let iv = null;
                let payloadBuffer = arrayBuffer;

                // Check if folder is encrypted
                if (folder && folder.security && folder.security.isProtected) {
                    const folderKey = AppState.unlockedFolders.get(folder.id);
                    if (!folderKey) {
                        alert('Folder is locked. Please unlock the folder before adding encrypted documents.');
                        return;
                    }
                    const encResult = await HeritageCrypto.encryptBinary(arrayBuffer, folderKey);
                    iv = encResult.iv;
                    payloadBuffer = encResult.cipherBuf;
                    isEncrypted = true;
                }

                const docRecord = {
                    id: 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    folderId: folderId,
                    title: title,
                    familyMember: familyMember,
                    fileType: file.type || 'application/octet-stream',
                    fileName: file.name,
                    fileSize: file.size,
                    expiryDate: expiryDate || null,
                    notes: notes,
                    isEncrypted: isEncrypted,
                    iv: iv,
                    fileBlob: payloadBuffer,
                    createdAt: Date.now()
                };

                await HeritageStorage.saveDocument(docRecord);
                closeModal('modalAddDoc');
                await renderDocuments(AppState.activeFolderId);
                await updateStorageMetrics();
            } catch (err) {
                alert('Failed to archive document: ' + err.message);
            }
        };

        reader.readAsArrayBuffer(file);
    });

    // Add Folder Modal
    document.getElementById('btnOpenAddFolder').addEventListener('click', () => {
        document.getElementById('folderNameInput').value = '';
        document.getElementById('folderIconInput').value = '📁';
        document.getElementById('folderPasswordToggle').checked = false;
        document.getElementById('folderPasswordContainer').style.display = 'none';
        document.getElementById('folderPasswordInput').value = '';
        openModal('modalAddFolder');
    });

    document.getElementById('folderPasswordToggle').addEventListener('change', (e) => {
        document.getElementById('folderPasswordContainer').style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('btnCreateFolder').addEventListener('click', async () => {
        const name = document.getElementById('folderNameInput').value.trim();
        const icon = document.getElementById('folderIconInput').value.trim() || '📁';
        const category = document.getElementById('folderCategorySelect').value;
        const isPasswordProtected = document.getElementById('folderPasswordToggle').checked;
        const password = document.getElementById('folderPasswordInput').value;

        if (!name) {
            alert('Please enter a folder name.');
            return;
        }

        if (isPasswordProtected && (!password || password.length < 4)) {
            alert('Folder password must be at least 4 characters.');
            return;
        }

        try {
            let security = { isProtected: false, salt: '', token: null };
            if (isPasswordProtected) {
                security = await HeritageCrypto.createFolderSecurity(password);
            }

            const folderRecord = {
                id: 'folder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                name,
                icon,
                category,
                security,
                createdAt: Date.now()
            };

            await HeritageStorage.saveFolder(folderRecord);
            closeModal('modalAddFolder');
            await renderFolders();
        } catch (err) {
            alert('Failed to create folder: ' + err.message);
        }
    });

    // Document Viewing & Download Handler
    async function viewDocument(docId) {
        const doc = await HeritageStorage.getDocument(docId);
        if (!doc) return;

        let rawBuffer = doc.fileBlob;

        // If encrypted, decrypt using folder key
        if (doc.isEncrypted) {
            const folderKey = AppState.unlockedFolders.get(doc.folderId);
            if (!folderKey) {
                alert('Folder key not in session. Unlock the folder first.');
                return;
            }
            try {
                rawBuffer = await HeritageCrypto.decryptBinary(doc.fileBlob, doc.iv, folderKey);
            } catch (e) {
                alert('Failed to decrypt document bytes.');
                return;
            }
        }

        const blob = new Blob([rawBuffer], { type: doc.fileType });
        if (AppState.currentViewingDocBlobUrl) {
            URL.revokeObjectURL(AppState.currentViewingDocBlobUrl);
        }
        AppState.currentViewingDocBlobUrl = URL.createObjectURL(blob);
        AppState._activeViewingDoc = doc;

        document.getElementById('viewerDocTitle').textContent = doc.title;
        const container = document.getElementById('viewerContainer');
        container.innerHTML = '';

        if (doc.fileType.includes('image')) {
            const img = document.createElement('img');
            img.src = AppState.currentViewingDocBlobUrl;
            img.style.maxWidth = '100%';
            img.style.maxHeight = '100%';
            img.style.objectFit = 'contain';
            container.appendChild(img);
        } else {
            // PDF or iframe preview
            const iframe = document.createElement('iframe');
            iframe.className = 'viewer-iframe';
            iframe.src = AppState.currentViewingDocBlobUrl;
            container.appendChild(iframe);
        }

        openModal('modalDocViewer');
    }

    async function downloadDocument(docId) {
        const doc = await HeritageStorage.getDocument(docId);
        if (!doc) return;

        let rawBuffer = doc.fileBlob;
        if (doc.isEncrypted) {
            const folderKey = AppState.unlockedFolders.get(doc.folderId);
            if (!folderKey) {
                alert('Folder is locked. Unlock folder to download file.');
                return;
            }
            rawBuffer = await HeritageCrypto.decryptBinary(doc.fileBlob, doc.iv, folderKey);
        }

        const blob = new Blob([rawBuffer], { type: doc.fileType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.fileName || `${doc.title}.${doc.fileType.includes('pdf') ? 'pdf' : 'bin'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    document.getElementById('btnDownloadCurrentDoc').addEventListener('click', () => {
        if (AppState._activeViewingDoc) {
            downloadDocument(AppState._activeViewingDoc.id);
        }
    });

    /* =============================================================
       HEALTH & MEDICAL HUB: DOCTOR VISITS & CUSTOM SCHEDULER
       ============================================================= */

    async function renderMedicalHub(memberFilter = 'all') {
        AppState.activeMedMemberFilter = memberFilter;
        const allVisits = await HeritageStorage.getAllMedicalVisits();

        let filtered = allVisits;
        if (memberFilter !== 'all') {
            filtered = filtered.filter(v => (v.familyMember || '').toLowerCase() === memberFilter.toLowerCase());
        }

        // 1. Update KPI: Last Medical Visit
        const lastEl = document.getElementById('kpiLastMedicalDoctor');
        const lastSub = document.getElementById('kpiLastMedicalDetails');
        if (filtered.length > 0) {
            const latest = filtered[0];
            lastEl.textContent = latest.doctorName || 'Doctor Visit';
            lastSub.textContent = `${latest.familyMember} • ${latest.visitDate || 'Recent'}`;
            lastEl.style.color = 'var(--accent-emerald)';
        } else {
            lastEl.textContent = 'None Logged';
            lastSub.textContent = 'Consultation / Hospital';
            lastEl.style.color = 'var(--text-muted)';
        }

        // 2. Update KPI: Next Scheduled Checkup (Find upcoming nextVisitDate)
        const nextEl = document.getElementById('kpiNextMedicalCountdown');
        const nextSub = document.getElementById('kpiNextMedicalDetails');
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const scheduledList = filtered
            .filter(v => !!v.nextVisitDate)
            .sort((a, b) => a.nextVisitDate.localeCompare(b.nextVisitDate));

        const upcoming = scheduledList.find(v => new Date(v.nextVisitDate) >= today) || scheduledList[0];

        if (upcoming) {
            const nextDate = new Date(upcoming.nextVisitDate);
            const diffDays = Math.ceil((nextDate - today) / (1000 * 60 * 60 * 24));
            nextSub.textContent = `${upcoming.familyMember}: ${upcoming.nextVisitReason || 'Checkup'}`;

            if (diffDays < 0) {
                nextEl.textContent = `${Math.abs(diffDays)}d Overdue`;
                nextEl.style.color = 'var(--accent-rose)';
            } else if (diffDays === 0) {
                nextEl.textContent = 'Due Today';
                nextEl.style.color = 'var(--accent-rose)';
            } else {
                nextEl.textContent = `In ${diffDays} Day${diffDays > 1 ? 's' : ''}`;
                nextEl.style.color = diffDays <= 7 ? 'var(--accent-amber)' : 'var(--accent-blue)';
            }
        } else {
            nextEl.textContent = 'None Scheduled';
            nextSub.textContent = 'Follow-up / Vaccine';
            nextEl.style.color = 'var(--text-muted)';
        }

        // 3. Update Total Count
        document.getElementById('kpiMedicalTotalCount').textContent = filtered.length;
        document.getElementById('medicalVisitCountLabel').textContent = `${filtered.length} Record${filtered.length === 1 ? '' : 's'}`;

        // 4. Render Visual Timeline Cards
        const container = document.getElementById('medicalTimelineContainer');
        container.innerHTML = '';

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state-card">
                    <div class="empty-state-icon">🩺</div>
                    <div class="empty-state-title">No Medical Records Found</div>
                    <div class="empty-state-text">
                        Log doctor visits, prescriptions, pediatric vaccine schedules, and set reminders for future checkups.
                    </div>
                    <button class="btn btn-primary" onclick="document.getElementById('btnOpenAddMedical').click();">
                        ➕ Record First Medical Visit
                    </button>
                </div>
            `;
            return;
        }

        filtered.forEach(visit => {
            const card = document.createElement('div');
            const isOverdue = visit.nextVisitDate && new Date(visit.nextVisitDate) < today;
            const isUpcoming = visit.nextVisitDate && new Date(visit.nextVisitDate) >= today;

            card.className = `medical-card ${isOverdue ? 'overdue' : (isUpcoming ? 'scheduled' : '')}`;

            card.innerHTML = `
                <div class="medical-header">
                    <div>
                        <div class="medical-doctor">🩺 ${escapeHtml(visit.doctorName || 'Doctor Consultation')}</div>
                        <div class="medical-hospital">🏥 ${escapeHtml(visit.clinicHospital || 'Clinic / Hospital')}</div>
                    </div>
                    <div style="text-align: right;">
                        <span style="font-size: 0.75rem; font-weight: 700; color: var(--accent-cyan);">📅 Visited: ${visit.visitDate || 'Undated'}</span>
                        ${visit.cost ? `<div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(visit.cost)}</div>` : ''}
                    </div>
                </div>

                <div class="medical-badges">
                    <span class="medical-badge badge-member">👤 ${escapeHtml(visit.familyMember || 'Family')}</span>
                    <span class="medical-badge badge-speciality">⚕️ ${escapeHtml(visit.speciality || 'General')}</span>
                    ${visit.prescriptionDocId ? `<span class="medical-badge badge-rx" onclick="HeritageApp.viewDoc('${visit.prescriptionDocId}')">💊 View Attached Prescription</span>` : ''}
                </div>

                <div style="font-size: 0.85rem; color: var(--text-secondary); margin: 0.5rem 0; line-height: 1.45;">
                    ${escapeHtml(visit.symptomsDiagnosis || 'Routine checkup / consultation.')}
                </div>

                ${visit.nextVisitDate ? `
                    <div style="background: var(--bg-tertiary); padding: 0.5rem 0.75rem; border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-size: 0.8rem; margin-top: 0.5rem; display: flex; align-items: center; justify-content: space-between;">
                        <div>
                            <span style="font-weight: 700; color: ${isOverdue ? 'var(--accent-rose)' : 'var(--accent-blue)'};">
                                ${isOverdue ? '⚠️ Overdue Checkup:' : '⏳ Next Scheduled Visit:'}
                            </span>
                            <span>${visit.nextVisitDate} (${escapeHtml(visit.nextVisitReason || 'Follow-up')})</span>
                        </div>
                    </div>
                ` : ''}

                <div style="display: flex; justify-content: flex-end; gap: 0.4rem; margin-top: 0.6rem;">
                    <button class="btn btn-secondary btn-sm" onclick="HeritageApp.deleteMedicalVisit('${visit.id}')">🗑️ Delete</button>
                </div>
            `;

            container.appendChild(card);
        });

        // Dynamic Autocomplete Datalists for Medical Inputs (using existing allVisits)
        const docList = document.getElementById('medDoctorSuggestions');
        const hospList = document.getElementById('medHospitalSuggestions');
        if (docList) {
            const doctors = [...new Set(allVisits.map(v => v.doctorName).filter(Boolean))];
            docList.innerHTML = doctors.map(d => `<option value="${escapeHtml(d)}">`).join('');
        }
        if (hospList) {
            const hospitals = [...new Set(allVisits.map(v => v.hospital).filter(Boolean))];
            hospList.innerHTML = hospitals.map(h => `<option value="${escapeHtml(h)}">`).join('');
        }
    }

    // Medical Filter Chips
    document.querySelectorAll('.med-filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.med-filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderMedicalHub(e.target.dataset.member);
        });
    });

    // Add Medical Record Modal
    document.getElementById('btnOpenAddMedical').addEventListener('click', () => {
        document.getElementById('medDoctorName').value = '';
        document.getElementById('medHospital').value = '';
        document.getElementById('medVisitDate').value = new Date().toISOString().split('T')[0];
        document.getElementById('medDiagnosis').value = '';
        document.getElementById('medPrescriptionFileInput').value = '';
        document.getElementById('medNextVisitDate').value = '';
        document.getElementById('medNextReason').value = '';
        document.getElementById('medCost').value = '';
        openModal('modalAddMedical');
    });

    document.getElementById('btnSaveMedicalVisit').addEventListener('click', async () => {
        const familyMember = document.getElementById('medFamilyMemberSelect').value;
        const speciality = document.getElementById('medSpecialitySelect').value;
        const doctorName = document.getElementById('medDoctorName').value.trim();
        const clinicHospital = document.getElementById('medHospital').value.trim();
        const visitDate = document.getElementById('medVisitDate').value;
        const symptomsDiagnosis = document.getElementById('medDiagnosis').value.trim();
        const nextVisitDate = document.getElementById('medNextVisitDate').value;
        const nextVisitReason = document.getElementById('medNextReason').value.trim();
        const cost = document.getElementById('medCost').value.trim();
        const rxInput = document.getElementById('medPrescriptionFileInput');

        if (!doctorName) {
            alert('Please enter doctor name.');
            return;
        }

        let prescriptionDocId = null;

        // If prescription file attached, save into documents store
        if (rxInput.files && rxInput.files.length > 0) {
            const rxFile = rxInput.files[0];
            const buffer = await rxFile.arrayBuffer();
            const docId = 'doc_rx_' + Date.now();

            const rxDoc = {
                id: docId,
                folderId: 'pediatric_health',
                title: `Prescription: ${doctorName} (${familyMember})`,
                familyMember: familyMember,
                fileType: rxFile.type || 'application/pdf',
                fileName: rxFile.name,
                fileSize: rxFile.size,
                expiryDate: null,
                notes: `Prescription issued by ${doctorName} at ${clinicHospital} on ${visitDate}`,
                isEncrypted: false,
                iv: null,
                fileBlob: buffer,
                createdAt: Date.now()
            };

            await HeritageStorage.saveDocument(rxDoc);
            prescriptionDocId = docId;
        }

        const visitRecord = {
            id: 'med_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            familyMember,
            speciality,
            doctorName,
            clinicHospital,
            visitDate,
            symptomsDiagnosis,
            prescriptionDocId,
            nextVisitDate: nextVisitDate || null,
            nextVisitReason: nextVisitReason || null,
            cost,
            status: nextVisitDate ? 'scheduled' : 'completed',
            createdAt: Date.now()
        };

        try {
            await HeritageStorage.saveMedicalVisit(visitRecord);
            closeModal('modalAddMedical');
            await renderMedicalHub(AppState.activeMedMemberFilter);
            await renderCalendar();
            await updateStorageMetrics();
        } catch (err) {
            alert('Failed to save medical visit: ' + err.message);
        }
    });

    /* =============================================================
       UNIFIED CROSS-APP GLOBAL SEARCH (AADHAAR, GRANDPARENTS, ETC.)
       ============================================================= */

    const globalSearchInput = document.getElementById('globalSearchInput');
    const btnClearSearch = document.getElementById('btnClearSearch');

    if (globalSearchInput) {
        globalSearchInput.addEventListener('input', async (e) => {
            const query = e.target.value.trim();
            if (btnClearSearch) btnClearSearch.style.display = query ? 'inline' : 'none';

            if (!query) {
                closeSearchModal();
                return;
            }

            await performGlobalSearch(query);
        });
    }

    if (btnClearSearch) {
        btnClearSearch.addEventListener('click', () => {
            globalSearchInput.value = '';
            btnClearSearch.style.display = 'none';
            closeSearchModal();
        });
    }

    window.closeSearchModal = function () {
        const modal = document.getElementById('modalSearchResults');
        if (modal) modal.classList.remove('active');
    };

    // Filter pills in search modal
    document.querySelectorAll('.search-pill').forEach(pill => {
        pill.addEventListener('click', async (e) => {
            document.querySelectorAll('.search-pill').forEach(p => p.classList.remove('active'));
            e.target.classList.add('active');
            AppState.searchTypeFilter = e.target.dataset.type;
            const q = globalSearchInput.value.trim();
            if (q) await performGlobalSearch(q);
        });
    });

    async function performGlobalSearch(query) {
        document.getElementById('searchQueryLabel').textContent = `"${query}"`;
        const results = await HeritageStorage.searchVault(query, AppState.searchPersonFilter, AppState.searchTypeFilter);
        const container = document.getElementById('searchResultsContainer');
        container.innerHTML = '';

        if (results.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 2rem 0;">
                    No records found matching "${escapeHtml(query)}".
                </div>
            `;
        } else {
            results.forEach(res => {
                const item = document.createElement('div');
                item.className = 'search-result-item';
                item.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <span style="font-size: 1.5rem;">${res.icon || '📄'}</span>
                        <div>
                            <div style="font-weight: 700; color: var(--text-primary);">${escapeHtml(res.title)}</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(res.subtitle)}</div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <span style="font-size: 0.72rem; color: var(--accent-cyan);">${escapeHtml(res.date || '')}</span>
                        <div style="margin-top: 4px;">
                            <span class="btn btn-primary btn-sm" style="font-size: 0.7rem; padding: 2px 8px;">Open</span>
                        </div>
                    </div>
                `;

                item.addEventListener('click', () => {
                    closeSearchModal();
                    if (res.type === 'document') {
                        viewDocument(res.id);
                    } else if (res.type === 'medical') {
                        switchTab('tab-medical');
                        renderMedicalHub('all');
                    } else if (res.type === 'event') {
                        switchTab('tab-dashboard');
                    } else if (res.type === 'growth') {
                        switchTab('tab-growth');
                    }
                });

                container.appendChild(item);
            });
        }

        document.getElementById('modalSearchResults').classList.add('active');
    }

    function switchTab(tabId) {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));

        const targetTab = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
        if (targetTab) targetTab.classList.add('active');
        const view = document.getElementById(tabId);
        if (view) view.classList.add('active');
        AppState.activeTab = tabId;
    }

    /* =============================================================
       CHILDREN'S ANNUAL GROWTH TIMELAPSE & SLIDER
       ============================================================= */

    async function renderGrowthTimelapse() {
        const records = await HeritageStorage.getAllGrowthRecords();
        const gallery = document.getElementById('growthGalleryContainer');
        const selLeft = document.getElementById('compareLeftAge');
        const selRight = document.getElementById('compareRightAge');

        gallery.innerHTML = '';
        selLeft.innerHTML = '';
        selRight.innerHTML = '';

        if (records.length === 0) {
            gallery.innerHTML = `
                <div class="empty-state-card" style="grid-column: 1 / -1;">
                    <div class="empty-state-icon">📸</div>
                    <div class="empty-state-title">No Birthday Portraits Yet</div>
                    <div class="empty-state-text">
                        Preserve your children's annual birthday portraits, track milestone heights and weights, and compare any two ages side-by-side with the interactive slider!
                    </div>
                    <button class="btn btn-primary" onclick="document.getElementById('btnOpenAddGrowth').click();">
                        ➕ Add First Birthday Portrait
                    </button>
                </div>
            `;
            return;
        }

        records.forEach((rec, idx) => {
            // Populate comparison dropdowns
            const optL = document.createElement('option');
            optL.value = rec.id;
            optL.textContent = `Age ${rec.age} (${rec.childName})`;
            if (idx === 0) optL.selected = true;
            selLeft.appendChild(optL);

            const optR = document.createElement('option');
            optR.value = rec.id;
            optR.textContent = `Age ${rec.age} (${rec.childName})`;
            if (idx === records.length - 1) optR.selected = true;
            selRight.appendChild(optR);

            // Render Card
            const card = document.createElement('div');
            card.className = 'growth-card';

            const photoUrl = rec.photoDataUrl || (rec.photoBlob ? URL.createObjectURL(new Blob([rec.photoBlob], { type: rec.photoMime })) : '');

            card.innerHTML = `
                <div class="growth-img-wrapper">
                    ${photoUrl ? `<img src="${photoUrl}" class="growth-img" alt="Age ${rec.age}">` : '<span>📸 No Photo</span>'}
                    <span class="growth-age-badge">Age ${rec.age}</span>
                </div>
                <div class="growth-card-body">
                    <div class="growth-milestone-title">${escapeHtml(rec.childName)} • Age ${rec.age}</div>
                    <div style="font-size: 0.72rem; color: var(--accent-cyan); margin-bottom: 0.35rem;">📅 ${rec.date || 'Birthday'}</div>
                    <div class="growth-milestone-notes">${escapeHtml(rec.milestoneNotes || 'No notes.')}</div>
                    <div style="display: flex; justify-content: flex-end; margin-top: 0.6rem;">
                        <button class="btn btn-secondary btn-sm" onclick="HeritageApp.deleteGrowth('${rec.id}')">🗑️ Delete</button>
                    </div>
                </div>
            `;
            gallery.appendChild(card);
        });

        updateComparisonViews();
    }

    function updateComparisonViews() {
        const selLeft = document.getElementById('compareLeftAge');
        const selRight = document.getElementById('compareRightAge');

        const leftId = selLeft.value;
        const rightId = selRight.value;

        HeritageStorage.getGrowthRecord(leftId).then(recLeft => {
            if (recLeft) {
                const url = recLeft.photoDataUrl || (recLeft.photoBlob ? URL.createObjectURL(new Blob([recLeft.photoBlob], { type: recLeft.photoMime })) : '');
                document.getElementById('compareLayerLeft').style.backgroundImage = `url('${url}')`;
            }
        });

        HeritageStorage.getGrowthRecord(rightId).then(recRight => {
            if (recRight) {
                const url = recRight.photoDataUrl || (recRight.photoBlob ? URL.createObjectURL(new Blob([recRight.photoBlob], { type: recRight.photoMime })) : '');
                document.getElementById('compareLayerRight').style.backgroundImage = `url('${url}')`;
            }
        });
    }

    document.getElementById('compareLeftAge').addEventListener('change', updateComparisonViews);
    document.getElementById('compareRightAge').addEventListener('change', updateComparisonViews);

    document.getElementById('compareSlider').addEventListener('input', (e) => {
        const val = e.target.value;
        document.getElementById('compareLayerLeft').style.width = val + '%';
    });

    // Add Growth Portrait Modal
    document.getElementById('btnOpenAddGrowth').addEventListener('click', () => {
        document.getElementById('growthChildName').value = 'Child';
        document.getElementById('growthAgeInput').value = '1';
        document.getElementById('growthDateInput').value = new Date().toISOString().split('T')[0];
        document.getElementById('growthFileInput').value = '';
        document.getElementById('growthNotesInput').value = '';
        openModal('modalAddGrowth');
    });

    document.getElementById('btnSaveGrowth').addEventListener('click', async () => {
        const childName = document.getElementById('growthChildName').value.trim() || 'Child';
        const age = Number(document.getElementById('growthAgeInput').value) || 0;
        const date = document.getElementById('growthDateInput').value;
        const notes = document.getElementById('growthNotesInput').value.trim();
        const fileInput = document.getElementById('growthFileInput');

        if (!fileInput.files || fileInput.files.length === 0) {
            alert('Please select a birthday portrait photo.');
            return;
        }

        const file = fileInput.files[0];
        const reader = new FileReader();

        reader.onload = async function (e) {
            const dataUrl = e.target.result;

            const rec = {
                id: 'growth_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                childName,
                age,
                date,
                milestoneNotes: notes,
                photoDataUrl: dataUrl,
                photoMime: file.type || 'image/jpeg',
                createdAt: Date.now()
            };

            try {
                await HeritageStorage.saveGrowthRecord(rec);
                closeModal('modalAddGrowth');
                await renderGrowthTimelapse();
                await updateStorageMetrics();
            } catch (err) {
                alert('Failed to save growth portrait: ' + err.message);
            }
        };

        reader.readAsDataURL(file);
    });

    /* =============================================================
       HOUSE LOGS SAFE DEPOSIT LOCKER (DISASTER RECOVERY)
       ============================================================= */

    async function renderHouseLogsCatalog() {
        const backups = await HeritageStorage.getAllHouseLogsBackups();
        const tbody = document.getElementById('hlBackupsTableBody');
        document.getElementById('hlBackupsCount').textContent = `${backups.length} Backup${backups.length === 1 ? '' : 's'}`;

        tbody.innerHTML = '';
        if (backups.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
                        No House Logs backups deposited yet. Keep a safe offline copy here for disaster recovery!
                    </td>
                </tr>
            `;
            return;
        }

        backups.forEach(b => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div style="font-weight: 700; color: var(--text-primary);">${escapeHtml(b.fileName)}</div>
                    <div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(b.notes || 'Offline Archive')}</div>
                </td>
                <td style="color: var(--text-secondary);">${new Date(b.importedAt).toLocaleDateString()}</td>
                <td>
                    <span style="font-weight: 600; color: var(--accent-emerald);">${b.recordCount} items</span>
                    <div style="font-size: 0.72rem; color: var(--text-muted);">${HeritageStorage.formatBytes(b.fileSize)}</div>
                </td>
                <td style="text-align: right;">
                    <button class="btn btn-primary btn-sm" onclick="HeritageApp.extractHLBackup('${b.id}')">💾 Extract</button>
                    <button class="btn btn-danger btn-sm" onclick="HeritageApp.deleteHLBackup('${b.id}')">🗑️</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Dropzone & File Input Handler
    const hlDropzone = document.getElementById('hlDropzone');
    const hlFileInput = document.getElementById('hlFileInput');

    hlDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        hlDropzone.style.borderColor = 'var(--accent-blue)';
    });

    hlDropzone.addEventListener('dragleave', () => {
        hlDropzone.style.borderColor = 'var(--border-highlight)';
    });

    hlDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        hlDropzone.style.borderColor = 'var(--border-highlight)';
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleHouseLogsBackupUpload(e.dataTransfer.files[0]);
        }
    });

    hlFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleHouseLogsBackupUpload(e.target.files[0]);
        }
    });

    async function handleHouseLogsBackupUpload(file) {
        const reader = new FileReader();
        reader.onload = async function (e) {
            try {
                const arrayBuffer = e.target.result;
                let recordCount = 0;
                let notes = 'House Logs Offline Disaster Recovery Archive';

                // Try parsing JSON to extract count of transactions/receipts
                try {
                    const text = new TextDecoder().decode(arrayBuffer);
                    const json = JSON.parse(text);
                    if (Array.isArray(json)) {
                        recordCount = json.length;
                    } else if (json.transactions && Array.isArray(json.transactions)) {
                        recordCount = json.transactions.length;
                    } else if (json.receipts && Array.isArray(json.receipts)) {
                        recordCount = json.receipts.length;
                    }
                } catch (ignored) {
                    recordCount = 1; // binary or raw format
                }

                const backupRecord = {
                    id: 'hl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    fileName: file.name,
                    fileSize: file.size,
                    recordCount: recordCount,
                    notes: notes,
                    fileBlob: arrayBuffer,
                    importedAt: Date.now()
                };

                await HeritageStorage.saveHouseLogsBackup(backupRecord);
                await renderHouseLogsCatalog();
                await updateStorageMetrics();
                alert(`Successfully deposited "${file.name}" into Safe Locker.`);
            } catch (err) {
                alert('Failed to store backup: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    async function extractHouseLogsBackup(id) {
        const backup = await HeritageStorage.getAllHouseLogsBackups();
        const item = backup.find(b => b.id === id);
        if (!item) return;

        const blob = new Blob([item.fileBlob], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = item.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /* =============================================================
       SETTINGS & PC-STYLE USER MANAGEMENT (ADMIN ONLY)
       ============================================================= */

    async function renderUsersTable() {
        const profiles = await HeritageStorage.getAllProfiles();
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '';

        profiles.forEach(p => {
            const tr = document.createElement('tr');
            const isMasterAdmin = p.role === 'admin';

            let permSummary = 'Full Root Access';
            if (p.role === 'co-admin') permSummary = 'Equal Rights (Co-Admin)';
            else if (p.role === 'standard') permSummary = 'Add Milestones & Photos';
            else if (p.role === 'viewer') permSummary = 'Read-Only Family Memories';

            tr.innerHTML = `
                <td>
                    <div style="font-weight: 700; color: var(--text-primary);">${escapeHtml(p.displayName || p.userId)}</div>
                    <div style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono);">${escapeHtml(p.userId)}</div>
                </td>
                <td>
                    <span class="role-pill role-${p.role}">${getRoleDisplay(p.role)}</span>
                </td>
                <td style="color: var(--text-secondary);">${permSummary}</td>
                <td style="text-align: right;">
                    <button class="btn btn-secondary btn-sm" onclick="HeritageApp.resetUserPinPrompt('${p.userId}')">🔑 Reset PIN</button>
                    ${!isMasterAdmin ? `<button class="btn btn-danger btn-sm" onclick="HeritageApp.deleteUserProfile('${p.userId}')">🗑️</button>` : ''}
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Add User Modal
    document.getElementById('btnOpenAddUser').addEventListener('click', () => {
        document.getElementById('newUserId').value = '';
        document.getElementById('newUserDisplayName').value = '';
        document.getElementById('newUserRoleSelect').value = 'standard';
        document.getElementById('newUserPin').value = '';
        document.getElementById('granularPermissionsContainer').style.display = 'block';
        openModal('modalAddUser');
    });

    document.getElementById('newUserRoleSelect').addEventListener('change', (e) => {
        const role = e.target.value;
        const permContainer = document.getElementById('granularPermissionsContainer');
        permContainer.style.display = role === 'standard' ? 'block' : 'none';
    });

    document.getElementById('btnSaveUser').addEventListener('click', async () => {
        const userId = document.getElementById('newUserId').value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
        const displayName = document.getElementById('newUserDisplayName').value.trim();
        const role = document.getElementById('newUserRoleSelect').value;
        const pin = document.getElementById('newUserPin').value;

        if (!userId) {
            alert('Please enter a valid User ID (letters, numbers, underscores).');
            return;
        }
        if (pin.length < 4) {
            alert('User PIN must be at least 4 characters.');
            return;
        }

        const existing = await HeritageStorage.getProfile(userId);
        if (existing) {
            alert('A user with this ID already exists.');
            return;
        }

        try {
            const salt = HeritageCrypto.generateSalt(16);
            const pinHash = await HeritageCrypto.hashPassphrase(pin, salt);

            let permissions = {
                canAddEvents: true,
                canAddGrowth: true,
                canViewConfidential: false,
                canAccessHouseLogs: false,
                canManageUsers: false,
                canExport: false
            };

            if (role === 'co-admin') {
                permissions = {
                    canAddEvents: true,
                    canAddGrowth: true,
                    canViewConfidential: true,
                    canAccessHouseLogs: true,
                    canManageUsers: true,
                    canExport: true
                };
            } else if (role === 'standard') {
                permissions.canAddEvents = document.getElementById('permCanAddEvents').checked;
                permissions.canAddGrowth = document.getElementById('permCanAddGrowth').checked;
                permissions.canViewConfidential = document.getElementById('permCanViewConfidential').checked;
                permissions.canAccessHouseLogs = document.getElementById('permCanAccessHouseLogs').checked;
            } else if (role === 'viewer') {
                permissions.canAddEvents = false;
                permissions.canAddGrowth = false;
            }

            const newProfile = {
                userId,
                displayName: displayName || userId,
                role,
                salt,
                pinHash,
                permissions,
                createdAt: Date.now()
            };

            await HeritageStorage.saveProfile(newProfile);
            closeModal('modalAddUser');
            await renderUsersTable();
            alert(`User profile "${displayName || userId}" created with role "${getRoleDisplay(role)}".`);
        } catch (err) {
            alert('Failed to create user: ' + err.message);
        }
    });

    // Reset User PIN by Admin
    async function resetUserPinPrompt(userId) {
        const newPin = prompt(`Enter new PIN for user "${userId}" (min 4 characters):`);
        if (!newPin || newPin.length < 4) {
            alert('Invalid PIN.');
            return;
        }

        try {
            const profile = await HeritageStorage.getProfile(userId);
            if (!profile) return;

            const salt = HeritageCrypto.generateSalt(16);
            profile.salt = salt;
            profile.pinHash = await HeritageCrypto.hashPassphrase(newPin, salt);

            await HeritageStorage.saveProfile(profile);
            alert(`PIN successfully reset for user "${userId}".`);
        } catch (err) {
            alert('Failed to reset PIN: ' + err.message);
        }
    }

    // Change Current Logged In User's PIN (via Custom Modal — Android WebView safe)
    document.getElementById('btnOpenChangePin').addEventListener('click', () => {
        if (!AppState.currentUser) return;
        document.getElementById('changePinCurrent').value = '';
        document.getElementById('changePinNew').value = '';
        document.getElementById('changePinConfirm').value = '';
        document.getElementById('changePinError').style.display = 'none';
        openModal('modalChangePin');
    });

    document.getElementById('btnChangePinConfirm').addEventListener('click', async () => {
        if (!AppState.currentUser) return;
        const currentPin = document.getElementById('changePinCurrent').value;
        const newPin = document.getElementById('changePinNew').value;
        const confirmPin = document.getElementById('changePinConfirm').value;
        const errEl = document.getElementById('changePinError');

        if (!currentPin) { errEl.textContent = 'Please enter your current PIN.'; errEl.style.display = 'block'; return; }
        if (newPin.length < 4) { errEl.textContent = 'New PIN must be at least 4 characters.'; errEl.style.display = 'block'; return; }
        if (newPin !== confirmPin) { errEl.textContent = 'New PINs do not match.'; errEl.style.display = 'block'; return; }

        showCryptoSpinner('Verifying current PIN…');
        const computed = await HeritageCrypto.hashPassphrase(currentPin, AppState.currentUser.salt);
        hideCryptoSpinner();
        if (computed !== AppState.currentUser.pinHash) {
            errEl.textContent = 'Current PIN is incorrect.';
            errEl.style.display = 'block';
            return;
        }

        showCryptoSpinner('Updating PIN with PBKDF2…');
        const salt = HeritageCrypto.generateSalt(16);
        AppState.currentUser.salt = salt;
        AppState.currentUser.pinHash = await HeritageCrypto.hashPassphrase(newPin, salt);
        await HeritageStorage.saveProfile(AppState.currentUser);
        hideCryptoSpinner();
        closeModal('modalChangePin');
        showToast('✅ PIN updated successfully!', 'success');
    });



    /* =============================================================
       MASTER ENCRYPTED BACKUP (.VAULT) & RESTORE
       ============================================================= */

    // --- EXPORT: Open passphrase modal instead of prompt() ---
    document.getElementById('btnExportVault').addEventListener('click', () => {
        document.getElementById('exportPassphraseInput').value = '';
        document.getElementById('exportPassphraseConfirm').value = '';
        document.getElementById('exportPassphraseError').style.display = 'none';
        openModal('modalExportPassphrase');
    });

    async function doExportVault(passphrase) {
        try {
            showCryptoSpinner('Gathering vault data…');
            const allProfiles = await HeritageStorage.getAllProfiles();
            const allFolders = await HeritageStorage.getAllFolders();
            const allDocs = await HeritageStorage.getAllDocuments();
            const allEvents = await HeritageStorage.getAllEvents();
            const allGrowth = await HeritageStorage.getAllGrowthRecords();
            const allHL = await HeritageStorage.getAllHouseLogsBackups();
            const allMedical = await HeritageStorage.getAllMedicalVisits();

            // Convert binary buffers to hex strings for portable JSON snapshot
            const processedDocs = allDocs.map(d => ({
                ...d,
                fileBlobHex: d.fileBlob ? bufToHex(d.fileBlob) : ''
            }));
            processedDocs.forEach(d => delete d.fileBlob);

            const processedHL = allHL.map(h => ({
                ...h,
                fileBlobHex: h.fileBlob ? bufToHex(h.fileBlob) : ''
            }));
            processedHL.forEach(h => delete h.fileBlob);

            const snapshot = {
                vaultVersion: '1.0',
                vaultClusterId: AppState.vaultClusterId,
                exportedAt: Date.now(),
                profiles: allProfiles,
                folders: allFolders,
                documents: processedDocs,
                events: allEvents,
                growth: allGrowth,
                houseLogsBackups: processedHL,
                medicalVisits: allMedical
            };

            const jsonStr = JSON.stringify(snapshot);
            showCryptoSpinner('Encrypting with AES-256-GCM…');
            const salt = HeritageCrypto.generateSalt(16);
            const key = await HeritageCrypto.deriveKey(passphrase, salt);
            const encrypted = await HeritageCrypto.encryptText(jsonStr, key);
            hideCryptoSpinner();

            const exportBundle = {
                signature: 'HERITAGE_VAULT_ENCRYPTED_ARCHIVE',
                version: '1.0',
                vaultClusterId: AppState.vaultClusterId,
                salt: salt,
                payload: encrypted
            };

            const blob = new Blob([JSON.stringify(exportBundle, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const todayStr = new Date().toISOString().split('T')[0];
            a.href = url;
            a.download = `my-vault-master-${todayStr}.vault`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            // Update last backup timestamp
            await HeritageStorage.setSetting('lastBackupAt', Date.now());
            closeModal('modalExportPassphrase');
            showToast('✅ Encrypted backup exported successfully!', 'success');
        } catch (err) {
            hideCryptoSpinner();
            showToast('Export failed: ' + err.message, 'error');
        }
    }

    document.getElementById('btnExportVaultConfirm').addEventListener('click', async () => {
        const passphrase = document.getElementById('exportPassphraseInput').value;
        const confirmPass = document.getElementById('exportPassphraseConfirm').value;
        const errEl = document.getElementById('exportPassphraseError');
        if (passphrase.length < 6) { errEl.textContent = 'Passphrase must be at least 6 characters.'; errEl.style.display = 'block'; return; }
        if (passphrase !== confirmPass) { errEl.textContent = 'Passphrases do not match.'; errEl.style.display = 'block'; return; }
        errEl.style.display = 'none';
        await doExportVault(passphrase);
    });

    // --- IMPORT: Trigger file picker, then show passphrase modal ---
    document.getElementById('btnImportVault').addEventListener('click', () => {
        document.getElementById('importVaultFileInput').click();
    });

    document.getElementById('importVaultFileInput').addEventListener('change', async (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        AppState._pendingImportFile = e.target.files[0];
        e.target.value = ''; // reset so same file can be selected again
        document.getElementById('importPassphraseInput').value = '';
        document.getElementById('importPassphraseError').style.display = 'none';
        openModal('modalImportPassphrase');
    });

    document.getElementById('btnImportVaultConfirm').addEventListener('click', async () => {
        const passphrase = document.getElementById('importPassphraseInput').value;
        const errEl = document.getElementById('importPassphraseError');
        if (!passphrase) { errEl.textContent = 'Please enter the backup passphrase.'; errEl.style.display = 'block'; return; }
        if (!AppState._pendingImportFile) { errEl.textContent = 'No backup file selected.'; errEl.style.display = 'block'; return; }
        errEl.style.display = 'none';
        closeModal('modalImportPassphrase');

        const reader = new FileReader();
        reader.onload = async function (ev) {
            try {
                showCryptoSpinner('Validating archive…');
                let bundle;
                try { bundle = JSON.parse(ev.target.result); } catch(e) { throw new Error('File is not valid JSON — may be corrupted.'); }
                if (bundle.signature !== 'MY_VAULT_ENCRYPTED_ARCHIVE' && bundle.signature !== 'HERITAGE_VAULT_ENCRYPTED_ARCHIVE') {
                    throw new Error('Not a valid My Vault encrypted archive.');
                }
                if (!bundle.salt || !bundle.payload || !bundle.payload.iv || !bundle.payload.cipher) {
                    throw new Error('Archive structure is invalid or corrupted.');
                }

                // STRICT ANTI-TAMPER CHECK: Verify Vault Cluster ID
                if (bundle.vaultClusterId && AppState.vaultClusterId && bundle.vaultClusterId !== AppState.vaultClusterId) {
                    hideCryptoSpinner();
                    showToast(`🚨 BLOCKED: Mismatched Vault ID. Backup belongs to ${bundle.vaultClusterId}, this vault is ${AppState.vaultClusterId}.`, 'error');
                    return;
                }

                showCryptoSpinner('Decrypting with AES-256-GCM…');
                const key = await HeritageCrypto.deriveKey(passphrase, bundle.salt);
                const decryptedJson = await HeritageCrypto.decryptText(bundle.payload, key);
                const snapshot = JSON.parse(decryptedJson);

                // Schema validation — protect against malformed bundles
                if (!Array.isArray(snapshot.profiles) || !Array.isArray(snapshot.folders) ||
                    !Array.isArray(snapshot.documents) || !Array.isArray(snapshot.events)) {
                    throw new Error('Restored data failed schema validation. Archive may be tampered or corrupted.');
                }

                hideCryptoSpinner();

                // Use a custom modal-style confirmation (simple inline banner)
                const confirmed = window.confirm(
                    `Archive verified!\nFound: ${snapshot.documents.length} documents, ${snapshot.events.length} events, ${(snapshot.medicalVisits || []).length} medical records.\n\nThis will overwrite all current data. Proceed?`
                );
                if (!confirmed) return;

                showCryptoSpinner('Restoring vault data…');
                await HeritageStorage.resetDatabase();

                for (const p of snapshot.profiles) await HeritageStorage.saveProfile(p);
                for (const f of snapshot.folders) await HeritageStorage.saveFolder(f);
                for (const d of snapshot.documents) {
                    if (d.fileBlobHex) d.fileBlob = hexToBuf(d.fileBlobHex);
                    delete d.fileBlobHex;
                    await HeritageStorage.saveDocument(d);
                }
                for (const ev of snapshot.events) await HeritageStorage.saveEvent(ev);
                for (const g of snapshot.growth) await HeritageStorage.saveGrowthRecord(g);
                for (const h of (snapshot.houseLogsBackups || [])) {
                    if (h.fileBlobHex) h.fileBlob = hexToBuf(h.fileBlobHex);
                    delete h.fileBlobHex;
                    await HeritageStorage.saveHouseLogsBackup(h);
                }
                if (Array.isArray(snapshot.medicalVisits)) {
                    for (const m of snapshot.medicalVisits) await HeritageStorage.saveMedicalVisit(m);
                }
                if (snapshot.vaultClusterId) {
                    await HeritageStorage.setSetting('vaultClusterId', snapshot.vaultClusterId);
                }

                hideCryptoSpinner();
                showToast('✅ Vault restored! Reloading…', 'success');
                setTimeout(() => window.location.reload(), 1500);
            } catch (err) {
                hideCryptoSpinner();
                showToast('Restore failed: ' + (err.message || 'Incorrect passphrase or corrupted file'), 'error');
            }
        };
        reader.readAsText(AppState._pendingImportFile);
        AppState._pendingImportFile = null;
    });


    // Copy Vault Cluster ID button
    const btnCopyCluster = document.getElementById('btnCopyClusterId');
    if (btnCopyCluster) {
        btnCopyCluster.addEventListener('click', () => {
            if (AppState.vaultClusterId) {
                navigator.clipboard.writeText(AppState.vaultClusterId).then(() => {
                    showToast(`📋 Vault ID copied: ${AppState.vaultClusterId}`, 'info');
                }).catch(() => {
                    showToast('Copy failed — select the ID manually.', 'error');
                });
            }
        });
    }

    // Factory Reset — via custom modal (no prompt/confirm — Android WebView safe)
    document.getElementById('btnNuclearReset').addEventListener('click', () => {
        document.getElementById('factoryResetConfirmInput').value = '';
        document.getElementById('factoryResetError').style.display = 'none';
        openModal('modalFactoryReset');
    });

    document.getElementById('btnFactoryResetConfirm').addEventListener('click', async () => {
        const input = document.getElementById('factoryResetConfirmInput').value.trim();
        const errEl = document.getElementById('factoryResetError');
        if (input !== 'WIPE VAULT') {
            errEl.textContent = 'You must type exactly: WIPE VAULT';
            errEl.style.display = 'block';
            return;
        }
        showCryptoSpinner('Wiping all vault data…');
        await HeritageStorage.resetDatabase();
        hideCryptoSpinner();
        showToast('✅ All data erased. Reloading…', 'info');
        setTimeout(() => window.location.reload(), 1500);
    });

    // Admin Reset User PIN — via custom modal
    async function resetUserPinPrompt(userId) {
        AppState._adminResetTargetUserId = userId;
        document.getElementById('adminResetPinLabel').textContent = `Set a new PIN for user: "${userId}"`;
        document.getElementById('adminResetPinNew').value = '';
        document.getElementById('adminResetPinError').style.display = 'none';
        openModal('modalAdminResetPin');
    }

    document.getElementById('btnAdminResetPinConfirm').addEventListener('click', async () => {
        const userId = AppState._adminResetTargetUserId;
        const newPin = document.getElementById('adminResetPinNew').value;
        const errEl = document.getElementById('adminResetPinError');
        if (!userId) return;
        if (!newPin || newPin.length < 4) { errEl.textContent = 'PIN must be at least 4 characters.'; errEl.style.display = 'block'; return; }

        try {
            const profile = await HeritageStorage.getProfile(userId);
            if (!profile) { errEl.textContent = 'User not found.'; errEl.style.display = 'block'; return; }
            showCryptoSpinner('Updating PIN…');
            const salt = HeritageCrypto.generateSalt(16);
            profile.salt = salt;
            profile.pinHash = await HeritageCrypto.hashPassphrase(newPin, salt);
            await HeritageStorage.saveProfile(profile);
            hideCryptoSpinner();
            AppState._adminResetTargetUserId = null;
            closeModal('modalAdminResetPin');
            showToast(`✅ PIN reset for "${userId}"`, 'success');
        } catch (err) {
            hideCryptoSpinner();
            errEl.textContent = 'Failed to reset PIN: ' + err.message;
            errEl.style.display = 'block';
        }
    });



    /* =============================================================
       HELPERS & MODAL MANAGEMENT
       ============================================================= */

    function setupGlobalEventListeners() {
        // Tab Navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));

                const targetTab = e.currentTarget;
                targetTab.classList.add('active');
                const targetViewId = targetTab.dataset.tab;
                document.getElementById(targetViewId).classList.add('active');
                AppState.activeTab = targetViewId;
                resetAutoLockActivity();
            });
        });

        // Theme Initialization & Toggle (Default: House Logs Red & White Theme)
        const savedTheme = localStorage.getItem('heritage_vault_theme') || 'light';
        document.body.setAttribute('data-theme', savedTheme);
        const themeBtn = document.getElementById('btnThemeToggle');
        if (themeBtn) {
            themeBtn.title = savedTheme === 'light' ? 'Switch to Dark / OLED Mode' : 'Switch to House Logs Red & White Light Mode';
        }

        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                const body = document.body;
                const current = body.getAttribute('data-theme') || 'light';
                const next = current === 'light' ? 'dark' : 'light';
                body.setAttribute('data-theme', next);
                localStorage.setItem('heritage_vault_theme', next);
                themeBtn.title = next === 'light' ? 'Switch to Dark / OLED Mode' : 'Switch to House Logs Red & White Light Mode';
            });
        }

        // User activity listeners for auto-lock
        ['mousedown', 'keydown', 'touchstart'].forEach(evt => {
            window.addEventListener(evt, resetAutoLockActivity, { passive: true });
        });

        // PWA Standalone Install Prompt Handler
        let deferredInstallPrompt = null;
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        const installBtn = document.getElementById('btnInstallPwa');

        if (installBtn && !isStandalone) {
            installBtn.style.display = 'inline-flex';
            installBtn.onclick = async () => {
                if (deferredInstallPrompt) {
                    deferredInstallPrompt.prompt();
                    const choice = await deferredInstallPrompt.userChoice;
                    if (choice && choice.outcome === 'accepted') {
                        showToast('🎉 My Vault installed successfully!', 'success');
                    }
                    deferredInstallPrompt = null;
                    installBtn.style.display = 'none';
                } else {
                    showToast('💡 To install: Tap browser menu (⋮) & select "Add to Home screen" or "Install app"', 'info');
                }
            };
        }

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredInstallPrompt = e;
            if (installBtn && !isStandalone) {
                installBtn.style.display = 'inline-flex';
            }
        });

        window.addEventListener('appinstalled', () => {
            deferredInstallPrompt = null;
            if (installBtn) installBtn.style.display = 'none';
            showToast('🎉 Standalone My Vault installed on device!', 'success');
        });

        // PWA Shortcuts & Deep-link listener
        window.addEventListener('hashchange', handlePwaShortcuts);

        // Smart Auto-Folder Suggestions & "Already Present in Vault" live detector
        initDocumentTitleSmartAutoSuggestions();

        // Live Search Typeahead Suggestions
        initGlobalSearchTypeahead();
    }

    /* -------------------------------------------------------------
       SMART AUTO-FOLDER SELECTION & "ALREADY IN VAULT" SUGGESTIONS
       ------------------------------------------------------------- */
    const FOLDER_KEYWORD_RULES = [
        {
            keywords: ['rent', 'lease', 'deed', 'property', 'house', 'flat', 'land', 'apartment', 'registry', 'patta', 'khata', 'sale deed', 'mortgage', 'agreement', 'tenant', 'landlord', 'electricity bill', 'water bill', 'property tax', 'encumbrance'],
            category: 'property',
            hint: 'Property & Rental Deeds'
        },
        {
            keywords: ['tax', 'itr', 'form 16', 'form 26as', 'salary', 'audit', 'tds', 'pan card', 'financial', 'bank', 'fd', 'mutual fund', 'stocks', 'epf', 'ppf', 'payslip', 'statement', 'investment', 'loan'],
            category: 'financial',
            hint: 'ITR & Tax Filings'
        },
        {
            keywords: ['vaccine', 'immunization', 'pediatric', 'growth', 'dr', 'doctor', 'prescription', 'hospital', 'medical', 'lab', 'blood test', 'mri', 'ct scan', 'xray', 'discharge', 'health', 'clinic', 'dentist', 'eye test', 'ent'],
            category: 'medical',
            hint: 'Pediatric Health & Immunization'
        },
        {
            keywords: ['marksheet', 'degree', 'diploma', 'school', 'college', 'tuition', 'report card', 'transcript', 'bonafide', 'certificate', 'education', 'exam', 'grade', '10th', '12th', 'graduation', 'semester', 'convocation'],
            category: 'education',
            hint: 'Education & Marksheets'
        },
        {
            keywords: ['will', 'secret', 'confidential', 'private', 'password', 'key', 'locker', 'diary', 'personal', 'safe', 'vault key'],
            category: 'personal',
            hint: 'Private Family Vault'
        },
        {
            keywords: ['aadhaar', 'aadhar', 'passport', 'voter', 'driving license', 'dl', 'ration card', 'birth certificate', 'id', 'identity', 'caste', 'marriage certificate', 'pan'],
            category: 'official',
            hint: 'Family Public Shelf'
        }
    ];

    function initDocumentTitleSmartAutoSuggestions() {
        const titleInput = document.getElementById('docTitle');
        const folderSelect = document.getElementById('docFolderSelect');
        const autoBadge = document.getElementById('docFolderAutoBadge');
        const noticeBox = document.getElementById('docFolderSuggestionNotice');
        const noticeText = document.getElementById('docFolderSuggestionText');
        const alreadyBox = document.getElementById('docAlreadyPresentContainer');
        const alreadyList = document.getElementById('docAlreadyPresentList');

        if (!titleInput) return;

        titleInput.addEventListener('input', async (e) => {
            const typed = e.target.value.trim().toLowerCase();

            if (!typed || typed.length < 2) {
                if (autoBadge) autoBadge.style.display = 'none';
                if (noticeBox) noticeBox.style.display = 'none';
                if (alreadyBox) alreadyBox.style.display = 'none';
                return;
            }

            const allFolders = await HeritageStorage.getAllFolders();
            const allDocs = await HeritageStorage.getAllDocuments();

            // 1. Smart Target Folder Auto-Selection
            let matchedFolder = null;
            let matchedKeyword = '';

            // Direct folder name match
            for (const f of allFolders) {
                if (typed.includes(f.name.toLowerCase()) || f.name.toLowerCase().includes(typed)) {
                    matchedFolder = f;
                    matchedKeyword = f.name;
                    break;
                }
            }

            // Keyword dictionary match
            if (!matchedFolder) {
                for (const rule of FOLDER_KEYWORD_RULES) {
                    for (const kw of rule.keywords) {
                        if (typed.includes(kw)) {
                            matchedFolder = allFolders.find(f => 
                                f.category === rule.category || 
                                (f.name && f.name.toLowerCase().includes(rule.hint.toLowerCase()))
                            ) || allFolders[0];
                            matchedKeyword = kw;
                            break;
                        }
                    }
                    if (matchedFolder) break;
                }
            }

            if (matchedFolder && folderSelect) {
                folderSelect.value = matchedFolder.id;
                if (autoBadge) autoBadge.style.display = 'inline-block';
                if (noticeBox && noticeText) {
                    noticeBox.style.display = 'flex';
                    noticeText.innerHTML = `✨ Auto-selected <strong>${escapeHtml(matchedFolder.name)}</strong> (matched "${escapeHtml(matchedKeyword)}")`;
                }
            } else {
                if (autoBadge) autoBadge.style.display = 'none';
                if (noticeBox) noticeBox.style.display = 'none';
            }

            // 2. "Already Present in Vault" live suggestions across all compartments
            const matchingDocs = allDocs.filter(d => 
                d.title && d.title.toLowerCase().includes(typed)
            );

            if (matchingDocs.length > 0 && alreadyBox && alreadyList) {
                alreadyBox.style.display = 'block';
                alreadyList.innerHTML = '';
                matchingDocs.slice(0, 4).forEach(d => {
                    const f = allFolders.find(x => x.id === d.folderId);
                    const folderName = f ? f.name : 'Vault';
                    const row = document.createElement('div');
                    row.className = 'doc-present-item';
                    row.innerHTML = `
                        <span style="font-weight: 700; color: var(--text-main);">📄 ${escapeHtml(d.title)}</span>
                        <span style="font-size: 0.72rem; color: var(--accent); font-weight: 600;">📁 ${escapeHtml(folderName)}</span>
                    `;
                    row.title = 'Click to use this title and switch to its compartment';
                    row.addEventListener('click', () => {
                        titleInput.value = d.title;
                        if (f && folderSelect) {
                            folderSelect.value = f.id;
                            if (autoBadge) autoBadge.style.display = 'inline-block';
                        }
                        showToast(`Switched target folder to "${folderName}" for existing record`, 'info');
                    });
                    alreadyList.appendChild(row);
                });
            } else if (alreadyBox) {
                alreadyBox.style.display = 'none';
            }
        });
    }

    /* -------------------------------------------------------------
       LIVE SEARCH TYPEAHEAD DROPDOWN
       ------------------------------------------------------------- */
    function initGlobalSearchTypeahead() {
        const searchInput = document.getElementById('globalSearchInput');
        const dropdown = document.getElementById('globalSearchTypeahead');
        if (!searchInput || !dropdown) return;

        searchInput.addEventListener('input', async (e) => {
            const query = e.target.value.trim().toLowerCase();
            if (!query || query.length < 2) {
                dropdown.style.display = 'none';
                dropdown.innerHTML = '';
                return;
            }

            const allDocs = await HeritageStorage.getAllDocuments();
            const allFolders = await HeritageStorage.getAllFolders();
            const allMeds = await HeritageStorage.getAllMedicalVisits();

            const suggestions = [];

            // Match folders
            allFolders.forEach(f => {
                if (f.name.toLowerCase().includes(query)) {
                    suggestions.push({
                        icon: f.icon || '📁',
                        label: f.name,
                        badge: 'Folder',
                        action: () => {
                            switchTab('tab-vault');
                            selectFolder(f.id);
                            dropdown.style.display = 'none';
                        }
                    });
                }
            });

            // Match documents
            allDocs.forEach(d => {
                if ((d.title && d.title.toLowerCase().includes(query)) || (d.familyMember && d.familyMember.toLowerCase().includes(query))) {
                    suggestions.push({
                        icon: '📄',
                        label: d.title + (d.familyMember && d.familyMember !== 'All Family' ? ` (${d.familyMember})` : ''),
                        badge: 'Document',
                        action: () => {
                            dropdown.style.display = 'none';
                            viewDocument(d.id);
                        }
                    });
                }
            });

            // Match medical visits
            allMeds.forEach(m => {
                if ((m.doctorName && m.doctorName.toLowerCase().includes(query)) || 
                    (m.diagnosis && m.diagnosis.toLowerCase().includes(query)) ||
                    (m.speciality && m.speciality.toLowerCase().includes(query))) {
                    suggestions.push({
                        icon: '🩺',
                        label: `${m.familyMember || 'Member'}: ${m.doctorName || m.speciality || 'Visit'}`,
                        badge: 'Medical',
                        action: () => {
                            switchTab('tab-medical');
                            dropdown.style.display = 'none';
                        }
                    });
                }
            });

            if (suggestions.length === 0) {
                dropdown.style.display = 'none';
                return;
            }

            dropdown.innerHTML = '';
            suggestions.slice(0, 6).forEach(item => {
                const div = document.createElement('div');
                div.className = 'typeahead-item';
                div.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span>${item.icon}</span>
                        <span class="typeahead-label">${escapeHtml(item.label)}</span>
                    </div>
                    <span class="typeahead-badge">${item.badge}</span>
                `;
                div.addEventListener('click', item.action);
                dropdown.appendChild(div);
            });
            dropdown.style.display = 'block';
        });

        // Hide dropdown on outside click
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }

    function handlePwaShortcuts() {
        const hash = window.location.hash;
        if (!hash) return;
        if (hash === '#shortcut=vault') {
            switchTab('tab-vault');
        } else if (hash === '#shortcut=medical') {
            switchTab('tab-medical');
        } else if (hash === '#shortcut=growth') {
            switchTab('tab-growth');
        } else if (hash === '#shortcut=add-event') {
            switchTab('tab-dashboard');
            openModal('modalAddEvent');
        }
    }

    function openModal(id) {
        const m = document.getElementById(id);
        if (m) m.classList.add('active');
    }

    function closeModal(id) {
        const m = document.getElementById(id);
        if (m) m.classList.remove('active');
    }

    window.closeAllModals = function () {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    };

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function bufToHex(buffer) {
        const byteArray = new Uint8Array(buffer);
        let hexString = '';
        for (let i = 0; i < byteArray.length; i++) {
            hexString += byteArray[i].toString(16).padStart(2, '0');
        }
        return hexString;
    }

    function hexToBuf(hexString) {
        if (!hexString || hexString.length % 2 !== 0) return new ArrayBuffer(0);
        const byteArray = new Uint8Array(hexString.length / 2);
        for (let i = 0; i < hexString.length; i += 2) {
            byteArray[i / 2] = parseInt(hexString.substr(i, 2), 16);
        }
        return byteArray.buffer;
    }

    // Public App Methods for Inline Click Handlers
    window.HeritageApp = {
        deleteEvent: async (id) => {
            if (confirm('Delete this life event record?')) {
                await HeritageStorage.deleteEvent(id);
                await renderEventsStream(AppState.currentFilter);
                await renderCalendar();
                await updateStorageMetrics();
            }
        },
        viewDoc: (id) => viewDocument(id),
        downloadDoc: (id) => downloadDocument(id),
        deleteDoc: async (id) => {
            if (confirm('Delete this document from vault?')) {
                await HeritageStorage.deleteDocument(id);
                await renderDocuments(AppState.activeFolderId);
                await updateStorageMetrics();
            }
        },
        deleteGrowth: async (id) => {
            if (confirm('Delete this annual birthday portrait?')) {
                await HeritageStorage.deleteGrowthRecord(id);
                await renderGrowthTimelapse();
                await updateStorageMetrics();
            }
        },
        extractHLBackup: (id) => extractHouseLogsBackup(id),
        deleteHLBackup: async (id) => {
            if (confirm('Remove this House Logs backup archive from safe deposit locker?')) {
                await HeritageStorage.deleteHouseLogsBackup(id);
                await renderHouseLogsCatalog();
                await updateStorageMetrics();
            }
        },
        deleteMedicalVisit: async (id) => {
            if (confirm('Delete this medical consultation record?')) {
                await HeritageStorage.deleteMedicalVisit(id);
                await renderMedicalHub(AppState.activeMedMemberFilter);
                await renderCalendar();
                await updateStorageMetrics();
            }
        },
        resetUserPinPrompt: (userId) => resetUserPinPrompt(userId),
        deleteUserProfile: async (userId) => {
            if (confirm(`Delete user profile "${userId}"?`)) {
                await HeritageStorage.deleteProfile(userId);
                await renderUsersTable();
            }
        }
    };

})();
