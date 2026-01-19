const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyrwZsXdVRvz1kOmBu9WeVu7lwSbNaKJB8PgfvX1jCFEwgck-QMLgjoKJOUm1--0dr_CQ/exec";
const CLASS_COORDS = { lat: 26.874445, lng: 84.510308 };
const MAX_DIST = 350;
let currentLockState = "";

// --- SECURE SPATIAL FINGERPRINT ---
let smoothedAlpha = null;
const ROOM_60_ANGLE = 200;
const ANGLE_TOLERANCE = 40;
let floorVerified = false;

async function checkPhysicalFloor() {
  const magDisplay = document.getElementById("debug-mag");
  const pingArea = document.getElementById("ping-area");
  const needle = document.getElementById("compass-needle");

  if (window.DeviceOrientationEvent) {
    // Removed {once: true} to allow smooth, normal compass behavior
    window.addEventListener("deviceorientationabsolute", (event) => {
      if (event.alpha !== null) {
        if (pingArea) pingArea.classList.add("hidden");

        let liveAlpha = event.alpha;

        // 2. DATA SMOOTHING
        if (smoothedAlpha === null) {
          smoothedAlpha = liveAlpha;
        } else {
          let diff = liveAlpha - smoothedAlpha;
          if (diff > 180) diff -= 360;
          if (diff < -180) diff += 360;

          // ADAPTIVE SPEED: Normal speed (0.3) vs Stable near 200° (0.05)
          let dist = Math.abs(liveAlpha - ROOM_60_ANGLE);
          if (dist > 180) dist = 360 - dist;
          let lerpFactor = dist < 30 ? 0.05 : 0.3;

          smoothedAlpha += diff * lerpFactor;
        }

        const finalHeading = Math.round((smoothedAlpha + 360) % 360);
        magDisplay.innerText = finalHeading;

        // Update rotating needle
        if (needle) needle.style.transform = `rotate(${finalHeading}deg)`;

        // 3. SECURE CALCULATION
        let checkDiff = Math.abs(finalHeading - ROOM_60_ANGLE);
        if (checkDiff > 180) checkDiff = 360 - checkDiff;

        if (checkDiff <= ANGLE_TOLERANCE) {
          floorVerified = true;
          magDisplay.parentElement.className = "text-brandGreen font-bold";
        } else {
          floorVerified = false;
          magDisplay.parentElement.className = "text-white";
        }
      } else {
        magDisplay.innerText = "LAPTOP";
        if (pingArea) pingArea.classList.remove("hidden");
        floorVerified = true; // Laptops bypass compass
      }
      if (typeof updateLogic === "function") updateLogic();
    });
  }
}
// Start compass engine
checkPhysicalFloor();
async function runPingFallback() {
  const start = Date.now();
  const pingDisplay = document.getElementById("debug-ping");
  try {
   
    await fetch("https://connectivitycheck.gstatic.com/generate_204", {
      mode: "no-cors",
      cache: "no-store",
    });
    const latency = Date.now() - start;
    if (pingDisplay) pingDisplay.innerText = latency;
    return latency < 150;
  } catch (e) {
    if (pingDisplay) pingDisplay.innerText = "ERR";
    return false;
  }
}

// --- THE PING TRIGGER ---
setInterval(async () => {
  const isFast = await runPingFallback();
  // If it's a laptop, let the Ping result control the floor lock
  if (document.getElementById("debug-mag").innerText === "LAPTOP") {
    floorVerified = isFast;
    if (typeof updateLogic === "function") updateLogic();
  }
}, 3000);
setInterval(checkPhysicalFloor, 3000);

const PERMANENT_KEY = "GECWC2026";

function checkQRVerification() {
  const urlParams = new URLSearchParams(window.location.search);
  const scannedKey = urlParams.get("vault");

  if (scannedKey === PERMANENT_KEY) {
    localStorage.setItem("qr_verified_at", Date.now());

    window.history.replaceState({}, document.title, window.location.pathname);
    return true;
  }

  // Check if they scanned recently
  const lastScan = localStorage.getItem("qr_verified_at");
  if (lastScan && Date.now() - lastScan < 300000) {
    return true;
  }
  return false;
}
let userPos = { lat: 0, lon: 0 };
let wasInRange = false;
let hapticsPrimed = false;
let allNotices = [];
let securityDisplayMode = "GPS"; // Switch for alternating messages
let lastLockMessage = "";

async function fetchAdminNotice() {
  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "getNotice" }),
    });
    const data = await res.json();
    const notices = data.notices || [];

    if (notices.length > 0) {
     
      const latest = notices[notices.length - 1];

      // Create a unique ID based on message text so we know if they've seen THIS specific one
      const noticeId = btoa(latest.msg.substring(0, 15)).replace(/=/g, "");

      // 2. Check LocalStorage
      if (localStorage.getItem("dismissed_" + noticeId)) {
        console.log("Latest notice already dismissed by user.");
        // Populate history modal even if main card is hidden
        renderHistoryModal(notices);
        return;
      }

      const gridContainer = document.getElementById("noticeGrid");
      const gridItems = document.getElementById("gridItems");

      gridContainer.classList.remove("hidden");
      gridItems.innerHTML = `
                <div id="active-notice-card" class="relative bg-white dark:bg-darkSurface border-2 border-brandBlue/30 p-5 rounded-[2rem] shadow-2xl animate-slide-up z-[60]">
                    <button id="close-notice-btn" 
                            class="absolute top-3 right-3 w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 hover:text-brandRed transition-all active:scale-90 z-[70]">
                        <i class="fas fa-times text-lg"></i>
                    </button>

                    <div class="flex items-center gap-3 mb-2 pr-10">
                        <div class="w-10 h-10 rounded-2xl bg-brandBlue/10 flex items-center justify-center text-brandBlue">
                            <i class="fas fa-${latest.icon || "bell"} text-lg"></i>
                        </div>
                        <span class="text-[10px] font-black uppercase tracking-widest text-brandBlue">Important Update</span>
                    </div>

                    <p class="text-sm font-bold text-slate-900 dark:text-white leading-relaxed pr-2">${latest.msg}</p>
                    
                    ${
                      latest.link !== "#"
                        ? `
                        <a href="${latest.link}" target="_blank" class="mt-3 inline-flex items-center gap-2 text-[11px] font-black text-brandBlue uppercase tracking-tighter hover:gap-3 transition-all">
                            View Attachment <i class="fas fa-arrow-right"></i>
                        </a>
                    `
                        : ""
                    }
                </div>
            `;

     
      document
        .getElementById("close-notice-btn")
        .addEventListener("click", () => {
          const card = document.getElementById("active-notice-card");
          card.style.transform = "translateY(-20px)";
          card.style.opacity = "0";
          card.style.transition = "0.3s ease";

          localStorage.setItem("dismissed_" + noticeId, "true");

          setTimeout(() => {
            gridContainer.classList.add("hidden");
          }, 300);
        });

      renderHistoryModal(notices);
      document.getElementById("notif-badge")?.classList.remove("hidden");
    }
  } catch (err) {
    console.warn("Notice Sync Error");
  }
}
// Fixed Dismiss Function
function dismissNotice(noticeId) {
  const gridContainer = document.getElementById("noticeGrid");

  // Apply exit animation
  gridContainer.style.transition = "all 0.4s ease";
  gridContainer.style.opacity = "0";
  gridContainer.style.transform = "translateY(-20px) scale(0.95)";

  // Save to permanent memory
  localStorage.setItem("hide_notice_" + noticeId, "true");

  // Remove from view
  setTimeout(() => {
    gridContainer.classList.add("hidden");
  }, 400);
}


function dismissNotice(noticeId) {
  const gridContainer = document.getElementById("noticeGrid");
  gridContainer.style.opacity = "0";
  gridContainer.style.transform = "translateY(-10px)";

  setTimeout(() => {
    gridContainer.classList.add("hidden");
    // Save to localStorage so it never shows again on the main screen
    localStorage.setItem("seen_notice_" + noticeId, "true");
  }, 400);
}

function dismissNotice(cardId, storageKey) {
  const card = document.getElementById(cardId);
  // Animation for dismissal
  card.style.transform = "scale(0.9) translateY(-10px)";
  card.style.opacity = "0";

  setTimeout(() => {
    card.remove();
    sessionStorage.setItem("dismissed_" + storageKey, "true");

    // If no cards left, hide the grid container
    const gridItems = document.getElementById("gridItems");
    if (gridItems.children.length === 0) {
      document.getElementById("noticeGrid").classList.add("hidden");
    }
  }, 3000);
}

function renderHistoryModal(notices) {
  const list = document.getElementById("historyList");
  if (!list) return;
  list.innerHTML = "";

  
  [...notices].reverse().forEach((n) => {
    const item = document.createElement("div");
    item.className =
      "p-4 rounded-2xl bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 flex items-start gap-4 mb-2";
    item.innerHTML = `
            <div class="mt-1 text-brandBlue"><i class="fas fa-${n.icon}"></i></div>
            <div>
                <p class="text-sm font-bold text-slate-900 dark:text-white">${n.msg}</p>
                ${n.link !== "#" ? `<a href="${n.link}" target="_blank" class="text-[10px] text-brandBlue font-bold uppercase mt-1 inline-block">View Link <i class="fas fa-external-link-alt ml-1"></i></a>` : ""}
            </div>`;
    list.appendChild(item);
  });
}

// Modal Control Functions
function openHistory(e) {
  if (e) e.preventDefault();
  document.getElementById("historyModal").classList.remove("hidden");
}

function closeHistory() {
  document.getElementById("historyModal").classList.add("hidden");
}

function openHistory(e) {
  if (e) e.preventDefault();
  document.getElementById("historyModal").classList.remove("hidden");
}
function closeHistory() {
  document.getElementById("historyModal").classList.add("hidden");
}

function showGPSStatus() {
  const statusText = document.getElementById("gps-text").innerText;
  const isError = statusText.includes("ERROR") || statusText.includes("IDLE");

  showNotify(`GPS Status: ${statusText}`, isError ? "error" : "success");
  if ("vibrate" in navigator) navigator.vibrate(30);
}

function showGPSStatus() {
  const statusText = document.getElementById("gps-text").innerText;
  const isError = statusText.includes("ERROR") || statusText.includes("IDLE");
  showNotify(`GPS Status: ${statusText}`, isError ? "error" : "success");
  if ("vibrate" in navigator) navigator.vibrate(20);
}


function renderLocalLogs() {
  const list = document.getElementById("localLogsList");
  const noLogsMsg = document.getElementById("noLogsMsg");
  const logs = JSON.parse(
    localStorage.getItem("my_attendance_history") || "[]",
  );

  if (logs.length === 0) {
    noLogsMsg.classList.remove("hidden");
    return;
  }

  noLogsMsg.classList.add("hidden");
  list.querySelectorAll(".log-card").forEach((el) => el.remove());

  logs
    .slice(-3)
    .reverse()
    .forEach((log, index) => {
      const card = document.createElement("div");
      card.className =
        "log-card p-5 rounded-3xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-100 dark:border-zinc-800 animate-slide-up relative group";
      card.innerHTML = `
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-[9px] font-black text-brandGreen bg-brandGreen/10 px-2 py-0.5 rounded-full uppercase">Verified</span>
                        <span class="text-[10px] text-slate-400 font-medium">${log.time}</span>
                    </div>
                    <p class="text-sm font-bold text-slate-900 dark:text-white truncate">${log.name}</p>
                    <p class="text-[10px] text-slate-500 mb-4 uppercase tracking-wider">Roll: ${log.roll} • Room: ${log.room}</p>
                    
                    <button onclick="shareReceipt('${log.name}', '${log.roll}', '${log.time}', '${log.room}')" 
                            class="w-full py-2 bg-brandBlue/10 hover:bg-brandBlue text-brandBlue hover:text-white text-[10px] font-bold rounded-xl transition-all uppercase tracking-widest flex items-center justify-center gap-2">
                        <i class="fas fa-share-nodes"></i> Share Receipt
                    </button>
                `;
      list.appendChild(card);
    });
}

// The Sharing Function
async function shareReceipt(name, roll, time, room) {
  const shareData = {
    title: "Attendance Receipt",
    text: `✅ *Attendance Verified*\n\n👤 Name: ${name}\n🆔 Roll: ${roll}\n📍 Room: ${room}\n⏰ Time: ${time}\n\n_Generated by GEC WC Smart Portal_`,
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      // Fallback: Copy to clipboard if sharing is not supported
      await navigator.clipboard.writeText(shareData.text);
      showNotify("Receipt copied to clipboard!", "success");
    }
  } catch (err) {
    console.log("Sharing failed", err);
  }
}

// Add a new log to memory
function saveLogLocally(name, roll, room) {
  const logs = JSON.parse(
    localStorage.getItem("my_attendance_history") || "[]",
  );
  const newLog = {
    name: name,
    roll: roll,
    room: room,
    time: new Date().toLocaleString([], {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "short",
    }),
  };
  logs.push(newLog);
  localStorage.setItem("my_attendance_history", JSON.stringify(logs));
  renderLocalLogs();
}

function clearMyHistory() {
  document.getElementById("clearConfirmModal").classList.remove("hidden");
  if ("vibrate" in navigator) navigator.vibrate(50);
}

function closeClearModal() {
  document.getElementById("clearConfirmModal").classList.add("hidden");
}

function executeClearHistory() {
  localStorage.removeItem("my_attendance_history");
  closeClearModal();
  renderLocalLogs(); // Refreshes the UI to show "No logs"
  showNotify("History cleared successfully", "success");
  if ("vibrate" in navigator) navigator.vibrate([50, 30, 50]);
}

renderLocalLogs();

fetchAdminNotice();
//  TIME TOKEN GENERATOR ---
function generateToken() {
  const now = new Date();
  const timeStr = now.getHours().toString() + now.getMinutes().toString();
  // Salt must match backend salt exactly
  return btoa(timeStr + "GECWC_PRIVATE_SALT").substring(0, 8);
}

function primeHaptics() {
  if (!hapticsPrimed && "vibrate" in navigator) {
    navigator.vibrate(1);
    hapticsPrimed = true;
  }
}

function toggleTheme() {
  const html = document.documentElement;
  const icon = document.getElementById("theme-icon");
  if (html.classList.contains("dark")) {
    html.classList.remove("dark");
    icon.className = "fas fa-sun";
    localStorage.setItem("theme", "light");
  } else {
    html.classList.add("dark");
    icon.className = "fas fa-moon";
    localStorage.setItem("theme", "dark");
  }
}

if (localStorage.getItem("theme") === "light") {
  document.documentElement.classList.remove("dark");
  document.getElementById("theme-icon").className = "fas fa-sun";
}

function showNotify(msg, type = "info") {
  const n = document.getElementById("notification");
  const c = document.getElementById("notifyContent");
  n.classList.remove("opacity-0", "-translate-y-2", "pointer-events-none");
  n.classList.add("opacity-100", "translate-y-0");

  let bg =
    "bg-white/90 dark:bg-zinc-900/90 border-slate-200 dark:border-zinc-700 text-zinc-900 dark:text-white";
  if (type === "success")
    bg = "bg-brandGreen/20 border-brandGreen/50 text-brandGreen";
  if (type === "error") bg = "bg-brandRed/20 border-brandRed/50 text-brandRed";
  if (type === "info")
    bg = "bg-brandBlue/20 border-brandBlue/50 text-brandBlue";

  c.className = `px-6 py-4 rounded-2xl shadow-2xl font-bold text-sm border backdrop-blur-md ${bg}`;
  c.innerText = msg;

  setTimeout(() => {
    n.classList.add("opacity-0", "-translate-y-2", "pointer-events-none");
    n.classList.remove("opacity-100", "translate-y-0");
  }, 3500);
}

const map = L.map("map", {
  zoomControl: false,
  attributionControl: false,
}).setView([CLASS_COORDS.lat, CLASS_COORDS.lng], 19);
L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
).addTo(map);

L.circle([CLASS_COORDS.lat, CLASS_COORDS.lng], {
  color: "#2563eb",
  radius: MAX_DIST,
  weight: 1,
  fillOpacity: 0.1,
}).addTo(map);

let userMarker;

navigator.geolocation.watchPosition(
  (pos) => {
    userPos.lat = pos.coords.latitude;
    userPos.lon = pos.coords.longitude;

    // 1. GPS INDICATORS
    const dot = document.getElementById("gps-dot");
    const ping = document.getElementById("gps-ping");
    const txt = document.getElementById("gps-text");
    dot.className =
      "relative inline-flex rounded-full h-2.5 w-2.5 bg-brandGreen";
    ping.classList.remove("hidden");
    txt.innerText = "GPS ACTIVE";

    // 2. MAP & MARKER
    if (!userMarker) {
      userMarker = L.circleMarker([userPos.lat, userPos.lon], {
        radius: 9,
        color: "#2563eb",
        fillColor: "#2563eb",
        fillOpacity: 1,
      }).addTo(map);
      map.setView([userPos.lat, userPos.lon], 19);
    } else {
      userMarker.setLatLng([userPos.lat, userPos.lon]);
    }

    function startAutomaticGPS() {
      const options = {
        enableHighAccuracy: true,
        maximumAge: 0, // Force fresh data (don't use cache)
        timeout: Infinity, // Don't give up if the satellite is slow
      };

      navigator.geolocation.watchPosition(
        (pos) => {
          userPos.lat = pos.coords.latitude;
          userPos.lon = pos.coords.longitude;

          // Update your UI here
          document.getElementById("gps-text").innerText = "GPS ACTIVE";
          document.getElementById("gps-dot").className =
            "relative inline-flex rounded-full h-2.5 w-2.5 bg-brandGreen";

          // Call your logic to check distance
          updateLogic();
        },
        (err) => {
          console.warn("GPS Waiting...");
          if (err.code !== 3) {
            document.getElementById("gps-text").innerText =
              "GPS ERROR: " + err.message;
          }
        },
        options,
      );
    }

    startAutomaticGPS();
    const dist = calculateDistance(
      userPos.lat,
      userPos.lon,
      CLASS_COORDS.lat,
      CLASS_COORDS.lng,
    );
    const isScanned = checkQRVerification();

    // 4. UPDATE GAUGE UI
    document.getElementById("liveDist").innerHTML =
      `${Math.round(dist)}<span class="text-xl font-medium text-slate-400 dark:text-zinc-600 ml-1">m</span>`;
    const percentage = Math.max(0, 100 - dist * (100 / MAX_DIST));
    document.getElementById("distBar").style.width = `${percentage}%`;

    const bar = document.getElementById("distBar");
    const tag = document.getElementById("range-tag");
    const lockMsg = document.getElementById("lockMessage");
    const entryForm = document.getElementById("entryForm");

    if (dist > MAX_DIST) {
      // LAYER 1: GPS FAIL (Red)
      bar.className = "dist-gauge h-full bg-brandRed";
      tag.innerText = "ACCESS DENIED";
      tag.className =
        "text-[10px] font-bold px-2 py-0.5 rounded-md bg-brandRed/10 text-brandRed border border-brandRed/20";

      entryForm.classList.add("hidden");
      lockMsg.classList.remove("hidden");
      updateLockUI(
        "OUT OF RANGE",
        `Move closer to Room 60 (${Math.round(dist)}m)`,
        "fa-location-dot",
        "text-brandRed",
      );
    } else if (!isScanned) {
      // LAYER 2: QR FAIL (Blue)
      bar.className = "dist-gauge h-full bg-brandBlue";
      tag.innerText = "SCAN REQUIRED";
      tag.className =
        "text-[10px] font-bold px-2 py-0.5 rounded-md bg-brandBlue/10 text-brandBlue border border-brandBlue/20";

      entryForm.classList.add("hidden");
      lockMsg.classList.remove("hidden");
     
      updateLockUI(
        "SCAN QR CODE",
        "Please Scan the Qr code..",
        "fa-qrcode",
        "text-brandBlue",
        true,
      );
    } else if (!floorVerified) {
      // Current state: Orange/Yellow warning
      bar.className = "dist-gauge h-full bg-yellow-500";
      tag.innerText = "FLOOR SECURITY";
      tag.className =
        "text-[10px] font-bold px-2 py-0.5 rounded-md bg-yellow-500/10 text-yellow-500 border border-yellow-500/20";

      entryForm.classList.add("hidden");
      lockMsg.classList.remove("hidden");

 
      updateLockUI(
        "VERIFYING FLOOR",
        "Hold phone steady infront of QR",
        "fa-layer-group",
        "text-yellow-500",
        false,
        true,
      );
    } else {
      // ALL PASS (Green)
      bar.className = "dist-gauge h-full bg-brandGreen";
      tag.innerText = "IN CLASS VERIFIED";
      tag.className =
        "text-[10px] font-bold px-2 py-0.5 rounded-md bg-brandGreen/10 text-brandGreen border border-brandGreen/20";

      lockMsg.classList.add("hidden");
      entryForm.classList.remove("hidden");
    }
    function updateLockUI(
      title,
      sub,
      icon,
      colorClass,
      pulse = false,
      bounce = false,
    ) {
      const lockMsg = document.getElementById("lockMessage");
      const newStateId = `${title}-${colorClass}`;

      if (currentLockState === newStateId) return;
      currentLockState = newStateId;

      let actionButton = "";
      if (title === "SCAN QR CODE") {
        actionButton = `
            <button id="google-scan-btn" 
                    class="mt-6 px-8 py-4 bg-white dark:bg-zinc-950 text-slate-900 dark:text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-xl border-2 border-brandBlue/10 hover:border-brandBlue/40 active:scale-95 transition-all flex items-center gap-3 group relative z-[1000]">
                <div class="w-8 h-8 flex items-center justify-center bg-slate-50 dark:bg-zinc-900 rounded-full group-hover:scale-110 transition-transform">
                   <i class="fab fa-google text-brandBlue"></i>
                </div>
                Open AR Lens
            </button>
            <p class="text-[8px] font-black text-slate-400 mt-4 uppercase tracking-[0.2em] animate-pulse">CLICK ON UPPER BUTTON AND SACN</p>
        `;
      }

      lockMsg.innerHTML = `
        <div class="flex flex-col items-center animate-slide-up w-full">
            <div class="w-20 h-20 bg-slate-50 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-4 border border-slate-200 dark:border-zinc-800 shadow-inner">
                <i class="fas ${icon} ${colorClass} text-4xl ${pulse ? "animate-pulse" : ""} ${bounce ? "animate-bounce" : ""}"></i>
            </div>
            <div class="text-center">
                <p class="${colorClass} font-black text-xl uppercase tracking-tighter">${title}</p>
                <p class="text-slate-500 dark:text-zinc-400 text-sm mt-1">${sub}</p>
            </div>
            ${actionButton}
        </div>`;

      const scanBtn = document.getElementById("google-scan-btn");
      if (scanBtn) {
        // Clear old listeners and add the new one
        scanBtn.replaceWith(scanBtn.cloneNode(true));
        document
          .getElementById("google-scan-btn")
          .addEventListener("click", (e) => {
            e.preventDefault();
            launchIntegratedGoogle();
          });
      }
    }
  },
  (err) => {
    console.warn("GPS ERROR");
  },
  { enableHighAccuracy: true },
);

document.getElementById("roll").addEventListener("blur", async (e) => {
  const roll = e.target.value.trim();
  if (!roll) return;

  //  Local Memory
  const savedData = JSON.parse(localStorage.getItem("student_" + roll));
  if (savedData) {
    document.getElementById("name").value = savedData.name || "";
    document.getElementById("reg").value = savedData.reg || "";
    document.getElementById("mobile").value = savedData.mobile || "";
    document.getElementById("email").value = savedData.email || "";
  }

  // 2. Network verification
  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "lookup", type: "classroom", roll: roll }),
    });
    const data = await res.json();
    if (data.user && data.user.found) {
      document.getElementById("name").value = data.user.name || "";
      document.getElementById("reg").value = data.user.reg || "";
      document.getElementById("mobile").value = data.user.mobile || "";
      document.getElementById("email").value = data.user.email || "";
      showNotify(`Verified Details: ${data.user.name}`, "success");
    }
  } catch (err) {
    console.warn("Cloud lookup offline");
  }
});

document.getElementById("entryForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("submitBtn");
  btn.disabled = true;
  btn.innerHTML = `<span>VERIFYING IDENTITY...</span> <i class="fas fa-fingerprint animate-pulse ml-2"></i>`;

  const bioSig = await getBiometricSignature();
  if (!bioSig || bioSig === "NOT_SUPPORTED") {
    showNotify(
      bioSig === "NOT_SUPPORTED"
        ? "Biometrics not supported"
        : "Verification Failed",
      "error",
    );
    btn.disabled = false;
    btn.innerHTML = "MARK ATTENDANCE";
    return;
  }

  btn.innerHTML = `<span>CHECKING RANGE...</span> <i class="fas fa-circle-notch animate-spin ml-2"></i>`;

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const payload = {
        action: "submit",
        dynamicPin: document.getElementById("userPinInput").value,
        token: generateToken(),
        roll: document.getElementById("roll").value,
        name: document.getElementById("name").value,
        reg: document.getElementById("reg").value,
        mobile: document.getElementById("mobile").value,
        email: document.getElementById("email").value,
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        deviceId: getDeviceId(),
        bioSignature: bioSig,
      };

      try {
        const res = await fetch(SCRIPT_URL, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (result.success) {
          showNotify("Attendance Marked!", "success");
          saveLogLocally(payload.name, payload.roll, "60");
          setTimeout(() => location.reload(), 2500);
        } else {
          showNotify(result.error, "error");
          btn.disabled = false;
          btn.innerHTML = "MARK ATTENDANCE";
        }
      } catch (err) {
        showNotify("Network Error", "error");
        btn.disabled = false;
      }
    },
    (err) => {
      showNotify("Location Required", "error");
      btn.disabled = false;
    },
    { enableHighAccuracy: true },
  );
});

async function getBiometricSignature() {
  if (!window.PublicKeyCredential) return "NOT_SUPPORTED";

  const rollNo = document.getElementById("roll").value.trim();
  const regNo = document.getElementById("reg").value.trim();
  const identityKey = `auth_v3_${rollNo}_${regNo}`; // New versioned key

  const challenge = new Uint8Array(32);
  window.crypto.getRandomValues(challenge);
  const savedKeyId = localStorage.getItem(identityKey);

  try {
    if (!savedKeyId) {
      // Re-Register if browser data was cleared
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: challenge,
          rp: { name: "GECWC Attendance" },
          user: {
            id: Uint8Array.from(regNo, (c) => c.charCodeAt(0)),
            name: rollNo,
            displayName: rollNo,
          },
          pubKeyCredParams: [{ alg: -7, type: "public-key" }],
          authenticatorSelection: { userVerification: "required" },
          timeout: 60000,
        },
      });
      const hashBuffer = await window.crypto.subtle.digest(
        "SHA-256",
        cred.response.getPublicKey(),
      );
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      localStorage.setItem(
        identityKey,
        btoa(String.fromCharCode(...new Uint8Array(cred.rawId))),
      );
      return hashHex;
    } else {
      await navigator.credentials.get({
        publicKey: {
          challenge: challenge,
          allowCredentials: [
            {
              id: Uint8Array.from(atob(savedKeyId), (c) => c.charCodeAt(0)),
              type: "public-key",
            },
          ],
          userVerification: "required",
        },
      });
      return "VERIFIED_HW";
    }
  } catch (e) {
    return null;
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getDeviceId() {
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = 200;
    canvas.height = 50;
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("GECWC-SECURE-ID", 2, 15);
    ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
    ctx.fillText("GECWC-SECURE-ID", 4, 17);

    const fingerprint = canvas.toDataURL(); // Unique GPU signature
    const specs = [
      screen.width + "x" + screen.height,
      navigator.hardwareConcurrency, // CPU Cores
      navigator.platform,
      screen.colorDepth,
    ].join("|");

    let hash = 0;
    const finalStr = fingerprint + specs;
    for (let i = 0; i < finalStr.length; i++) {
      hash = (hash << 5) - hash + finalStr.charCodeAt(i);
      hash |= 0;
    }
    return "HW-V3-" + Math.abs(hash).toString(16).toUpperCase();
  } catch (e) {
    return "FALLBACK-" + screen.width + "-" + navigator.hardwareConcurrency;
  }
}

function generate5MinPIN() {
  const now = new Date();
  const day = now.getDate();
  const hour = now.getHours();
  const minuteBlock = Math.floor(now.getMinutes() / 5);

  const pin = Math.abs(
    (day * 127 + hour * 13 + minuteBlock * 57 + 1234) % 10000,
  );
  return pin.toString().padStart(4, "0");
}

// 2. Update UI and Timer
function updatePINSystem() {
  const currentPin = generate5MinPIN();
  const display = document.getElementById("pinDisplay");
  const timerText = document.getElementById("pin-timer");

  display.innerText = currentPin;

  const now = new Date();
  const secToNextBlock = 300 - ((now.getMinutes() % 5) * 60 + now.getSeconds());
  const mins = Math.floor(secToNextBlock / 60);
  const secs = secToNextBlock % 60;
  timerText.innerText = `Refreshes in: ${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

setInterval(updatePINSystem, 1000);
updatePINSystem();


setInterval(() => {
  const dLock = document.getElementById("debug-lock");
  if (floorVerified) {
    dLock.innerText = "UNLOCKED";
    dLock.className = "text-brandGreen font-bold";
  } else {
    dLock.innerText = "LOCKED";
    dLock.className = "text-brandRed font-bold";
  }
}, 1000);

function validatePinInput() {
  const btn = document.getElementById("submitBtn");
  const icon = document.getElementById("btn-lock-icon");
  const input = document.getElementById("userPinInput");
  const currentPin = generate5MinPIN();

  if (input.value === currentPin) {
    // UNLOCK STATE
    btn.disabled = false;
    btn.classList.remove("opacity-50", "cursor-not-allowed", "bg-brandBlue");
    btn.classList.add("bg-brandGreen", "hover:bg-green-600");
    icon.className = "fas fa-check-circle";
    input.classList.remove("animate-shake", "border-brandRed");
    input.classList.add("border-brandGreen");
  } else {
    // LOCK STATE
    btn.disabled = true;
    btn.classList.add("opacity-50", "cursor-not-allowed");
    btn.classList.remove("bg-brandGreen", "hover:bg-green-600");
    btn.classList.add("bg-brandBlue");
    icon.className = "fas fa-lock";
    input.classList.remove("border-brandGreen");

    
    if (input.value.length === 4) {
      input.classList.add("animate-shake");
      if ("vibrate" in navigator) navigator.vibrate([100, 50, 100]);
      setTimeout(() => input.classList.remove("animate-shake"), 400);
    }
  }
}

function updateLogic() {
  const btn = document.getElementById("submitBtn");
  const lockIcon = document.getElementById("btn-lock-icon");
  const isScanned = checkQRVerification();

  
  const isLaptop = document.getElementById("debug-mag").innerText === "LAPTOP";
  const dist = calculateDistance(
    userPos.lat,
    userPos.lon,
    CLASS_COORDS.lat,
    CLASS_COORDS.lng,
  );
  const inRange = dist <= (isLaptop ? 1000 : MAX_DIST);

  if (inRange && isScanned && floorVerified) {
    btn.disabled = false;
    btn.classList.remove("opacity-50", "cursor-not-allowed");
    btn.classList.add("opacity-100");
    lockIcon.className = "fas fa-unlock-alt";
  } else {
    btn.disabled = true;
    btn.classList.add("opacity-50", "cursor-not-allowed");
    lockIcon.className = "fas fa-lock";
  }
}
// --- THE PING TRIGGER ---
setInterval(async () => {
  // This runs the ping and updates the text automatically
  const isFast = await runPingFallback();

  // Optional: If you want the Ping check to help unlock the form on Laptop
  if (document.getElementById("debug-mag").innerText === "LAPTOP") {
    floorVerified = isFast;
    if (typeof updateLogic === "function") updateLogic();
  }
}, 3000);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then((reg) => console.log("App ready: Service Worker Registered"))
      .catch((err) => console.log("Service Worker failed", err));
  });
}

async function updateLiveTimetable() {
  const ongoingSection = document.getElementById("ongoing-section");
  const timelineSection = document.getElementById("timeline-section");
  const roadmapList = document.getElementById("roadmap-list");

  try {
    const response = await fetch(SCRIPT_URL + "?v=" + Date.now(), {
      method: "POST",
      body: JSON.stringify({ action: "getTimetable" }),
    });
    const data = await response.json();

    const now = new Date();
    const ist = new Date(
      now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
    );
    const currentMins = ist.getHours() * 60 + ist.getMinutes();
    const currentDay = ist
      .toLocaleString("en-us", { weekday: "long" })
      .toUpperCase();

    const toMins = (t) => {
      if (!t.includes(":")) return 0;
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };

    const todaysClasses = data.timetable
      .filter((c) => c.day === currentDay)
      .map((c) => ({ ...c, sM: toMins(c.startRaw), eM: toMins(c.endRaw) }))
      .sort((a, b) => a.sM - b.sM);

    if (todaysClasses.length === 0) return;

    // --- TOP CARD REFRESH ---
    let active = todaysClasses.find(
      (c) => currentMins >= c.sM && currentMins < c.eM,
    );
    let next = todaysClasses.find((c) => c.sM > currentMins);
    let displayClass = active || next;

    if (displayClass) {
      ongoingSection.classList.remove("hidden");
      document.getElementById("active-subject").innerText =
        displayClass.subject;
      document.getElementById("active-faculty").innerText =
        displayClass.faculty;
      document.getElementById("active-teacher-img").src =
        displayClass.image || "image/logo.png";
      document.getElementById("active-start-label").innerText =
        displayClass.startRaw;
      document.getElementById("active-end-label").innerText =
        displayClass.endRaw;

      const badge = document.getElementById("active-badge");
      const statusTxt = document.getElementById("status-text");
      const tagBox = document.getElementById("status-tag-container");
      const countdown = document.getElementById("active-countdown");
      const activeBar = document.getElementById("active-class-progress");
      const pingRing = document.getElementById("ping-ring");
      const pingDot = document.getElementById("ping-dot");

      if (active) {
        badge.innerText = "LIVE";
        badge.className =
          "absolute -bottom-1 -right-1 bg-brandGreen text-white text-[8px] font-black px-3 py-1 rounded-xl border-2 border-white dark:border-zinc-950 animate-bounce";
        statusTxt.innerText = "Currently Teaching";
        statusTxt.className = "text-[9px] font-black uppercase text-brandGreen";
        tagBox.className =
          "inline-flex items-center gap-2 px-3 py-1 rounded-full mb-2 bg-brandGreen/10 border-2 border-brandGreen/40";
        pingRing.className =
          "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-brandGreen";
        pingDot.className =
          "relative inline-flex rounded-full h-2 w-2 bg-brandGreen";

        const perc = Math.min(
          100,
          ((currentMins - active.sM) / (active.eM - active.sM)) * 100,
        );
        activeBar.style.width = `${perc}%`;
        activeBar.className = "h-full rounded-full bg-brandGreen shadow-lg";
        countdown.innerText = `${active.eM - currentMins}m REMAINING`;
      } else {
        badge.innerText = "NEXT";
        badge.className =
          "absolute -bottom-1 -right-1 bg-brandBlue text-white text-[8px] font-black px-3 py-1 rounded-xl border-2 border-white dark:border-zinc-950";
        statusTxt.innerText = "Up Next in Schedule";
        statusTxt.className = "text-[9px] font-black uppercase text-brandBlue";
        tagBox.className =
          "inline-flex items-center gap-2 px-3 py-1 rounded-full mb-2 bg-brandBlue/10 border-2 border-brandBlue/40";
        pingRing.className = "hidden";
        pingDot.className =
          "relative inline-flex rounded-full h-2 w-2 bg-brandBlue";

        activeBar.style.width = `0%`;
        countdown.innerText = `STARTS IN ${displayClass.sM - currentMins}m`;
      }
    }

    // --- COMPACT ROADMAP (STRICT BORDERS & NO DIMMING) ---
    timelineSection.classList.remove("hidden");
    roadmapList.innerHTML = "";
    let completedSteps = 0;

    todaysClasses.forEach((item) => {
      let state = "Upcoming",
        dot = "bg-zinc-800",
        cardBorder = "border-slate-200 dark:border-white/10",
        icon = "fa-clock",
        tagStyle = "bg-zinc-800 text-zinc-500",
        dotBorder = "border-white dark:border-zinc-950";

      if (currentMins >= item.eM) {
        state = "Done";
        dot = "bg-brandGreen";
        cardBorder = "border-brandGreen/40 shadow-lg shadow-brandGreen/5";
        icon = "fa-check-double";
        tagStyle = "bg-brandGreen text-white";
        completedSteps++;
      } else if (currentMins >= item.sM && currentMins < item.eM) {
        state = "Ongoing";
        dot = "bg-brandBlue ring-4 ring-brandBlue/20 scale-105 shadow-xl";
        cardBorder = "border-brandBlue shadow-xl shadow-brandBlue/5";
        icon = "fa-satellite-dish";
        tagStyle = "bg-brandBlue text-white";
        completedSteps += 0.5;
      } else {
       
        tagStyle =
          "bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/30";
        icon = "fa-hourglass-start";
      }

      roadmapList.insertAdjacentHTML(
        "beforeend",
        `
                <div class="relative flex items-start gap-4 pb-4 last:pb-2">
                    <div class="relative z-20 w-11 h-11 rounded-2xl flex items-center justify-center border-4 ${dotBorder} ${dot} transition-all shadow-lg text-white text-[10px]">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="flex-grow p-4 rounded-[2rem] border-2 bg-white dark:bg-zinc-900/40 ${cardBorder} transition-all">
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-[9px] font-black text-slate-400 uppercase tracking-tighter">${item.startRaw} - ${item.endRaw}</span>
                            <span class="${tagStyle} text-[7px] font-black px-2 py-0.5 rounded-lg uppercase tracking-widest">${state}</span>
                        </div>
                        <h4 class="font-bold text-slate-900 dark:text-white text-sm leading-tight">${item.subject}</h4>
                        <div class="flex items-center gap-2 mt-3">
                            <img src="${item.image || "image/logo.png"}" class="w-7 h-7 rounded-full object-cover border border-slate-200 dark:border-zinc-700">
                            <div class="flex flex-col">
                                <span class="text-[10px] text-slate-600 dark:text-zinc-400 font-black uppercase truncate">${item.faculty}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `,
      );
    });

    const perc = Math.min(
      100,
      Math.round((completedSteps / todaysClasses.length) * 100),
    );
    document.getElementById("timeline-progress-bar").style.height = `${perc}%`;
    const pTxt = document.getElementById("day-progress-text");
    pTxt.innerText = `${perc}% COMPLETE`;
    pTxt.className = `px-4 py-2 rounded-2xl font-black text-[9px] uppercase border-2 shadow-sm ${perc === 100 ? "bg-brandGreen/10 border-brandGreen text-brandGreen" : "bg-brandBlue/10 border-brandBlue text-brandBlue"}`;
  } catch (e) {
    console.error("UI Update Failed");
  }
}
// --- INITIALIZE ALL SYSTEMS ---
document.addEventListener("DOMContentLoaded", () => {
  // 1. Check for class immediately
  updateLiveTimetable();

  
  fetchAdminNotice();
  renderLocalLogs();
  checkPhysicalFloor();


  document
    .getElementById("userPinInput")
    .addEventListener("input", validatePinInput);
});

// Refresh timetable every 60 seconds
setInterval(updateLiveTimetable, 60000);
function launchGoogleLens() {
  if ("vibrate" in navigator) navigator.vibrate(40);

  const isAndroid = /Android/i.test(navigator.userAgent);

  if (isAndroid) {
   
    const googleAppLensIntent =
      "intent://google.com/searchbyimage/upload#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.SEND;end";

    try {
      window.location.href = googleAppLensIntent;
    } catch (e) {
    
      window.location.href = "https://www.google.com/searchbyimage/upload";
    }
  } else {
    // iOS users can simply use their native camera which has "Visual Look Up"
    showNotify("Please use your native camera to scan the QR", "info");
  }
}

function launchIntegratedGoogle() {
  if ("vibrate" in navigator) navigator.vibrate([40, 40]);

  const isAndroid = /Android/i.test(navigator.userAgent);

  if (isAndroid) {
  
    const directLensIntent = "googlelens://v1/scan";

    
    const intentURL =
      "intent://scan/#Intent;scheme=googlelens;package=com.google.ar.lens;end";

  
    window.location.href = directLensIntent;

  
    setTimeout(() => {
      if (document.hasFocus()) {
        window.location.href = intentURL;
      }
    }, 800);

    
    setTimeout(() => {
      if (document.hasFocus()) {
        window.location.href = "https://www.google.com/searchbyimage/upload";
      }
    }, 2000);
  } else {
    // iOS or Desktop
    window.location.href = "https://www.google.com/searchbyimage/upload";
  }
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  console.log("PWA ready to install");
});