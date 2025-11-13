// main.js — Lógica Drive de videos

const videoGrid   = document.getElementById("videoGrid");
const countText   = document.getElementById("countText");
const refreshBtn  = document.getElementById("refreshBtn");
const videoPlayer = document.getElementById("videoPlayer");
const playerInfo  = document.getElementById("playerInfo");
const template    = document.getElementById("videoCardTemplate");
const logoutBtn   = document.getElementById("logoutBtn");

let currentAlerts = [];
let currentSelectedId = null;

// --- Autenticación muy simple (igual que tu lógica actual) ---
const token = localStorage.getItem("auth_token");
if (!token) {
  // Si no hay token, mandar al login
  window.location.href = "login.html";
}

// Cerrar sesión
logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("auth_token");
  window.location.href = "login.html";
});

// =====================
// 1) Cargar alertas
// =====================
async function fetchAlerts() {
  try {
    // Tu backend no usa Authorization, así que no lo envío
    const res = await fetch("/api/alerts");

    if (!res.ok) {
      throw new Error("Error al obtener alertas");
    }

    const data = await res.json();
    currentAlerts = data;
    renderAlerts();
  } catch (err) {
    console.error(err);
    videoGrid.innerHTML =
      "<p style='color:#fca5a5;'>Error al cargar los videos. Revisá el servidor.</p>";
  }
}

// =====================
// 2) Dibujar tarjetas
// =====================
function renderAlerts() {
  videoGrid.innerHTML = "";

  if (!currentAlerts || currentAlerts.length === 0) {
    countText.textContent = "0 videos";
    videoGrid.innerHTML =
      "<p style='color:#e5e7eb;'>No hay videos todavía. Cuando el sensor detecte movimiento se irán guardando acá.</p>";
    return;
  }

  countText.textContent =
    currentAlerts.length === 1
      ? "1 video"
      : `${currentAlerts.length} videos`;

  currentAlerts.forEach((alert) => {
    const clone    = template.content.cloneNode(true);
    const titleEl  = clone.querySelector(".video-card-title");
    const metaEl   = clone.querySelector(".video-card-meta");
    const playBtn  = clone.querySelector(".play-btn");
    const deleteBtn= clone.querySelector(".delete-btn");

    const createdAt = new Date(alert.createdAt);
    const fecha = createdAt.toLocaleDateString("es-AR");
    const hora  = createdAt.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    titleEl.textContent = `Alerta ${alert.type}`;
    metaEl.textContent  = `${fecha} · ${hora}`;

    // Ver video
    playBtn.addEventListener("click", () => {
      selectAlert(alert);
    });

    // Eliminar video
    deleteBtn.addEventListener("click", () => {
      if (confirm("¿Seguro que querés eliminar este video?")) {
        deleteAlert(alert.id);
      }
    });

    videoGrid.appendChild(clone);
  });
}

// =====================
// 3) Seleccionar video
// =====================
function selectAlert(alert) {
  currentSelectedId = alert.id;

  if (!alert.videoPath) {
    playerInfo.classList.remove("player-info--empty");
    playerInfo.innerHTML = "<p>No hay video asociado a esta alerta.</p>";
    videoPlayer.removeAttribute("src");
    videoPlayer.load();
    return;
  }

  const createdAt = new Date(alert.createdAt);
  const fecha = createdAt.toLocaleDateString("es-AR");
  const hora  = createdAt.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  playerInfo.classList.remove("player-info--empty");
  playerInfo.innerHTML = `
    <p><strong>Tipo:</strong> ${alert.type}</p>
    <p><strong>Mensaje:</strong> ${alert.message}</p>
    <p><strong>Fecha / hora:</strong> ${fecha} · ${hora}</p>
  `;

  videoPlayer.src = alert.videoPath;
  videoPlayer.load();
  videoPlayer.play().catch(() => {});
}

// =====================
// 4) Eliminar alerta/video
// =====================
async function deleteAlert(id) {
  try {
    const res = await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      throw new Error("Error al eliminar alerta");
    }

    // Sacar del array local
    currentAlerts = currentAlerts.filter((a) => a.id !== id);
    renderAlerts();

    // Si era el que estaba reproduciéndose, limpiar
    if (currentSelectedId === id) {
      currentSelectedId = null;
      playerInfo.classList.add("player-info--empty");
      playerInfo.innerHTML = "<p>Seleccioná un video para verlo.</p>";
      videoPlayer.removeAttribute("src");
      videoPlayer.load();
    }
  } catch (err) {
    console.error(err);
    alert("No se pudo eliminar la alerta. Revisá la consola del servidor.");
  }
}

// =====================
// 5) Botón refrescar
// =====================

refreshBtn.addEventListener("click", fetchAlerts);

// Cargar al inicio
fetchAlerts();
