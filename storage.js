/**
 * Heritage Vault v1.0 — High-Capacity IndexedDB Storage Engine
 * Provides persistent, multi-gigabyte local storage for:
 * - Profiles (Admin & Admin-created secondary users)
 * - Folders (with independent cryptographic security metadata)
 * - Documents (raw/encrypted binary PDFs, scans, heavy records)
 * - Events & Private Diary entries
 * - Children's Annual Growth Timelapse photos
 * - House Logs Safe Deposit offline disaster recovery backups
 * - App Settings & Auto-lock configuration
 */

(function (window) {
    'use strict';

    const DB_NAME = 'HeritageVaultDB';
    const DB_VERSION = 2;

    let dbInstance = null;

    /**
     * Initialize and upgrade IndexedDB
     */
    function openDatabase() {
        return new Promise((resolve, reject) => {
            if (dbInstance) {
                return resolve(dbInstance);
            }

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = function (event) {
                const db = event.target.result;

                // 1. Profiles Store
                if (!db.objectStoreNames.contains('profiles')) {
                    const profilesStore = db.createObjectStore('profiles', { keyPath: 'userId' });
                    profilesStore.createIndex('role', 'role', { unique: false });
                }

                // 2. Folders Store
                if (!db.objectStoreNames.contains('folders')) {
                    const foldersStore = db.createObjectStore('folders', { keyPath: 'id' });
                    foldersStore.createIndex('category', 'category', { unique: false });
                    foldersStore.createIndex('parentId', 'parentId', { unique: false });
                }

                // 3. Documents Store (Binary Blobs & PDFs)
                if (!db.objectStoreNames.contains('documents')) {
                    const docsStore = db.createObjectStore('documents', { keyPath: 'id' });
                    docsStore.createIndex('folderId', 'folderId', { unique: false });
                    docsStore.createIndex('fileType', 'fileType', { unique: false });
                    docsStore.createIndex('expiryDate', 'expiryDate', { unique: false });
                    docsStore.createIndex('createdAt', 'createdAt', { unique: false });
                    docsStore.createIndex('familyMember', 'familyMember', { unique: false });
                }

                // 4. Life Events & Diary Entries Store
                if (!db.objectStoreNames.contains('events')) {
                    const eventsStore = db.createObjectStore('events', { keyPath: 'id' });
                    eventsStore.createIndex('date', 'date', { unique: false });
                    eventsStore.createIndex('category', 'category', { unique: false });
                    eventsStore.createIndex('importance', 'importance', { unique: false });
                    eventsStore.createIndex('familyMember', 'familyMember', { unique: false });
                }

                // 5. Growth Timelapse Store (Birthday / Annual portraits)
                if (!db.objectStoreNames.contains('growth')) {
                    const growthStore = db.createObjectStore('growth', { keyPath: 'id' });
                    growthStore.createIndex('childName', 'childName', { unique: false });
                    growthStore.createIndex('age', 'age', { unique: false });
                }

                // 6. House Logs Safe Deposit Store (Disaster recovery)
                if (!db.objectStoreNames.contains('house_logs_backups')) {
                    const hlStore = db.createObjectStore('house_logs_backups', { keyPath: 'id' });
                    hlStore.createIndex('importedAt', 'importedAt', { unique: false });
                }

                // 7. Settings Store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }

                // 8. Medical & Health Visits Store (Doctor, prescription, past/future timeline)
                if (!db.objectStoreNames.contains('medical_visits')) {
                    const medStore = db.createObjectStore('medical_visits', { keyPath: 'id' });
                    medStore.createIndex('visitDate', 'visitDate', { unique: false });
                    medStore.createIndex('nextVisitDate', 'nextVisitDate', { unique: false });
                    medStore.createIndex('familyMember', 'familyMember', { unique: false });
                    medStore.createIndex('status', 'status', { unique: false });
                }
            };

            request.onsuccess = function (event) {
                dbInstance = event.target.result;
                resolve(dbInstance);
            };

            request.onerror = function (event) {
                reject(new Error('IndexedDB opening failed: ' + event.target.error));
            };
        });
    }

    // Generic transaction helper
    async function getStore(storeName, mode = 'readonly') {
        const db = await openDatabase();
        const tx = db.transaction(storeName, mode);
        return tx.objectStore(storeName);
    }

    /* -------------------------------------------------------------
       PROFILES (Admin & User Management)
    ------------------------------------------------------------- */
    async function getProfile(userId) {
        const store = await getStore('profiles', 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.get(userId);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async function getAllProfiles() {
        const store = await getStore('profiles', 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    async function saveProfile(profile) {
        const store = await getStore('profiles', 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.put(profile);
            req.onsuccess = () => resolve(profile);
            req.onerror = () => reject(req.error);
        });
    }

    async function deleteProfile(userId) {
        const store = await getStore('profiles', 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.delete(userId);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    /* -------------------------------------------------------------
       FOLDERS (Nested & Encrypted Compartments)
    ------------------------------------------------------------- */
    async function getAllFolders() {
        const store = await getStore('folders', 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    async function getFolder(id) {
        const store = await getStore('folders', 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async function saveFolder(folder) {
        const store = await getStore('folders', 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.put(folder);
            req.onsuccess = () => resolve(folder);
            req.onerror = () => reject(req.error);
        });
    }

    async function deleteFolder(id) {
        const store = await getStore('folders', 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.delete(id);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    /* -------------------------------------------------------------
       DOCUMENTS (PDFs, Scans, Multi-page files, raw/encrypted)
    ------------------------------------------------------------- */
    async function getAllDocuments() {
        const store = await getStore('documents', 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    async function getDocumentsByFolder(folderId) {
        const store = await getStore('documents', 'readonly');
        const index = store.index('folderId');
        return new Promise((resolve, reject) => {
            const req = index.getAll(folderId);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    async function getDocument(id) {
        const store = await getStore('documents', 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async function saveDocument(doc) {
        const store = await getStore('documents', 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.put(doc);
            req.onsuccess = () => resolve(doc);
            req.onerror = () => reject(req.error);
        });
    }

    async function deleteDocument(id) {
        const store = await getStore('documents', 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.delete(id);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    /* -------------------------------------------------------------
       EVENTS & DIARY ENTRIES
    ------------------------------------------------------------- */
    async function getAllEvents() {
        const store = await getStore('events', 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => {
                const results = req.result || [];
                // Sort chronologically ascending
                results.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
                resolve(results);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async function getEvent(id) {
        const store = await getStore('events', 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async function saveEvent(ev) {
        const store = await getStore('events', 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.put(ev);
            req.onsuccess = () => resolve(ev);
            req.onerror = () => reject(req.error);
        });
    }

    async function deleteEvent(id) {
        const store = await getStore('events', 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.delete(id);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    /* -------------------------------------------------------------
       GROWTH TIMELAPSE (Annual Birthday Photos)
    ------------------------------------------------------------- */
    async function getAllGrowthRecords() {
        const store = await getStore('growth', 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => {
                const results = req.result || [];
                results.sort((a, b) => (Number(a.age) || 0) - (Number(b.age) || 0));
                resolve(results);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async function getGrowthRecord(id) {
        const store = await getStore('growth', 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async function saveGrowthRecord(rec) {
        const store = await getStore('growth', 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.put(rec);
            req.onsuccess = () => resolve(rec);
            req.onerror = () => reject(req.error);
        });
    }

    async function deleteGrowthRecord(id) {
        const store = await getStore('growth', 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.delete(id);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    /* -------------------------------------------------------------
       HOUSE LOGS SAFE DEPOSIT (Disaster Recovery Backups)
    ------------------------------------------------------------- */
    async function getAllHouseLogsBackups() {
        const store = await getStore('house_logs_backups', 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => {
                const results = req.result || [];
                results.sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0));
                resolve(results);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async function saveHouseLogsBackup(backup) {
        const store = await getStore('house_logs_backups', 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.put(backup);
            req.onsuccess = () => resolve(backup);
            req.onerror = () => reject(req.error);
        });
    }

    async function deleteHouseLogsBackup(id) {
        const store = await getStore('house_logs_backups', 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.delete(id);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    /* -------------------------------------------------------------
       MEDICAL & HEALTH VISITS (Doctor visits, prescriptions, schedules)
    ------------------------------------------------------------- */
    async function getAllMedicalVisits() {
        const store = await getStore('medical_visits', 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => {
                const results = req.result || [];
                // Sort by visit date descending (most recent first)
                results.sort((a, b) => (b.visitDate || '').localeCompare(a.visitDate || ''));
                resolve(results);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async function getMedicalVisit(id) {
        const store = await getStore('medical_visits', 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async function saveMedicalVisit(visit) {
        const store = await getStore('medical_visits', 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.put(visit);
            req.onsuccess = () => resolve(visit);
            req.onerror = () => reject(req.error);
        });
    }

    async function deleteMedicalVisit(id) {
        const store = await getStore('medical_visits', 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.delete(id);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    /* -------------------------------------------------------------
       UNIFIED CROSS-APP SEARCH ENGINE
       Scans documents, Aadhaar cards, events, medical visits, and growth
    ------------------------------------------------------------- */
    async function searchVault(query, personFilter = 'all', categoryFilter = 'all') {
        const q = (query || '').toLowerCase().trim();
        const p = (personFilter || 'all').toLowerCase().trim();
        const c = (categoryFilter || 'all').toLowerCase().trim();

        const [docs, events, growth, medical] = await Promise.all([
            getAllDocuments(),
            getAllEvents(),
            getAllGrowthRecords(),
            getAllMedicalVisits()
        ]);

        const results = [];

        // 1. Search Documents (Aadhaar, Passport, deeds, tax records)
        docs.forEach(doc => {
            const titleMatch = (doc.title || '').toLowerCase().includes(q);
            const notesMatch = (doc.notes || '').toLowerCase().includes(q);
            const fileMatch = (doc.fileName || '').toLowerCase().includes(q);
            const personMatch = (doc.familyMember || '').toLowerCase().includes(q);

            if (!q || titleMatch || notesMatch || fileMatch || personMatch) {
                if (p !== 'all' && (doc.familyMember || '').toLowerCase() !== p) return;
                if (c !== 'all' && c !== 'document') return;

                results.push({
                    type: 'document',
                    id: doc.id,
                    title: doc.title,
                    subtitle: `${doc.familyMember ? '👤 ' + doc.familyMember + ' • ' : ''}${doc.fileName || 'Document'} (${formatBytes(doc.fileSize || 0)})`,
                    date: doc.expiryDate ? `Expires: ${doc.expiryDate}` : new Date(doc.createdAt).toLocaleDateString(),
                    familyMember: doc.familyMember || 'Family',
                    icon: doc.fileType && doc.fileType.includes('pdf') ? '📑' : '📄',
                    raw: doc
                });
            }
        });

        // 2. Search Medical Visits
        medical.forEach(med => {
            const docMatch = (med.doctorName || '').toLowerCase().includes(q);
            const hospMatch = (med.clinicHospital || '').toLowerCase().includes(q);
            const symMatch = (med.symptomsDiagnosis || '').toLowerCase().includes(q);
            const specMatch = (med.speciality || '').toLowerCase().includes(q);
            const personMatch = (med.familyMember || '').toLowerCase().includes(q);
            const notesMatch = (med.notes || '').toLowerCase().includes(q);

            if (!q || docMatch || hospMatch || symMatch || specMatch || personMatch || notesMatch) {
                if (p !== 'all' && (med.familyMember || '').toLowerCase() !== p) return;
                if (c !== 'all' && c !== 'medical') return;

                results.push({
                    type: 'medical',
                    id: med.id,
                    title: `${med.doctorName || 'Doctor Checkup'} (${med.speciality || 'General'})`,
                    subtitle: `${med.familyMember ? '👤 ' + med.familyMember + ' • ' : ''}${med.clinicHospital || 'Clinic'} — ${med.symptomsDiagnosis || 'Consultation'}`,
                    date: `Visited: ${med.visitDate}${med.nextVisitDate ? ` • Next: ${med.nextVisitDate}` : ''}`,
                    familyMember: med.familyMember || 'Family',
                    icon: '🩺',
                    raw: med
                });
            }
        });

        // 3. Search Life Events & Diary
        events.forEach(ev => {
            const titleMatch = (ev.title || '').toLowerCase().includes(q);
            const descMatch = (ev.description || '').toLowerCase().includes(q);
            const personMatch = (ev.familyMember || '').toLowerCase().includes(q);
            const catMatch = (ev.category || '').toLowerCase().includes(q);

            if (!q || titleMatch || descMatch || personMatch || catMatch) {
                if (p !== 'all' && (ev.familyMember || '').toLowerCase() !== p) return;
                if (c !== 'all' && c !== 'event' && c !== ev.category) return;

                results.push({
                    type: 'event',
                    id: ev.id,
                    title: ev.title,
                    subtitle: `${ev.familyMember ? '👤 ' + ev.familyMember + ' • ' : ''}${ev.category.toUpperCase()}`,
                    date: ev.date || 'Undated',
                    familyMember: ev.familyMember || 'Family',
                    icon: '🌟',
                    raw: ev
                });
            }
        });

        // 4. Search Growth Timelapse
        growth.forEach(g => {
            const childMatch = (g.childName || '').toLowerCase().includes(q);
            const notesMatch = (g.milestoneNotes || '').toLowerCase().includes(q);

            if (!q || childMatch || notesMatch) {
                if (p !== 'all' && (g.childName || '').toLowerCase() !== p) return;
                if (c !== 'all' && c !== 'growth') return;

                results.push({
                    type: 'growth',
                    id: g.id,
                    title: `${g.childName} — Age ${g.age} Birthday`,
                    subtitle: g.milestoneNotes || 'Birthday Portrait',
                    date: g.date || 'Birthday',
                    familyMember: g.childName,
                    icon: '🌱',
                    raw: g
                });
            }
        });

        return results;
    }

    /* -------------------------------------------------------------
       SETTINGS (Key-Value)
    ------------------------------------------------------------- */
    async function getSetting(key, defaultValue = null) {
        const store = await getStore('settings', 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.get(key);
            req.onsuccess = () => {
                if (req.result && req.result.value !== undefined) {
                    resolve(req.result.value);
                } else {
                    resolve(defaultValue);
                }
            };
            req.onerror = () => reject(req.error);
        });
    }

    async function setSetting(key, value) {
        const store = await getStore('settings', 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.put({ key, value });
            req.onsuccess = () => resolve(value);
            req.onerror = () => reject(req.error);
        });
    }

    /* -------------------------------------------------------------
       VAULT METRICS & STORAGE SIZE CALCULATION
    ------------------------------------------------------------- */
    async function getStorageMetrics() {
        const docs = await getAllDocuments();
        const growth = await getAllGrowthRecords();
        const hlBackups = await getAllHouseLogsBackups();
        const events = await getAllEvents();
        const folders = await getAllFolders();
        const medical = await getAllMedicalVisits();

        let docBytes = 0;
        docs.forEach(d => {
            if (d.fileSize) docBytes += d.fileSize;
            else if (d.blob && d.blob.byteLength) docBytes += d.blob.byteLength;
            else if (d.cipherBuf && d.cipherBuf.byteLength) docBytes += d.cipherBuf.byteLength;
        });

        let growthBytes = 0;
        growth.forEach(g => {
            if (g.photoBlob && g.photoBlob.byteLength) growthBytes += g.photoBlob.byteLength;
            else if (g.photoBase64) growthBytes += g.photoBase64.length;
        });

        let hlBytes = 0;
        hlBackups.forEach(h => {
            if (h.fileSize) hlBytes += h.fileSize;
            else if (h.fileBlob && h.fileBlob.byteLength) hlBytes += h.fileBlob.byteLength;
        });

        const totalBytes = docBytes + growthBytes + hlBytes;

        return {
            totalBytes,
            totalFormatted: formatBytes(totalBytes),
            docCount: docs.length,
            docBytes,
            docFormatted: formatBytes(docBytes),
            growthCount: growth.length,
            growthBytes,
            growthFormatted: formatBytes(growthBytes),
            hlCount: hlBackups.length,
            hlBytes,
            hlFormatted: formatBytes(hlBytes),
            eventsCount: events.length,
            foldersCount: folders.length,
            medicalCount: medical.length
        };
    }

    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /* -------------------------------------------------------------
       DATABASE CLEAR (Nuclear Factory Reset / Testing)
    ------------------------------------------------------------- */
    async function resetDatabase() {
        const db = await openDatabase();
        const storeNames = ['profiles', 'folders', 'documents', 'events', 'growth', 'house_logs_backups', 'settings', 'medical_visits'];
        const tx = db.transaction(storeNames, 'readwrite');
        return new Promise((resolve, reject) => {
            let cleared = 0;
            storeNames.forEach(name => {
                const req = tx.objectStore(name).clear();
                req.onsuccess = () => {
                    cleared++;
                    if (cleared === storeNames.length) resolve(true);
                };
                req.onerror = () => reject(req.error);
            });
        });
    }

    // Export API
    window.HeritageStorage = {
        openDatabase,
        // Profiles
        getProfile,
        getAllProfiles,
        saveProfile,
        deleteProfile,
        // Folders
        getAllFolders,
        getFolder,
        saveFolder,
        deleteFolder,
        // Documents
        getAllDocuments,
        getDocumentsByFolder,
        getDocument,
        saveDocument,
        deleteDocument,
        // Events
        getAllEvents,
        getEvent,
        saveEvent,
        deleteEvent,
        // Medical & Health Visits
        getAllMedicalVisits,
        getMedicalVisit,
        saveMedicalVisit,
        deleteMedicalVisit,
        // Growth
        getAllGrowthRecords,
        getGrowthRecord,
        saveGrowthRecord,
        deleteGrowthRecord,
        // House Logs Safe Deposit
        getAllHouseLogsBackups,
        saveHouseLogsBackup,
        deleteHouseLogsBackup,
        // Unified Search
        searchVault,
        // Settings
        getSetting,
        setSetting,
        // Metrics & Utilities
        getStorageMetrics,
        formatBytes,
        resetDatabase
    };

})(typeof window !== 'undefined' ? window : this);
