/* ============================================
   QUẢN LÝ HỤI - Google Drive Integration
   Version: 3.0 - Persistent Session
   ============================================ */

"use strict";

const DRIVE_CLIENT_ID  = "1051621009021-npiesmnq2j8kj522g00trj1m1t1il7q7.apps.googleusercontent.com";
const DRIVE_SCOPES     = "https://www.googleapis.com/auth/drive.file";
const DRIVE_FILE_NAME  = "quan_ly_hui_backup.json";
const DRIVE_LOGGED_KEY = "hui_drive_logged";
const DRIVE_TOKEN_KEY  = "hui_drive_token";
const DRIVE_EMAIL_KEY  = "hui_drive_email";
const DRIVE_FILEID_KEY = "hui_drive_fileid";

let _syncTimer = null;
let _isSyncing = false;

const _el = (id) => document.getElementById(id);
const getToken  = () => sessionStorage.getItem(DRIVE_TOKEN_KEY);
const setToken  = (t) => sessionStorage.setItem(DRIVE_TOKEN_KEY, t);
const getFileId = () => sessionStorage.getItem(DRIVE_FILEID_KEY);

// ============================================================
// KHỞI TẠO - gọi khi DOMContentLoaded
// ============================================================
function driveInit() {
  // Token còn trong sessionStorage (cùng tab/reload) => dùng luôn
  if (getToken()) {
    _applyLoggedInUI(sessionStorage.getItem(DRIVE_EMAIL_KEY) || "Đã kết nối Drive");
    return;
  }
  // Đã từng đăng nhập trước đây => thử silent refresh
  if (localStorage.getItem(DRIVE_LOGGED_KEY)) {
    _driveRefreshSilent();
  }
}

function _driveRefreshSilent() {
  if (!window.google) { setTimeout(_driveRefreshSilent, 1000); return; }
  const client = google.accounts.oauth2.initTokenClient({
    client_id: DRIVE_CLIENT_ID,
    scope: DRIVE_SCOPES,
    prompt: "",
    callback: async (resp) => {
      if (!resp || !resp.access_token) return; // silent fail - im lặng
      setToken(resp.access_token);
      const email = await _fetchUserInfo(resp.access_token);
      sessionStorage.setItem(DRIVE_EMAIL_KEY, email);
      _applyLoggedInUI(email);
      if (!getFileId()) _driveFindFile();
    },
  });
  try { client.requestAccessToken({ prompt: "" }); } catch {}
}

function _applyLoggedInUI(email) {
  _el("btn-drive-login") && _el("btn-drive-login").classList.add("hidden");
  _el("btn-drive-save")  && _el("btn-drive-save").classList.remove("hidden");
  _el("btn-drive-load")  && _el("btn-drive-load").classList.remove("hidden");
  _el("btn-drive-logout")&& _el("btn-drive-logout").classList.remove("hidden");
  const info = _el("drive-user-info");
  if (info) { info.innerText = "☁️ " + email; info.classList.remove("hidden"); }
  _updateDriveStatusIcon(true);
}

// ============================================================
// ICON DRIVE trong header màn hình chi tiết
// ============================================================
function _updateDriveStatusIcon(connected) {
  const icon = _el("detail-drive-icon");
  if (!icon) return;
  icon.innerText = connected ? "☁️" : "⚡";
  icon.title     = connected ? "Google Drive đã kết nối" : "Google Drive chưa kết nối";
  icon.style.opacity = connected ? "1" : "0.35";
}

function updateDetailDriveIcon() {
  _updateDriveStatusIcon(!!getToken());
}

// ============================================================
// ĐĂNG NHẬP THỦ CÔNG
// ============================================================
function driveLogin() {
  if (!window.google) { showToast("Đang tải Google SDK...", "warn"); return; }
  const client = google.accounts.oauth2.initTokenClient({
    client_id: DRIVE_CLIENT_ID,
    scope: DRIVE_SCOPES,
    prompt: "select_account",
    callback: async (resp) => {
      if (!resp || !resp.access_token) { showToast("Đăng nhập thất bại!", "error"); return; }
      setToken(resp.access_token);
      localStorage.setItem(DRIVE_LOGGED_KEY, "1");
      const email = await _fetchUserInfo(resp.access_token);
      sessionStorage.setItem(DRIVE_EMAIL_KEY, email);
      _applyLoggedInUI(email);
      await _driveFindFile();
      showToast("✅ Đã kết nối Drive — tự động lưu!", "success", 4000);
    },
  });
  client.requestAccessToken({ prompt: "select_account" });
}

// ============================================================
// ĐĂNG XUẤT
// ============================================================
function driveLogout() {
  sessionStorage.removeItem(DRIVE_TOKEN_KEY);
  sessionStorage.removeItem(DRIVE_EMAIL_KEY);
  sessionStorage.removeItem(DRIVE_FILEID_KEY);
  localStorage.removeItem(DRIVE_LOGGED_KEY);

  _el("btn-drive-login") && _el("btn-drive-login").classList.remove("hidden");
  _el("btn-drive-save")  && _el("btn-drive-save").classList.add("hidden");
  _el("btn-drive-load")  && _el("btn-drive-load").classList.add("hidden");
  _el("btn-drive-logout")&& _el("btn-drive-logout").classList.add("hidden");
  const info = _el("drive-user-info");
  if (info) { info.classList.add("hidden"); info.innerText = ""; }
  _updateDriveStatusIcon(false);
  showToast("Đã đăng xuất Drive", "info");
}

// ============================================================
// TÌM FILE TRÊN DRIVE
// ============================================================
async function _driveFindFile() {
  const token = getToken(); if (!token) return;
  try {
    const q   = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,modifiedTime)`,
      { headers: { Authorization: "Bearer " + token } }
    );
    const data = await res.json();
    if (data.files && data.files.length > 0)
      sessionStorage.setItem(DRIVE_FILEID_KEY, data.files[0].id);
  } catch {}
}

// ============================================================
// AUTO SYNC (debounce 2.5s) - gọi từ save()
// ============================================================
function driveAutoSync() {
  if (!getToken()) return;
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(async () => {
    if (_isSyncing) return;
    _isSyncing = true; _setSyncStatus("syncing");
    try   { await _drivePush(); _setSyncStatus("ok"); }
    catch { _setSyncStatus("error"); }
    finally { _isSyncing = false; }
  }, 2500);
}

function _setSyncStatus(s) {
  const el = _el("drive-sync-status"); if (!el) return;
  const map = { syncing:["⏳ Đang lưu...","text-yellow-300"], ok:["✅ Đã lưu Drive","text-green-300"], error:["❌ Lỗi lưu Drive","text-red-300"] };
  el.innerText = map[s][0]; el.className = `text-[9px] font-bold mt-1 ${map[s][1]}`; el.classList.remove("hidden");
  if (s === "ok") setTimeout(() => el.classList.add("hidden"), 3000);
}

// ============================================================
// LƯU THỦ CÔNG
// ============================================================
async function driveSave() {
  if (!getToken()) { showToast("Chưa đăng nhập Drive!", "warn"); return; }
  _setSyncStatus("syncing");
  try { await _drivePush(); _setSyncStatus("ok"); showToast("✅ Đã lưu Drive!", "success"); }
  catch (e) { _setSyncStatus("error"); showToast("Lỗi: " + e.message, "error"); }
}

async function _drivePush() {
  const token  = getToken();
  const blob   = new Blob([JSON.stringify(state.allHuis, null, 2)], { type: "application/json" });
  const fileId = getFileId();
  if (fileId) { await _driveUpdateFile(fileId, blob, token); }
  else        { sessionStorage.setItem(DRIVE_FILEID_KEY, await _driveCreateFile(blob, token)); }
}

async function _driveCreateFile(blob, token) {
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({ name: DRIVE_FILE_NAME, mimeType: "application/json" })], { type: "application/json" }));
  form.append("file", blob);
  const res  = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    { method: "POST", headers: { Authorization: "Bearer " + token }, body: form });
  const data = await res.json();
  if (!data.id) throw new Error(JSON.stringify(data));
  return data.id;
}

async function _driveUpdateFile(fileId, blob, token) {
  const res  = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    { method: "PATCH", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: blob });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
}

// ============================================================
// TẢI TỪ DRIVE
// ============================================================
async function driveLoad() {
  const token = getToken(), fileId = getFileId();
  if (!token)  { showToast("Chưa đăng nhập Drive!", "warn"); return; }
  if (!fileId) { showToast("Không tìm thấy file backup!", "warn"); return; }
  showToast("Đang tải từ Drive...", "info", 2000);
  try {
    const res  = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: "Bearer " + token } });
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Dữ liệu không hợp lệ");
    showConfirmPopup("Tải dữ liệu từ Drive sẽ ghi đè dữ liệu hiện tại. Tiếp tục?",
      () => { state.allHuis = data; save(); renderHuiList(); showToast("✅ Đã khôi phục từ Drive!", "success"); },
      "Tải về", "bg-yellow-500");
  } catch (e) { showToast("Lỗi: " + e.message, "error"); }
}

async function _fetchUserInfo(token) {
  try {
    const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: "Bearer " + token } });
    const d = await r.json(); return d.email || "Đã kết nối Drive";
  } catch { return "Đã kết nối Drive"; }
}
