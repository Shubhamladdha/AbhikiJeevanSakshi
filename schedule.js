/* schedule.js
   - Robust CSV parsing (handles quoted fields and commas inside quotes)
   - Groups events by date, sorts dates when parseable
   - Renders accessible, responsive markup matching schedule.css
*/

const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vThtl2JO-jKfDKKoSyr8PBDL-mmONO9tbcK-xSgDRGV4uPm8ZWGkHzn2XdTtFOYNclBDsrIOATe4ggg/pub?gid=909098383&single=true&output=csv';

async function fetchSchedule() {
  const container = document.getElementById('schedule-container');
  container.innerHTML = '<p class="schedule-empty">Loading schedule…</p>';
  try {
    const res = await fetch(csvUrl, {cache: 'no-cache'});
    if (!res.ok) throw new Error('Network response was not ok');
    const text = await res.text();
    renderScheduleFromCSV(text, container);
  } catch (err) {
    console.error('Error fetching schedule:', err);
    container.innerHTML = '<p class="schedule-empty">Unable to load schedule. Please check connection.</p>';
  }
}

/* Very small CSV parser that supports quoted fields and doubled quotes.
   Returns array of rows (each is array of fields).
*/
function parseCSVText(csvText) {
  const lines = csvText.replace(/\r\n/g, '\n').split('\n');
  const rows = [];

  for (let line of lines) {
    // Skip empty lines
    if (line.trim() === '') continue;

    const row = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (ch === '"' ) {
        // Handle escaped quotes (double quotes inside quoted field)
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++; // skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        row.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    row.push(cur);
    rows.push(row);
  }

  return rows;
}

function isProbablyHeaderCell(cell) {
  if (!cell) return false;
  const s = cell.toLowerCase();
  return /date|day|time|event|title|description|desc/.test(s);
}

function tryParseDate(s) {
  // Try JS Date parsing; return timestamp or null
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.getTime();
  // Try common alternate formats (dd-mm-yyyy, dd/mm/yyyy)
  const alt = s.replace(/\./g,'-').replace(/\//g,'-');
  const parts = alt.split('-').map(p => p.trim());
  if (parts.length === 3) {
    // try day-month-year or year-month-day
    let candidate;
    // year-first
    if (parts[0].length === 4) candidate = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
    else candidate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    if (!isNaN(candidate.getTime())) return candidate.getTime();
  }
  return null;
}

function renderScheduleFromCSV(csvText, container) {
  const rows = parseCSVText(csvText);
  if (!rows || rows.length === 0) {
    container.innerHTML = '<p class="schedule-empty">No schedule available.</p>';
    return;
  }

  // Check if first row looks like a header; if so skip it
  let startIndex = 0;
  if (rows.length > 0 && isProbablyHeaderCell(rows[0][0])) startIndex = 1;

  const grouped = new Map();
  const dateOrder = []; // preserve insertion order for unparseable dates

  for (let i = startIndex; i < rows.length; i++) {
    const cols = rows[i].map(c => (c || '').trim());
    // expect at least date+time or date+event
    if (cols.length === 0) continue;

    const dateRaw = cols[0] || '';
    const time = cols[1] || '';
    const event = cols[2] || '';
    const desc = cols[3] || '';

    if (!dateRaw && !event) continue; // skip empty rows

    const dateKey = dateRaw || 'TBD';
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
      dateOrder.push(dateKey);
    }
    grouped.get(dateKey).push({ time, event, desc });
  }

  // Convert grouped map into an array and attempt to sort by date when parseable
  const groupedArray = Array.from(grouped.entries()).map(([dateKey, events]) => {
    const parsed = tryParseDate(dateKey);
    return { dateKey, events, parsed };
  });

  // Sort: parsed dates first (ascending), then unparsed in original order
  groupedArray.sort((a, b) => {
    if (a.parsed != null && b.parsed != null) return a.parsed - b.parsed;
    if (a.parsed != null) return -1;
    if (b.parsed != null) return 1;
    // fall back to original insertion order using dateOrder index
    return dateOrder.indexOf(a.dateKey) - dateOrder.indexOf(b.dateKey);
  });

  // Render
  container.innerHTML = ''; // clear

  groupedArray.forEach(group => {
    const daySection = document.createElement('div');
    daySection.className = 'day-group';

    // date header
    const dateHeading = document.createElement('div');
    dateHeading.className = 'date-title-bar';
    dateHeading.setAttribute('role','heading');
    dateHeading.setAttribute('aria-level','3');

    const icon = document.createElement('i');
    icon.className = 'fas fa-calendar-day';
    icon.setAttribute('aria-hidden','true');

    const text = document.createElement('span');
    text.textContent = ` ${group.dateKey}`;

    dateHeading.appendChild(icon);
    dateHeading.appendChild(text);
    daySection.appendChild(dateHeading);

    // cards container
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'cards-grid-for-day';

    group.events.forEach(item => {
      const card = document.createElement('article');
      card.className = 'event-card-refined';
      card.tabIndex = 0;
      card.innerHTML = `
        <div class="card-inner">
          <span class="event-time-tag">${item.time || ''}</span>
          <h4 class="event-name">${escapeHtml(item.event || '')}</h4>
          <p class="event-details">${escapeHtml(item.desc || '')}</p>
        </div>
      `;
      cardsContainer.appendChild(card);
    });

    daySection.appendChild(cardsContainer);
    container.appendChild(daySection);
  });

  // If nothing rendered
  if (container.children.length === 0) {
    container.innerHTML = '<p class="schedule-empty">No schedule items found.</p>';
  }
}

// simple HTML escaper for safety
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Initialize on load
document.addEventListener('DOMContentLoaded', fetchSchedule);
