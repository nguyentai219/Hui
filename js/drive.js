/* ============================================
   QUẢN LÝ HỤI - Google Drive Integration
   Version: 2.0 - Auto Sync
   ============================================ */

"use strict";

const DRIVE_CLIENT_ID = "1051621009021-npiesmnq2j8kj522g00trj1m1t1il7q7.apps.googleusercontent.com";
const DRIVE_SCOPES    = "https://www.googleapis.com/auth/drive.file";
const DRIVE_FILE_NAME = "quan_ly_hui_backup.json";
const DRIVE_TOKEN_KEY = "hui_drive_autosync"; // lưu trạng thái tự đăng nhập

let driveAccessToken  = null;
let driveFileId       = null;
let _driveTokenClient = null;
let _syncTimer        = null;   // debounce timer
let _isSyncing        = false;

// ============================================================
// ĐĂNG NHẬP
// ============================================================
function driveLogin() {
  if (!window.google) {
    showToast("Đang tải Google SDK, thử lại sau giây lát...", "warn");
    return;
  }
  if (!_driveTokenClient) {
    _driveTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: DRIVE_CLIENT_ID,
      scope: DRIVE_SCOPES,
      callback: (resp) => {
        if (resp.error) { showToast("Đăng nhập thất bại: " + resp.error, "error"); return; }
        driveAccessToken = resp.access_token;
        localStorage.setItem(DRIVE_TOKEN_KEY, "1");
        onDriveLoggedIn();
      },
    });
  }
  _driveTokenClient.requestAccessToken();
}

async function onDriveLoggedIn() {
  try {
    const res  = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer " + driveAccessToken },
    });
    const info = await res.json();
    const el   = document.getElementById("drive-user-info");
    el.innerText = "☁️ " + (info.email || "Đã kết nối Drive");
    el.classList.remove("hidden");
  } catch {}

  document.getElementById("btn-drive-login").classList.add("hidden");
  document.getElementById("btn-drive-save").classList.remove("hidden");
  document.getElementById("btn-drive-load").classList.remove("hidden");
  document.getElementById("btn-drive-logout").classList.remove("hidden");

  showToast("Đã kết nối Drive — tự động lưu mỗi thao tác!", "success", 4000);
  await driveFindFile();
}

function driveLogout() {
  driveAccessToken = null;
  driveFileId      = null;
  localStorage.removeItem(DRIVE_TOKEN_KEY);
  if (_driveTokenClient) google.accounts.oauth2.revoke(driveAccessToken, () => {});

  document.getElementById("btn-drive-login").classList.remove("hidden");
  document.getElementById("btn-drive-save").classList.add("hidden");
  document.getElementById("btn-drive-load").classList.add("hidden");
  document.getElementById("btn-drive-logout").classList.add("hidden");
  const el = document.getElementById("drive-user-info");
  el.classList.add("hidden");
  el.innerText = "";
  showToast("Đã đăng xuất Drive", "info");
}

// ============================================================
// TỰ ĐỘNG ĐỒNG BỘ (gọi từ save())
// ============================================================
function driveAutoSync() {
  if (!driveAccessToken) return; // chưa đăng nhập → bỏ qua

  // Debounce: huỷ timer cũ, đặt timer mới 2.5 giây
  clearTimeout(_syncTimer);
  _syncTimer = setTimeout(async () => {
    if (_isSyncing) return;
    _isSyncing = true;
    setSyncStatus("syncing");
    try {
      await drivePush();
      setSyncStatus("ok");
    } catch (e) {
      setSyncStatus("error");
      console.error("Auto-sync error:", e);
    } finally {
      _isSyncing = false;
    }
  }, 2500);
}

// Hiển thị trạng thái đồng bộ nhỏ bên cạnh email
function setSyncStatus(status) {
  const el = document.getElementById("drive-sync-status");
  if (!el) return;
  const map = {
    syncing: { text: "⏳ Đang lưu...",  color: "text-yellow-300" },
    ok:      { text: "✅ Đã lưu Drive", color: "text-green-300"  },
    error:   { text: "❌ Lỗi lưu Drive",color: "text-red-300"   },
  };
  const s = map[status];
  el.innerText  = s.text;
  el.className  = `text-[9px] font-bold mt-1 ${s.color}`;
  el.classList.remove("hidden");
  if (status === "ok") setTimeout(() => el.classList.add("hidden"), 3000);
}

// ============================================================
// TÌM FILE TRÊN DRIVE
// ============================================================
async function driveFindFile() {
  try {
    const q   = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)`,
      { headers: { Authorization: "Bearer " + driveAccessToken } }
    );
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      driveFileId = data.files[0].id;
      const modified = new Date(data.files[0].modifiedTime).toLocaleString("vi-VN");
      showToast(`Tìm thấy backup Drive (${modified})`, "info", 4000);
    }
  } catch (e) {
    console.error("driveFindFile:", e);
  }
}

// ============================================================
// LƯU LÊN DRIVE (dùng cho cả auto-sync và nút thủ công)
// ============================================================
async function drivePush() {
  const content = JSON.stringify(state.allHuis, null, 2);
  const blob    = new Blob([content], { type: "application/json" });
  if (driveFileId) {
    await driveUpdateFile(driveFileId, blob);
  } else {
    driveFileId = await driveCreateFile(blob);
  }
}

async function driveSave() {
  if (!driveAccessToken) { showToast("Chưa đăng nhập Drive!", "warn"); return; }
  setSyncStatus("syncing");
  try {
    await drivePush();
    setSyncStatus("ok");
    showToast("✅ Đã lưu Drive!", "success");
  } catch (e) {
    setSyncStatus("error");
    showToast("Lỗi khi lưu Drive: " + e.message, "error");
  }
}

async function driveCreateFile(blob) {
  const meta = JSON.stringify({ name: DRIVE_FILE_NAME, mimeType: "application/json" });
  const form = new FormData();
  form.append("metadata", new Blob([meta], { type: "application/json" }));
  form.append("file", blob);
  const res  = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    { method: "POST", headers: { Authorization: "Bearer " + driveAccessToken }, body: form }
  );
  const data = await res.json();
  if (!data.id) throw new Error(JSON.stringify(data));
  return data.id;
}

async function driveUpdateFile(fileId, blob) {
  const res  = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: { Authorization: "Bearer " + driveAccessToken, "Content-Type": "application/json" },
      body: blob,
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
}

// ============================================================
// TẢI TỪ DRIVE
// ============================================================
async function driveLoad() {
  if (!driveAccessToken) { showToast("Chưa đăng nhập Drive!", "warn"); return; }
  if (!driveFileId)      { showToast("Không tìm thấy file backup trên Drive!", "warn"); return; }

  showToast("Đang tải từ Drive...", "info", 2000);
  try {
    const res  = await fetch(
      `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
      { headers: { Authorization: "Bearer " + driveAccessToken } }
    );
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Dữ liệu không hợp lệ");

    showConfirmPopup(
      "Tải dữ liệu từ Drive sẽ ghi đè dữ liệu hiện tại. Tiếp tục?",
      () => {
        state.allHuis = data;
        save();
        renderHuiList();
        showToast("✅ Đã khôi phục từ Drive!", "success");
      },
      "Tải về", "bg-yellow-500"
    );
  } catch (e) {
    showToast("Lỗi khi tải Drive: " + e.message, "error");
  }
}


// ============================================================
// ĐĂNG NHẬP
// ============================================================
function driveLogin() {
  if (!window.google) {
    showToast("Đang tải Google SDK, thử lại sau giây lát...", "warn");
    return;
  }

  const client = google.accounts.oauth2.initTokenClient({
    client_id: DRIVE_CLIENT_ID,
    scope: DRIVE_SCOPES,
    callback: (resp) => {
      if (resp.error) {
        showToast("Đăng nhập thất bại: " + resp.error, "error");
        return;
      }
      driveAccessToken = resp.access_token;
      onDriveLoggedIn();
    },
  });
  client.requestAccessToken();
}

async function onDriveLoggedIn() {
  // Lấy thông tin người dùng
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer " + driveAccessToken },
    });
    const info = await res.json();
    const emailEl = document.getElementById("drive-user-info");
    emailEl.innerText = "☁️ " + (info.email || "Đã kết nối Drive");
    emailEl.classList.remove("hidden");
  } catch {}

  // Cập nhật UI buttons
  document.getElementById("btn-drive-login").classList.add("hidden");
  document.getElementById("btn-drive-save").classList.remove("hidden");
  document.getElementById("btn-drive-load").classList.remove("hidden");
  document.getElementById("btn-drive-logout").classList.remove("hidden");

  showToast("Đã kết nối Google Drive!", "success");

  // Tự tìm file backup cũ nếu có
  await driveFindFile();
}

function driveLogout() {
  driveAccessToken = null;
  driveFileId = null;
  document.getElementById("btn-drive-login").classList.remove("hidden");
  document.getElementById("btn-drive-save").classList.add("hidden");
  document.getElementById("btn-drive-load").classList.add("hidden");
  document.getElementById("btn-drive-logout").classList.add("hidden");
  const emailEl = document.getElementById("drive-user-info");
  emailEl.classList.add("hidden");
  emailEl.innerText = "";
  showToast("Đã đăng xuất Drive", "info");
}

// ============================================================
// TÌM FILE BACKUP TRÊN DRIVE
// ============================================================
async function driveFindFile() {
  try {
    const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and trashed=false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)`,
      { headers: { Authorization: "Bearer " + driveAccessToken } }
    );
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      driveFileId = data.files[0].id;
      const modified = new Date(data.files[0].modifiedTime).toLocaleString("vi-VN");
      showToast(`Tìm thấy backup Drive (${modified})`, "info", 4000);
    }
  } catch (e) {
    console.error("driveFindFile:", e);
  }
}

// ============================================================
// LƯU LÊN DRIVE
// ============================================================
async function driveSave() {
  if (!driveAccessToken) { showToast("Chưa đăng nhập Drive!", "warn"); return; }

  showToast("Đang lưu lên Drive...", "info", 2000);

  const content = JSON.stringify(state.allHuis, null, 2);
  const blob = new Blob([content], { type: "application/json" });

  try {
    if (driveFileId) {
      // Cập nhật file cũ
      await driveUpdateFile(driveFileId, blob);
    } else {
      // Tạo file mới
      driveFileId = await driveCreateFile(blob);
    }
    const now = new Date().toLocaleString("vi-VN");
    showToast(`✅ Đã lưu Drive lúc ${now}`, "success", 4000);
  } catch (e) {
    showToast("Lỗi khi lưu Drive: " + e.message, "error");
  }
}

async function driveCreateFile(blob) {
  const meta = JSON.stringify({ name: DRIVE_FILE_NAME, mimeType: "application/json" });
  const form = new FormData();
  form.append("metadata", new Blob([meta], { type: "application/json" }));
  form.append("file", blob);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
    {
      method: "POST",
      headers: { Authorization: "Bearer " + driveAccessToken },
      body: form,
    }
  );
  const data = await res.json();
  if (!data.id) throw new Error(JSON.stringify(data));
  return data.id;
}

async function driveUpdateFile(fileId, blob) {
  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + driveAccessToken,
        "Content-Type": "application/json",
      },
      body: blob,
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
}

// ============================================================
// TẢI TỪ DRIVE
// ============================================================
async function driveLoad() {
  if (!driveAccessToken) { showToast("Chưa đăng nhập Drive!", "warn"); return; }

  if (!driveFileId) {
    showToast("Không tìm thấy file backup trên Drive!", "warn");
    return;
  }

  showToast("Đang tải từ Drive...", "info", 2000);

  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
      { headers: { Authorization: "Bearer " + driveAccessToken } }
    );
    const data = await res.json();

    if (!Array.isArray(data)) throw new Error("Dữ liệu không hợp lệ");

    showConfirmPopup(
      `Tải dữ liệu từ Drive sẽ ghi đè dữ liệu hiện tại. Tiếp tục?`,
      () => {
        state.allHuis = data;
        save();
        renderHuiList();
        showToast("✅ Đã khôi phục từ Drive!", "success");
      },
      "Tải về",
      "bg-yellow-500"
    );
  } catch (e) {
    showToast("Lỗi khi tải Drive: " + e.message, "error");
  }
}
