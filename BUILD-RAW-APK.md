# 📱 My Vault v1.0 — Raw Offline Android APK Guide

This directory contains the **100% native offline Android wrapper** (`android-wrapper/`).

### Key Features of the Raw APK:
1. **Zero Internet Permission**: The `AndroidManifest.xml` does not request `android.permission.INTERNET`. The Android OS physically prevents any data transmission outside your phone.
2. **Zero Server Dependency**: All assets (`index.html`, `styles.css`, `app.js`, `crypto.js`) are bundled directly into the APK assets.
3. **Zero Browser Bar**: Opens as a pure native app from your Android app drawer.
4. **Persistent Offline Storage**: Encrypted files and IndexedDB databases are stored internally on your phone.

---

## 🛠️ How to Compile the Raw APK

### Method 1: Android Studio (Recommended)
1. Install and open **Android Studio**.
2. Click **Open** and select the folder:
   `android-wrapper`
3. Wait for Gradle sync to complete.
4. From the top menu, click:
   **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**
5. Once complete, click **locate** to find your compiled:
   `app-debug.apk`
6. Transfer `app-debug.apk` to your phone via USB cable and tap to install!

---

### Method 2: GitHub Actions (Free Cloud Build - Zero Software on PC)
1. Push this folder to a GitHub repository (can be private).
2. Go to the **Actions** tab.
3. The workflow `Build Raw Android APK` will automatically run and provide a direct download link for `MyVault-v1.0-raw.apk`!
