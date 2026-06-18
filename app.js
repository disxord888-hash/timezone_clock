// ============================================================
// Physical Timezone Clock - app.js
// Leaflet + OpenStreetMap版
// 地図をクリックして経度から物理タイムゾーンを計算する
// Cookie・データ保存なし
// ============================================================

(function () {
  'use strict';

  // --- State ---
  const state = {
    clocks: [],     // { id, lat, lng, offsetMinutes, color, marker, popup }
    nextId: 1,
  };

  const COLORS = ['blue', 'cyan', 'purple', 'pink', 'green', 'orange'];
  const COLOR_HEX = {
    blue: '#3b82f6',
    cyan: '#06b6d4',
    purple: '#8b5cf6',
    pink: '#ec4899',
    green: '#10b981',
    orange: '#f59e0b',
  };
  let colorIndex = 0;

  // --- DOM Elements ---
  const clocksGrid = document.getElementById('clocks-grid');
  const emptyState = document.getElementById('empty-state');
  const clearAllBtn = document.getElementById('clear-all-btn');

  // --- Initialize Leaflet Map ---
  const map = L.map('leaflet-map', {
    center: [30, 0],
    zoom: 2,
    minZoom: 2,
    maxZoom: 18,
    worldCopyJump: true,
    zoomControl: true,
  });

  // OpenStreetMap tile layer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);

  // --- Utility Functions ---

  const JST_OFFSET_MINUTES = 540; // JST = UTC+9 = 540 minutes

  function calcPhysicalOffsetMinutes(lng) {
    // Physical timezone: 1° longitude = 4 minutes, rounded to nearest minute
    return Math.round(lng * 4);
  }

  function formatOffset(offsetMinutes) {
    // Show difference from JST
    const diff = offsetMinutes - JST_OFFSET_MINUTES;
    if (diff === 0) return 'JST ±0';
    const sign = diff > 0 ? '+' : '−';
    const abs = Math.abs(diff);
    const hours = Math.floor(abs / 60);
    const minutes = abs % 60;
    if (minutes === 0) {
      return `JST ${sign}${hours}h`;
    }
    return `JST ${sign}${hours}h${minutes.toString().padStart(2, '0')}m`;
  }

  function formatCoord(lng, lat) {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(2)}°${latDir}  ${Math.abs(lng).toFixed(2)}°${lngDir}`;
  }

  function getNextColor() {
    const color = COLORS[colorIndex % COLORS.length];
    colorIndex++;
    return color;
  }

  function getLocalTime(offsetMinutes) {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utc + offsetMinutes * 60000);
  }

  // --- Custom Marker Icon ---

  function createMarkerIcon(color) {
    const hex = COLOR_HEX[color] || '#3b82f6';
    const html = `
      <div class="custom-marker">
        <div class="marker-pulse" style="background:${hex};"></div>
        <div class="marker-dot" style="background:${hex};"></div>
      </div>
    `;
    return L.divIcon({
      className: '',
      html: html,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -18],
    });
  }

  // --- Clock Card Creation ---

  function createClockCard(clock) {
    const card = document.createElement('div');
    card.className = 'clock-card';
    card.dataset.color = clock.color;
    card.dataset.id = clock.id;

    const offsetStr = formatOffset(clock.offsetMinutes);
    const coordStr = formatCoord(clock.lng, clock.lat);

    card.innerHTML = `
      <button class="remove-btn" title="削除">✕</button>
      <div class="clock-card-header">
        <div class="location-label">ポイント ${clock.id}</div>
        <div class="utc-label">${offsetStr}</div>
        <div class="coords">${coordStr}</div>
      </div>
      <div class="analog-clock" id="analog-${clock.id}">
        <svg viewBox="0 0 200 200"></svg>
      </div>
      <div class="digital-time" id="digital-${clock.id}"></div>
      <div class="digital-date" id="date-${clock.id}"></div>
    `;

    card.querySelector('.remove-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      removeClock(clock.id);
    });

    // Click card to fly to location on map
    card.addEventListener('click', () => {
      map.flyTo([clock.lat, clock.lng], Math.max(map.getZoom(), 6), {
        duration: 1,
      });
      clock.marker.openPopup();
    });

    return card;
  }

  // --- Analog Clock Drawing ---

  function drawAnalogClock(svgElement, offsetMinutes) {
    const localTime = getLocalTime(offsetMinutes);

    const hours = localTime.getHours();
    const minutes = localTime.getMinutes();
    const seconds = localTime.getSeconds();
    const millis = localTime.getMilliseconds();

    const smoothSeconds = seconds + millis / 1000;
    const smoothMinutes = minutes + smoothSeconds / 60;
    const smoothHours = (hours % 12) + smoothMinutes / 60;

    const hourAngle = (smoothHours / 12) * 360 - 90;
    const minuteAngle = (smoothMinutes / 60) * 360 - 90;
    const secondAngle = (smoothSeconds / 60) * 360 - 90;

    const cx = 100, cy = 100;

    let svg = `
      <circle cx="${cx}" cy="${cy}" r="95" fill="rgba(17,24,39,0.6)" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
      <circle cx="${cx}" cy="${cy}" r="88" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="0.5"/>
    `;

    // Hour marks
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * 360 - 90;
      const rad = angle * Math.PI / 180;
      const innerR = i % 3 === 0 ? 72 : 78;
      const outerR = 85;
      const x1 = cx + innerR * Math.cos(rad);
      const y1 = cy + innerR * Math.sin(rad);
      const x2 = cx + outerR * Math.cos(rad);
      const y2 = cy + outerR * Math.sin(rad);
      const width = i % 3 === 0 ? 2.5 : 1;
      const opacity = i % 3 === 0 ? 0.5 : 0.2;
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(255,255,255,${opacity})" stroke-width="${width}" stroke-linecap="round"/>`;
    }

    // Minute marks
    for (let i = 0; i < 60; i++) {
      if (i % 5 === 0) continue;
      const angle = (i / 60) * 360 - 90;
      const rad = angle * Math.PI / 180;
      const x1 = cx + 82 * Math.cos(rad);
      const y1 = cy + 82 * Math.sin(rad);
      const x2 = cx + 85 * Math.cos(rad);
      const y2 = cy + 85 * Math.sin(rad);
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(255,255,255,0.08)" stroke-width="0.5" stroke-linecap="round"/>`;
    }

    // Hour hand
    const hourRad = hourAngle * Math.PI / 180;
    const hx = cx + 50 * Math.cos(hourRad);
    const hy = cy + 50 * Math.sin(hourRad);
    svg += `<line x1="${cx}" y1="${cy}" x2="${hx}" y2="${hy}" stroke="rgba(240,244,255,0.85)" stroke-width="4" stroke-linecap="round"/>`;

    // Minute hand
    const minuteRad = minuteAngle * Math.PI / 180;
    const mx = cx + 68 * Math.cos(minuteRad);
    const my = cy + 68 * Math.sin(minuteRad);
    svg += `<line x1="${cx}" y1="${cy}" x2="${mx}" y2="${my}" stroke="rgba(240,244,255,0.7)" stroke-width="2.5" stroke-linecap="round"/>`;

    // Second hand
    const secondRad = secondAngle * Math.PI / 180;
    const sx = cx + 75 * Math.cos(secondRad);
    const sy = cy + 75 * Math.sin(secondRad);
    const stx = cx - 15 * Math.cos(secondRad);
    const sty = cy - 15 * Math.sin(secondRad);
    svg += `<line x1="${stx}" y1="${sty}" x2="${sx}" y2="${sy}" stroke="#ef4444" stroke-width="1.2" stroke-linecap="round"/>`;

    // Center dot
    svg += `<circle cx="${cx}" cy="${cy}" r="4" fill="#ef4444"/>`;
    svg += `<circle cx="${cx}" cy="${cy}" r="2" fill="#0a0e1a"/>`;

    svgElement.innerHTML = svg;
  }

  function updateDigitalClock(elementId, offsetMinutes) {
    const el = document.getElementById(elementId);
    const dateEl = document.getElementById(elementId.replace('digital', 'date'));
    if (!el) return;

    const localTime = getLocalTime(offsetMinutes);

    const h = localTime.getHours().toString().padStart(2, '0');
    const m = localTime.getMinutes().toString().padStart(2, '0');
    const s = localTime.getSeconds().toString().padStart(2, '0');

    el.innerHTML = `${h}:${m}<span class="digital-seconds">:${s}</span>`;

    if (dateEl) {
      const year = localTime.getFullYear();
      const month = (localTime.getMonth() + 1).toString().padStart(2, '0');
      const day = localTime.getDate().toString().padStart(2, '0');
      const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
      const weekday = weekdays[localTime.getDay()];
      dateEl.textContent = `${year}/${month}/${day} (${weekday})`;
    }
  }

  // --- Update Popup Time ---

  function updatePopupTime(clock) {
    const popupEl = document.getElementById(`popup-time-${clock.id}`);
    const popupDateEl = document.getElementById(`popup-date-${clock.id}`);
    if (!popupEl) return;

    const localTime = getLocalTime(clock.offsetMinutes);
    const h = localTime.getHours().toString().padStart(2, '0');
    const m = localTime.getMinutes().toString().padStart(2, '0');
    const s = localTime.getSeconds().toString().padStart(2, '0');
    popupEl.textContent = `${h}:${m}:${s}`;

    if (popupDateEl) {
      const year = localTime.getFullYear();
      const month = (localTime.getMonth() + 1).toString().padStart(2, '0');
      const day = localTime.getDate().toString().padStart(2, '0');
      const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
      const weekday = weekdays[localTime.getDay()];
      popupDateEl.textContent = `${year}/${month}/${day} (${weekday})`;
    }
  }

  // --- Clock Management ---

  function addClock(lat, lng) {
    const offsetMinutes = calcPhysicalOffsetMinutes(lng);
    const color = getNextColor();
    const id = state.nextId++;

    // Create Leaflet marker
    const marker = L.marker([lat, lng], {
      icon: createMarkerIcon(color),
    }).addTo(map);

    const offsetStr = formatOffset(offsetMinutes);
    const coordStr = formatCoord(lng, lat);

    // Create popup content
    const popupHtml = `
      <div class="popup-content">
        <div class="popup-offset">${offsetStr}</div>
        <div class="popup-coords">${coordStr}</div>
        <div class="popup-time" id="popup-time-${id}">--:--:--</div>
        <div class="popup-date" id="popup-date-${id}"></div>
        <button class="popup-remove-btn" onclick="window.__removeClock(${id})">🗑️ 削除</button>
      </div>
    `;

    marker.bindPopup(popupHtml, {
      closeButton: true,
      className: 'custom-popup',
    });

    const clock = {
      id,
      lat: Math.round(lat * 100) / 100,
      lng: Math.round(lng * 100) / 100,
      offsetMinutes,
      color,
      marker,
    };

    state.clocks.push(clock);

    // Update UI
    emptyState.style.display = 'none';
    clearAllBtn.style.display = 'inline-block';

    const card = createClockCard(clock);
    clocksGrid.appendChild(card);

    // Open popup briefly
    marker.openPopup();

    // Scroll to the new card
    setTimeout(() => {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 200);
  }

  function removeClock(id) {
    const clockIndex = state.clocks.findIndex(c => c.id === id);
    if (clockIndex === -1) return;

    const clock = state.clocks[clockIndex];

    // Remove marker from map
    map.removeLayer(clock.marker);

    // Remove from state
    state.clocks.splice(clockIndex, 1);

    // Remove card with animation
    const card = clocksGrid.querySelector(`[data-id="${id}"]`);
    if (card) {
      card.style.animation = 'card-appear 0.3s ease reverse forwards';
      setTimeout(() => card.remove(), 300);
    }

    if (state.clocks.length === 0) {
      setTimeout(() => {
        emptyState.style.display = '';
        clearAllBtn.style.display = 'none';
      }, 310);
    }
  }

  // Expose removeClock globally for popup button
  window.__removeClock = removeClock;

  function clearAllClocks() {
    // Remove all markers
    state.clocks.forEach(clock => {
      map.removeLayer(clock.marker);
    });
    state.clocks = [];

    const cards = clocksGrid.querySelectorAll('.clock-card');
    cards.forEach((card, i) => {
      card.style.animation = `card-appear 0.3s ease ${i * 0.05}s reverse forwards`;
    });
    setTimeout(() => {
      cards.forEach(c => c.remove());
      emptyState.style.display = '';
      clearAllBtn.style.display = 'none';
    }, 400);
  }

  // --- Event Handlers ---

  map.on('click', (e) => {
    const { lat, lng } = e.latlng;
    addClock(lat, lng);
  });

  clearAllBtn.addEventListener('click', clearAllClocks);

  // --- Animation Loop ---

  function updateAllClocks() {
    state.clocks.forEach(clock => {
      // Update analog clock
      const svgEl = document.querySelector(`#analog-${clock.id} svg`);
      if (svgEl) {
        drawAnalogClock(svgEl, clock.offsetMinutes);
      }
      // Update digital clock
      updateDigitalClock(`digital-${clock.id}`, clock.offsetMinutes);
      // Update popup time if open
      updatePopupTime(clock);
    });

    requestAnimationFrame(updateAllClocks);
  }

  // --- Initialize ---

  requestAnimationFrame(updateAllClocks);

})();
