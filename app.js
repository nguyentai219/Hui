/* ============================================
   QUẢN LÝ HỤI - JavaScript
   Version: 18.3 | Optimized & Modular
   ============================================ */

"use strict";

// ============================================================
// 1. CONSTANTS & STATE
// ============================================================
const DB_KEY = "hui_v17_9_db";
const COMMISSION_KEY = "hui_last_commission";

function saveLastCommission(val) { if (val > 0) localStorage.setItem(COMMISSION_KEY, val); }
function getLastCommission() { return parseInt(localStorage.getItem(COMMISSION_KEY) || "0"); }

let state = {
  allHuis: [],
  curId: null,
  backEditIdx: null,
  editingMemberId: null,
};

// ============================================================
// 2. PERSISTENCE
// ============================================================
function loadData() {
  try {
    state.allHuis = JSON.parse(localStorage.getItem(DB_KEY) || "[]");
  } catch {
    state.allHuis = [];
  }
}

function save() {
  localStorage.setItem(DB_KEY, JSON.stringify(state.allHuis));
  driveAutoSync(); // Tự động đồng bộ Drive sau mỗi thay đổi
}

// ============================================================
// 3. HELPERS - FORMATTING
// ============================================================
const formatC = (n) => Math.abs(Number(n)).toLocaleString("vi-VN") + "đ";
const parseC  = (v) => (v ? Number(v.toString().replace(/\D/g, "")) : 0);
const fmtD    = (d) => (d ? d.split("-").reverse().join("/") : "--/--");

function formatMoneyOnFly(el) {
  const raw    = el.value;
  const sel    = el.selectionStart;
  const digits = raw.replace(/\D/g, "");

  if (!digits) { el.value = ""; return; }

  // Đếm bao nhiêu digit nằm TRƯỚC con trỏ
  const digitsBeforeCursor = raw.slice(0, sel).replace(/\D/g, "").length;

  const formatted = Number(digits).toLocaleString("vi-VN").replace(/,/g, ".");
  el.value = formatted;

  // Tìm vị trí con trỏ mới sao cho số digit bên trái = digitsBeforeCursor
  let count  = 0;
  let newPos = formatted.length; // mặc định: cuối chuỗi

  if (digitsBeforeCursor === 0) {
    // Xóa số đầu tiên → con trỏ ở trước chữ số đầu tiên
    newPos = formatted.search(/\d/); // vị trí digit đầu tiên
    if (newPos < 0) newPos = 0;
  } else {
    for (let i = 0; i < formatted.length; i++) {
      if (/\d/.test(formatted[i])) {
        count++;
        if (count === digitsBeforeCursor) {
          newPos = i + 1;
          break;
        }
      }
    }
  }

  // Dùng setTimeout để tránh browser reset cursor sau khi set value
  setTimeout(() => el.setSelectionRange(newPos, newPos), 0);
}

// ============================================================
// 4. HELPERS - DOM
// ============================================================
function $(id) { return document.getElementById(id); }

function showModal(id) { $(id).classList.remove("hidden"); }
function hideModal(id) { $(id).classList.add("hidden"); }

function showScreen(s) {
  $("screen-home").classList.toggle("hidden", s !== "home");
  $("screen-detail").classList.toggle("hidden", s !== "detail");
}

// ============================================================
// 5. AUTOCOMPLETE / SUGGESTIONS
// ============================================================
function handleInputSuggest(el, type) {
  const val = el.value.trim().toLowerCase();
  const dropdown = $(type + "-dropdown");
  if (!val) { dropdown.style.display = "none"; return; }

  const seen = new Set();
  const unique = [];

  // Thu thập từ tất cả hụi (kể cả hiện tại)
  state.allHuis.forEach((h) =>
    h.members.forEach((m) => {
      const key = (type === "name" ? m.name : m.address) || "";
      if (key && !seen.has(key.toLowerCase())) {
        unique.push({ name: m.name, phone: m.phone || "", address: m.address || "", _key: key });
        seen.add(key.toLowerCase());
      }
    })
  );

  const matches = unique.filter((x) => x._key.toLowerCase().includes(val));

  if (matches.length) {
    dropdown.innerHTML = matches
      .map(
        (x) => `
      <div onclick="selectSuggest('${escHtml(x.name)}','${escHtml(x.phone)}','${escHtml(x.address)}','${type}')"
           class="p-4 border-b flex justify-between items-center active:bg-blue-50">
        <div class="text-left overflow-hidden">
          <p class="font-black uppercase text-[10px] text-blue-900 truncate">${type === "name" ? escHtml(x.name) : escHtml(x.address)}</p>
          ${type === "name" ? `<p class="text-[8px] text-slate-400 font-bold">${escHtml(x.phone)}</p>` : `<p class="text-[8px] text-slate-400 font-bold truncate">${escHtml(x.name)}</p>`}
        </div>
      </div>`
      )
      .join("");
    dropdown.style.display = "block";
  } else {
    dropdown.style.display = "none";
  }
}

function selectSuggest(name, phone, address, type) {
  if (type === "name") {
    $("mem-name").value = name;
    $("mem-phone").value = phone !== "undefined" ? phone : "";
    $("mem-address").value = address !== "undefined" ? address : "";
    $("name-dropdown").style.display = "none";
    $("mem-phone").focus();
  } else {
    $("mem-address").value = address;
    $("address-dropdown").style.display = "none";
  }
}

// Simple XSS guard for inline event attrs
function escHtml(s) {
  return String(s).replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

// ============================================================
// 6. HUI MANAGEMENT
// ============================================================
function createNewHui() {
  const name = $("new-hui-name").value.trim();
  const base = parseC($("new-hui-base").value);
  if (!name || base <= 0) { showToast("Vui lòng nhập đủ tên và số tiền!", "warn"); return; }

  state.allHuis.push({
    id: Date.now(),
    name,
    baseAmount: base,
    members: [],
    history: [],
    date: new Date().toISOString().split("T")[0],
    currentKỳ: 1,
    bid: 0,
    winnerId: null,
    commission: 0,
    cycle: 30,
    isFinished: false,
  });

  $("new-hui-name").value = "";
  $("new-hui-base").value = "";

  save();
  hideModal("modal-create");
  renderHuiList();
}

function deleteHui(id) {
  const h = state.allHuis.find((x) => x.id === id);
  showConfirmPopup(`Xóa dây hụi "${h.name}"?`, () => {
    state.allHuis = state.allHuis.filter((x) => x.id !== id);
    save(); renderHuiList();
    showToast("Đã xóa dây hụi", "success");
  }, "Xóa", "bg-red-600");
}

function renderHuiList() {
  const c = $("hui-list-container");
  if (!state.allHuis.length) {
    c.innerHTML = `<p class="text-center py-20 font-bold opacity-30 uppercase italic">Chưa có dây hụi nào...</p>`;
    return;
  }

  c.innerHTML = state.allHuis
    .map(
      (h) => `
    <div onclick="openHui(${h.id})"
         class="bg-white p-6 rounded-[2rem] shadow-lg border-l-[12px] ${h.isFinished ? "border-slate-400" : "border-blue-700"}
                flex justify-between items-center active:scale-95 transition-transform">
      <div class="flex-1 mr-3 overflow-hidden">
        <h3 class="font-black text-blue-900 uppercase text-sm truncate">${escHtml(h.name)}</h3>
        <p class="text-[9px] font-bold uppercase opacity-50 mt-0.5">${h.members.length} hội viên · Gốc ${formatC(h.baseAmount)}</p>
      </div>
      <button onclick="event.stopPropagation(); deleteHui(${h.id})" class="text-slate-300 text-xl p-1 shrink-0">🗑️</button>
    </div>`
    )
    .join("");
}

function openHui(id) {
  state.curId = id;
  state.backEditIdx = null;
  sessionStorage.setItem("hui_cur_id", id);
  showScreen("detail");
  updateUI();
}

function goHome() {
  state.curId = null;
  sessionStorage.removeItem("hui_cur_id");
  showScreen("home");
  renderHuiList();
}

// ============================================================
// 7. MAIN DETAIL VIEW
// ============================================================
function getHui() {
  return state.allHuis.find((h) => h.id === state.curId);
}

function getActiveData(h) {
  return state.backEditIdx !== null ? h.history[state.backEditIdx] : h;
}

function updateUI() {
  const h = getHui();
  if (!h) return;
  const data = getActiveData(h);

  const nameEl = $("current-hui-name");
  nameEl.innerText = h.name;
  // Marquee nếu text tràn wrapper
  requestAnimationFrame(() => {
    const wrapper = nameEl.parentElement;
    if (nameEl.scrollWidth > wrapper.clientWidth) {
      nameEl.classList.add("scrolling");
    } else {
      nameEl.classList.remove("scrolling");
    }
  });
  $("display-progress").innerText = `${state.backEditIdx !== null ? data.kỳ : h.currentKỳ}/${h.members.length}`;
  $("display-bid-header").innerText = formatC(data.bid);

  // Countdown
  const cd = $("countdown");
  const nd = $("info-next-date");
  if (data.date && !h.isFinished) {
    const d = new Date(data.date);
    d.setDate(d.getDate() + parseInt(h.cycle || 30));
    nd.innerText = "Kỳ tới: " + d.toLocaleDateString("vi-VN");
    const diff = Math.ceil((d - Date.now()) / 86400000);
    cd.innerText = diff > 0 ? `(CÒN ${diff} NGÀY)` : "(TỚI KỲ HỐT)";
  } else {
    nd.innerText = h.isFinished ? "DÂY HỤI ĐÃ XONG" : "";
    cd.innerText = "";
  }

  renderMain();
}

function calcMemberPay(h, data, m, isBack) {
  const isWin = data.winnerId == m.id;

  if (isWin) {
    const sCount = h.members.filter((x) => {
      const wk = h.history.findIndex((hi) => hi.winnerId == x.id);
      return isBack ? (wk === -1 || wk >= state.backEditIdx) && x.id != m.id : !x.isDead && x.id != m.id;
    }).length;
    return (
      sCount * (h.baseAmount - data.bid) +
      (h.members.length - 1 - sCount) * h.baseAmount -
      (data.commission || 0)
    );
  }

  const wk = h.history.findIndex((hi) => hi.winnerId == m.id);
  const isDead = isBack ? wk !== -1 && wk < state.backEditIdx : m.isDead && !isWin;
  return isDead ? h.baseAmount : h.baseAmount - data.bid;
}

function isMemberDead(h, m, isBack) {
  const isWin = getActiveData(h).winnerId == m.id;
  const wk = h.history.findIndex((hi) => hi.winnerId == m.id);
  return isBack ? wk !== -1 && wk < state.backEditIdx : m.isDead && !isWin;
}

function renderMain() {
  const h = getHui();
  const isBack = state.backEditIdx !== null;
  const data = getActiveData(h);
  const container = $("main-member-list");
  let html = "";
  let totalColl = 0;

  // Sắp xếp: người hốt lên đầu, hụi chết xuống cuối
  const sorted = [...h.members].sort((a, b) => {
    const aIsWin  = data.winnerId == a.id;
    const bIsWin  = data.winnerId == b.id;
    const aIsDead = isMemberDead(h, a, isBack);
    const bIsDead = isMemberDead(h, b, isBack);
    if (aIsWin && !bIsWin) return -1;
    if (!aIsWin && bIsWin) return 1;
    if (aIsDead && !bIsDead) return 1;
    if (!aIsDead && bIsDead) return -1;
    return 0;
  });

  sorted.forEach((m) => {
    const isWin  = data.winnerId == m.id;
    const isDead = isMemberDead(h, m, isBack);
    const pay    = calcMemberPay(h, data, m, isBack);

    if (!isWin && m.hasPaid) totalColl += pay;

    let deadBidText = "";
    if (isDead) {
      const winRec = h.history.find((hi) => hi.winnerId == m.id);
      if (winRec) deadBidText = `<span class="text-[10px] font-normal opacity-60 ml-1">(-${formatC(winRec.bid)})</span>`;
    }

    const badgeClass = isWin ? "badge-hot" : isDead ? "badge-chet" : "badge-song";
    const badgeText  = isWin ? "ĐANG HỐT" : isDead ? "HỤI CHẾT" : "HỤI SỐNG";
    const cardClass  = isWin ? "is-winner-active" : isDead ? "card-chet" : "card-song";
    const payColor   = isWin ? "text-orange-600" : "text-slate-700";
    const hasSettings = data.winnerId && data.bid > 0;
    const payLabel = isWin ? "THỰC NHẬN"
      : m.hasPaid ? "XONG ✅"
      : hasSettings ? "CẦN THU"
      : "";

    html += `
    <div ondblclick="handleMemberClick(${m.id})"
         class="hui-card p-5 flex items-center justify-between ${cardClass} ${m.hasPaid ? "da-dong" : ""}">
      ${m.hasPaid && !isWin ? '<div class="stamp-done"></div>' : ""}
      <div class="status-badge ${badgeClass}">${badgeText}</div>
      <div class="flex-1 mt-2 pr-2 overflow-hidden">
        <div class="card-marquee-wrapper">
          <p class="card-marquee-text uppercase text-lg font-black text-blue-900 leading-tight" data-marquee>${escHtml(m.name)}${deadBidText}</p>
        </div>
        <div class="flex items-center gap-1 mt-1 text-[10px] font-bold text-slate-500 italic overflow-hidden">
          ${m.phone ? `<span class="shrink-0">📞 ${escHtml(m.phone)}</span>` : ""}
          ${m.phone && m.address ? `<span class="shrink-0 opacity-40">·</span>` : ""}
          ${m.address ? `<span class="card-marquee-wrapper flex-1"><span class="card-marquee-text" data-marquee>📍 ${escHtml(m.address)}</span></span>` : ""}
          ${!m.phone && !m.address ? `<span class="opacity-40">---</span>` : ""}
        </div>
      </div>
      ${isWin ? '<div class="moc-tron-red">HỐT</div>' : ""}
      <div class="text-right shrink-0 ml-2">
        <p class="text-lg font-black ${payColor}">${(hasSettings || isWin || m.hasPaid) ? formatC(pay) : "---"}</p>
        ${payLabel ? `<p class="text-[9px] font-bold opacity-50 uppercase">${payLabel}</p>` : ""}
      </div>
    </div>`;
  });

  container.innerHTML = html;
  $("display-collected").innerText = formatC(totalColl);

  // Kích hoạt marquee cho các card quá dài
  requestAnimationFrame(() => {
    container.querySelectorAll("[data-marquee]").forEach((el) => {
      const wrapper = el.parentElement;
      if (el.scrollWidth > wrapper.clientWidth) {
        el.classList.add("scrolling");
      }
    });
  });
}

// ============================================================
// 8. MEMBER CLICK / CONFIRM PAY
// ============================================================
function handleMemberClick(mId) {
  const h = getHui();
  const isBack = state.backEditIdx !== null;
  const data = getActiveData(h);
  const m = h.members.find((x) => x.id == mId);
  if (!data.winnerId) { showToast("Vui lòng chọn người hốt trong Cài đặt ⚙️ trước!", "warn"); return; }

  const isWin = data.winnerId == m.id;

  // Khi tap vào người hốt: kiểm tra ngay trước khi mở popup
  if (isWin && !isBack) {
    const unpaid = h.members.filter((x) => x.id != m.id && !x.hasPaid);
    if (unpaid.length > 0) {
      const names = unpaid.map((x) => `• ${x.name}`).join("\n");
      showUnpaidWarning(unpaid.length, names);
      return;
    }
  }

  const amt = calcMemberPay(h, data, m, isBack);

  // Label trên số tiền
  const isLastKy = h.currentKỳ === h.members.length;
  if (isWin) {
    $("conf-label").innerText = "XÁC NHẬN GIAO HỤI";
    $("conf-sublabel").innerText = "THỰC NHẬN";
    $("conf-sublabel").classList.remove("hidden");
  } else {
    $("conf-label").innerText = "XÁC NHẬN THU TIỀN";
    $("conf-sublabel").classList.add("hidden");
  }

  $("conf-name").innerText = m.name;
  $("conf-amount").innerText = formatC(amt);

  const btn = $("btn-confirm-action");
  btn.innerText = isWin ? "GIAO HỤI (LƯU)" : m.hasPaid ? "HỦY TRẠNG THÁI" : "ĐÃ THU TIỀN";
  btn.className = `flex-1 py-4 text-white rounded-xl font-black text-[10px] uppercase ${
    isWin ? "bg-orange-600" : m.hasPaid ? "bg-red-600" : "bg-green-600"
  }`;

  btn.onclick = () => {
    if (isWin) {
      if (isBack) return;
      finishPeriod();
    } else {
      m.hasPaid = !m.hasPaid;
    }
    save();
    hideModal("modal-confirm-pay");
    updateUI();
  };

  showModal("modal-confirm-pay");
}

function showUnpaidWarning(count, nameList) {
  $("unpaid-count").innerText = count;
  $("unpaid-names").innerText = nameList;
  showModal("modal-unpaid-warning");
}

function finishPeriod() {
  const h = getHui();
  h.history.push({
    kỳ: h.currentKỳ,
    winnerId: h.winnerId,
    bid: h.bid,
    commission: h.commission || 0,
    date: h.date,
  });

  if (h.currentKỳ >= h.members.length) {
    h.isFinished = true;
  } else {
    h.currentKỳ++;
    h.winnerId = null;
    h.bid = 0;
    h.commission = 0;
    h.members.forEach((m) => (m.hasPaid = false));
  }
}

// ============================================================
// 9. MEMBER MANAGEMENT
// ============================================================
function showMemberPopup() {
  resetMemberForm();
  renderPopupMembers();
  showModal("modal-members");
}

function renderPopupMembers() {
  const h = getHui();
  $("popup-member-list").innerHTML = h.members.length
    ? h.members
        .map(
          (m) => `
      <div class="bg-white p-4 rounded-xl border flex justify-between items-center shadow-sm">
        <div class="overflow-hidden flex-1 mr-2">
          <p class="font-black uppercase text-xs text-blue-900 truncate">${escHtml(m.name)}</p>
          <p class="text-[9px] text-slate-400 font-bold">${escHtml(m.phone || "")}</p>
        </div>
        <button onclick="editMember(${m.id})" class="bg-blue-50 text-blue-600 p-2 rounded-lg text-xs font-bold shrink-0">✏️ Sửa</button>
      </div>`
        )
        .join("")
    : `<p class="text-center py-10 opacity-30 font-black text-[10px] uppercase">Chưa có hội viên</p>`;
}

function addOrUpdateMember() {
  const name = $("mem-name").value.trim();
  if (!name) { showToast("Phải nhập tên hội viên!", "warn"); return; }
  const h = getHui();
  h.members.push({
    id: Date.now(),
    name,
    phone: $("mem-phone").value.trim(),
    address: $("mem-address").value.trim(),
    isDead: false,
    hasPaid: false,
  });
  save();
  renderPopupMembers();
  updateUI();
  resetMemberForm();
  $("mem-name").focus();
}

function editMember(id) {
  const h = getHui();
  const m = h.members.find((x) => x.id == id);
  state.editingMemberId = id;
  $("mem-name").value = m.name;
  $("mem-phone").value = m.phone || "";
  $("mem-address").value = m.address || "";
  $("member-actions-add").classList.add("hidden");
  $("member-actions-edit").classList.remove("hidden");
  $("mem-name").focus();
}

function saveEditMember() {
  const h = getHui();
  const m = h.members.find((x) => x.id == state.editingMemberId);
  if (!m) return;
  m.name = $("mem-name").value.trim();
  m.phone = $("mem-phone").value.trim();
  m.address = $("mem-address").value.trim();
  save();
  resetMemberForm();
  renderPopupMembers();
  updateUI();
}

function deleteCurrentEditMember() {
  showConfirmPopup("Xóa hội viên này khỏi dây hụi?", () => {
    const h = getHui();
    h.members = h.members.filter((m) => m.id != state.editingMemberId);
    save(); resetMemberForm(); renderPopupMembers(); updateUI();
    showToast("Đã xóa hội viên", "success");
  }, "Xóa", "bg-red-600");
}

function resetMemberForm() {
  state.editingMemberId = null;
  ["mem-name", "mem-phone", "mem-address"].forEach((id) => ($(id).value = ""));
  $("name-dropdown").style.display = "none";
  $("address-dropdown").style.display = "none";
  $("member-actions-add").classList.remove("hidden");
  $("member-actions-edit").classList.add("hidden");
}

// ============================================================
// 10. SETTINGS
// ============================================================
function isLastMember(h) {
  // Chỉ còn 1 người hụi sống (chưa hốt)
  const aliveCount = h.members.filter((m) => !m.isDead).length;
  return aliveCount === 1;
}

function showSettingsPopup() {
  const h = getHui();
  const target = getActiveData(h);
  const lastMember = isLastMember(h);

  $("set-cur-ky").innerText = `${state.backEditIdx !== null ? target.kỳ : h.currentKỳ} / ${h.members.length}`;

  // Người hốt cuối cùng: ô tiền thăm disabled, hiện chữ thay thế
  const bidInput = $("set-bid");
  const bidLabel = $("set-bid-label");
  if (lastMember && state.backEditIdx === null) {
    bidInput.value = "";
    bidInput.disabled = true;
    bidInput.placeholder = "Người hốt cuối cùng";
    bidInput.classList.add("opacity-50", "cursor-not-allowed");
    if (bidLabel) bidLabel.innerText = "Tiền thăm (cuối kỳ = 0)";
  } else {
    bidInput.disabled = false;
    bidInput.placeholder = "0";
    bidInput.classList.remove("opacity-50", "cursor-not-allowed");
    bidInput.value = target.bid ? target.bid.toLocaleString("vi-VN").replace(/,/g, ".") : "";
    if (bidLabel) bidLabel.innerText = "Tiền thăm kỳ này";
  }

  $("set-commission").value = (() => {
    const val = target.commission || getLastCommission();
    return val ? val.toLocaleString("vi-VN").replace(/,/g, ".") : "";
  })();
  $("set-date").value = target.date || "";
  $("set-cycle").value = h.cycle || 30;

  const sel = $("set-winner");
  sel.innerHTML = '<option value="">-- CHỌN NGƯỜI HỐT --</option>';
  const eligibleMembers = [];
  h.members.forEach((m) => {
    const wk = h.history.findIndex((hi) => hi.winnerId == m.id);
    const eligible = state.backEditIdx !== null ? wk === -1 || wk >= state.backEditIdx : !m.isDead;
    if (eligible || target.winnerId == m.id) {
      eligibleMembers.push(m);
      sel.innerHTML += `<option value="${m.id}" ${target.winnerId == m.id ? "selected" : ""}>${escHtml(m.name)}</option>`;
    }
  });
  // Nếu chỉ còn 1 người sống → tự chọn luôn
  if (lastMember && eligibleMembers.length === 1 && !target.winnerId) {
    sel.value = eligibleMembers[0].id;
  }

  $("btn-save-settings").onclick = () => {
    const oldW = h.members.find((m) => m.id == target.winnerId);
    if (oldW) oldW.isDead = false;

    // Người hốt cuối: bid = 0
    target.bid = (lastMember && state.backEditIdx === null) ? 0 : parseC($("set-bid").value);
    target.commission = parseC($("set-commission").value);
    saveLastCommission(target.commission);
    target.date = $("set-date").value;
    target.winnerId = sel.value ? Number(sel.value) : null;
    h.cycle = $("set-cycle").value;

    const newW = h.members.find((m) => m.id == target.winnerId);
    if (newW) newW.isDead = true;

    save();
    hideModal("modal-settings");
    updateUI();
  };

  showModal("modal-settings");
}

// ============================================================
// 11. HISTORY
// ============================================================
function showHistoryManager() {
  const h = getHui();
  const c = $("history-edit-list");
  c.innerHTML = h.history.length
    ? h.history
        .map((hi, idx) => {
          const winner = h.members.find((m) => m.id == hi.winnerId);
          // Tính thực nhận kỳ đó
          let thucNhan = 0;
          if (winner) {
            const sCount = h.members.filter((x) => {
              const wk = h.history.findIndex((r) => r.winnerId == x.id);
              return (wk === -1 || wk >= idx) && x.id != winner.id;
            }).length;
            thucNhan =
              sCount * (h.baseAmount - hi.bid) +
              (h.members.length - 1 - sCount) * h.baseAmount -
              (hi.commission || 0);
          }
          return `
      <div onclick="viewHistoryKy(${idx})"
           class="p-4 bg-slate-50 border rounded-2xl active:bg-blue-50 cursor-pointer transition-colors">
        <div class="flex justify-between items-center mb-2">
          <span class="font-black text-sm text-blue-900">Kỳ ${hi.kỳ}</span>
          <span class="text-[10px] opacity-60 font-black">${fmtD(hi.date)}</span>
        </div>
        ${winner ? `
        <div class="bg-white rounded-xl p-3 border border-blue-100 space-y-1">
          <p class="font-black uppercase text-xs text-orange-600">🏆 ${escHtml(winner.name)}</p>
          <div class="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
            <span>Tiền kêu</span><span class="text-red-500">${formatC(hi.bid)}</span>
          </div>
          <div class="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
            <span>Tiền cò</span><span class="text-slate-600">${formatC(hi.commission || 0)}</span>
          </div>
          <div class="flex justify-between text-[10px] font-black uppercase border-t pt-1 mt-1">
            <span class="text-green-700">Thực nhận</span><span class="text-green-600">${formatC(thucNhan)}</span>
          </div>
        </div>` : `<p class="text-[10px] text-slate-400 italic">Không có thông tin người hốt</p>`}
      </div>`;
        })
        .join("")
    : `<p class="text-center py-10 opacity-30 font-black text-[10px] uppercase">Chưa có lịch sử</p>`;

  showModal("modal-history-manager");
}

function viewHistoryKy(idx) {
  state.backEditIdx = idx;
  hideModal("modal-history-manager");
  updateUI();
}

// ============================================================
// 12. EXPORT / IMPORT
// ============================================================
function exportData() {
  const timestamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(state.allHuis, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `hui_backup_${timestamp}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importData(e) {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = (ex) => {
    try {
      state.allHuis = JSON.parse(ex.target.result);
      save(); renderHuiList(); showToast("Khôi phục dữ liệu thành công!", "success");
    } catch { showToast("File không hợp lệ!", "error"); }
  };
  r.readAsText(f);
  e.target.value = "";
}

// ============================================================
// 13. CLOSE DROPDOWNS ON OUTSIDE CLICK
// ============================================================
document.addEventListener("click", (e) => {
  if (!e.target.closest("#mem-name") && !e.target.closest("#name-dropdown")) {
    $("name-dropdown").style.display = "none";
  }
  if (!e.target.closest("#mem-address") && !e.target.closest("#address-dropdown")) {
    $("address-dropdown").style.display = "none";
  }
});

// ============================================================
// 14. INIT - khôi phục màn hình sau F5
// ============================================================
window.addEventListener("DOMContentLoaded", () => {
  loadData();
  const savedId = parseInt(sessionStorage.getItem("hui_cur_id") || "0");
  if (savedId && state.allHuis.find((h) => h.id === savedId)) {
    state.curId = savedId;
    showScreen("detail");
    updateUI();
  } else {
    renderHuiList();
  }
  // Tự đăng nhập lại Drive nếu đã từng đăng nhập
  setTimeout(driveInitSilent, 1500);
});

// ============================================================
// 14b. TOAST POPUP (thay thế alert)
// ============================================================
function showToast(msg, type = "info", duration = 3000) {
  const colors = { info: "bg-blue-600", success: "bg-green-600", error: "bg-red-600", warn: "bg-orange-500" };
  const icons  = { info: "ℹ️", success: "✅", error: "❌", warn: "⚠️" };
  const t = document.createElement("div");
  t.className = `fixed top-6 left-1/2 z-[999] px-5 py-3 rounded-2xl shadow-2xl
    flex items-center gap-3 text-white font-black text-xs uppercase max-w-[90vw]
    ${colors[type]} transition-all duration-300 opacity-0 scale-90`;
  t.style.transform = "translateX(-50%) scale(0.9)";
  t.innerHTML = `<span class="text-base">${icons[type]}</span><span>${msg}</span>`;
  document.body.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translateX(-50%) scale(1)"; });
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateX(-50%) scale(0.9)";
    setTimeout(() => t.remove(), 300);
  }, duration);
}

function showConfirmPopup(msg, onConfirm, confirmLabel = "Xác nhận", confirmColor = "bg-blue-600") {
  $("generic-confirm-msg").innerText = msg;
  const btn = $("generic-confirm-btn");
  btn.innerText = confirmLabel;
  btn.className = `flex-1 py-4 text-white rounded-xl font-black text-[10px] uppercase ${confirmColor}`;
  btn.onclick = () => { hideModal("modal-generic-confirm"); onConfirm(); };
  showModal("modal-generic-confirm");
}
