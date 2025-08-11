// Dental Molas - Sistema de Pacientes - Periodoncia
// v1.1.5 — Dark mode forzado + filtro chips + Dx Encía en tabla + Dashboard con gráfico Dx
// Mantiene: WhatsApp, prefijo 595, CRUD, .ics, KPIs, buscador, odontograma persistente

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getDatabase, ref, onChildAdded, onChildChanged, onChildRemoved,
  push, remove, update
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';

// FEATURES
window.FEATURES = Object.assign({
  whatsappLink:   true,
  phonePrefix595: true,
}, window.FEATURES || {});
const APP_VERSION = 'v1.1.5';
const ODONTO_URL  = 'odontograma_svg_interactivo_fdi_v_1.html'; // el archivo que tengas en tu raíz

// ===== Firebase =====
const firebaseConfig = {
  apiKey: "AIzaSyB4v68jvnlVrprM4n4A23fv23OKiby_Kqq8",
  authDomain: "sistema-consultorio-53424.firebaseapp.com",
  databaseURL: "https://sistema-consultorio-53424-default-rtdb.firebaseio.com/",
  projectId: "sistema-consultorio-53424",
  storageBucket: "sistema-consultorio-53424.appspot.com",
  messagingSenderId: "701715985597",
  appId: "1:701715985597:web:91c80fdd071edb71d433d4"
};
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);
console.log(`[APP ${APP_VERSION}] iniciado`);

// ===== DOM =====
const tablaBody        = document.querySelector('#tablaPacientes tbody');
const btnAgregar       = document.getElementById('btnAgregar');
const btnDashboard     = document.getElementById('btnDashboard');
const mantenimientoSel = document.getElementById('mantenimiento');
const fechaDDMMAAAA    = document.getElementById('fechaRecordatorioDDMMAAAA');
const fechaISO         = document.getElementById('fechaRecordatorioISO');
const searchMain       = document.getElementById('searchMain');
const horaInput        = document.getElementById('horaRecordatorio');
const guardarBtn       = document.getElementById('guardarPaciente');
const fechaBase        = document.getElementById('fechaBase');
const modalPacienteEl  = document.getElementById('modalPaciente');

// Modal Odontograma
const modalOdontoEl    = document.getElementById('modalOdonto');
const modalOdonto      = new bootstrap.Modal(modalOdontoEl);
const odontoFrame      = document.getElementById('odontoFrame');
const odontoNoFile     = document.getElementById('odontoNoFile');
const guardarOdontoBtn = document.getElementById('guardarOdonto');
const dxRadios         = document.querySelectorAll('input[name="dxEncia"]');
const getDx = () => [...dxRadios].find(r => r.checked)?.value || 'sano';
const setDx = (v) => dxRadios.forEach(r => r.checked = (r.value === (v || 'sano')));

// Dashboard modal
const modalDashboardEl = document.getElementById('modalDashboard');

// Instancia única del modal de paciente
const modalPaciente = new bootstrap.Modal(modalPacienteEl);
modalPacienteEl.addEventListener('shown.bs.modal', () => {
  document.getElementById('nombre')?.focus();
});

// ===== Estado =====
const pacientesMap = new Map();
let editId = null;
let odontoIdActual = null;
let odontoReady = false;

// ===== Helpers =====
const toISO = (d)=> d.toISOString().split('T')[0];
const toDDMMAAAA = (iso) => { if (!iso) return ''; const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };

function calcularRecordatorio(meses, baseISO) {
  const base = baseISO ? new Date(baseISO) : new Date();
  const mant = new Date(base); mant.setMonth(mant.getMonth() + meses);
  const rec = new Date(mant);  rec.setDate(rec.getDate() - 7);
  return toISO(rec);
}
function actualizarRecordatorio() {
  const meses = parseInt(mantenimientoSel.value || '1', 10);
  const base  = fechaBase.value || toISO(new Date());
  const iso   = calcularRecordatorio(meses, base);
  fechaISO.value = iso;
  fechaDDMMAAAA.value = toDDMMAAAA(iso);
}
mantenimientoSel.addEventListener('change', actualizarRecordatorio);
fechaBase.addEventListener('change', actualizarRecordatorio);

// Teléfonos / WhatsApp
const ONLY_DIGITS = s => (s||'').replace(/\D/g,'');
const splitLocalFromStored = (phone) => {
  const d = ONLY_DIGITS(phone);
  if (d.startsWith('595')) return d.slice(3);
  if (d.startsWith('0'))   return d.slice(1);
  return d.length > 9 ? d.slice(-9) : d;
};
const toWaNumber = (stored) => {
  const d = ONLY_DIGITS(stored);
  if (!d) return '';
  if (d.startsWith('595')) return d;
  if (d.startsWith('0'))   return '595' + d.slice(1);
  if (d.length <= 9)       return '595' + d;
  return d;
};

// ===== RTDB =====
const pacientesRef = ref(db, 'pacientes');
onChildAdded(pacientesRef, (snap) => { pacientesMap.set(snap.key, { _id: snap.key, ...snap.val() }); renderAll(); });
onChildChanged(pacientesRef, (snap) => { pacientesMap.set(snap.key, { _id: snap.key, ...snap.val() }); renderAll(); });
onChildRemoved(pacientesRef, (snap) => { pacientesMap.delete(snap.key); renderAll(); });

// ===== Filtro Dx =====
const filterDxGroup = document.getElementById('filterDx');
let currentDxFilter = '';
if (filterDxGroup) {
  // estilo inicial: "Todos" activo
  [...filterDxGroup.querySelectorAll('button')][0]?.classList.add('active');
  filterDxGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-dx]');
    if (!btn) return;
    [...filterDxGroup.querySelectorAll('button')].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentDxFilter = btn.getAttribute('data-dx') || '';
    renderTable();
  });
}

// ===== Render =====
function snapshotToArray() { return Array.from(pacientesMap.values()); }

function dxBadge(p){
  const dx = p?.odontograma?.diagnosticoEncia;
  if (!dx) return '<span class="text-muted">—</span>';
  if (dx === 'sano') return '<span class="badge bg-success">Sano</span>';
  if (dx === 'gingivitis') return '<span class="badge bg-warning text-dark">Gingivitis</span>';
  if (dx === 'periodontitis') return '<span class="badge bg-danger">Periodontitis</span>';
  return `<span class="badge bg-secondary">${dx}</span>`;
}

function renderTable() {
  const q = (searchMain.value || '').toLowerCase();
  const data = snapshotToArray()
    .filter(p => !q || (p.nombre||'').toLowerCase().includes(q) || (p.telefono||'').toLowerCase().includes(q))
    .filter(p => !currentDxFilter || (p.odontograma?.diagnosticoEncia || '') === currentDxFilter)
    .sort((a,b)=> (a.nombre||'').localeCompare(b.nombre||'', 'es', {sensitivity:'base'}));

  tablaBody.innerHTML = '';
  if (!data.length) {
    tablaBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">Sin resultados</td></tr>`;
    return;
  }
  for (const p of data) {
    const tr = document.createElement('tr');
    const hora = p.horaRecordatorio ? ` ${p.horaRecordatorio}` : '';

    const telRaw = p.telefono || '';
    const telDigits = ONLY_DIGITS(telRaw);
    const waDigits = window.FEATURES.whatsappLink ? toWaNumber(telRaw) : '';
    const waLink = waDigits ? `https://wa.me/${waDigits}` : '';
    const telCell = `
      ${telDigits || ''}
      ${waLink ? `<a href="${waLink}" target="_blank" rel="noopener" class="btn btn-success btn-sm ms-2" title="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>` : ''}
    `;

    tr.innerHTML = `
      <td>${p.nombre ?? ''}</td>
      <td>${telCell}</td>
      <td>${p.mantenimiento ? p.mantenimiento + ' meses' : '-'}</td>
      <td>${dxBadge(p)}</td>
      <td>${p.fechaRecordatorio ? toDDMMAAAA(p.fechaRecordatorio) : '-'}${hora}</td>
      <td>
        <div class="d-flex gap-1">
          <button class="btn btn-primary btn-sm" title="Ver odontograma" data-odonto="${p._id}">
            <i class="fa-solid fa-tooth"></i>
          </button>
          <button class="btn btn-info btn-sm"    title="Agregar al Calendario" data-ics="${p._id}"><i class="fa-solid fa-calendar-plus"></i></button>
          <button class="btn btn-warning btn-sm" title="Editar"                data-edit="${p._id}"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-sm"  title="Eliminar"              data-del="${p._id}"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>`;
    tablaBody.appendChild(tr);
  }
}

function actualizarContadores(){
  const hoy = new Date(toISO(new Date()));
  const in7 = new Date(hoy); in7.setDate(in7.getDate()+7);
  const arr = snapshotToArray();
  document.getElementById('counterTotal').textContent = arr.length;
  document.getElementById('counterConRec').textContent = arr.filter(p=>p.fechaRecordatorio).length;
  document.getElementById('counterProx7').textContent = arr.filter(p=>{ if(!p.fechaRecordatorio) return false; const fr=new Date(p.fechaRecordatorio); return fr>=hoy && fr<=in7; }).length;
  document.getElementById('counterVencidos').textContent = arr.filter(p=> p.fechaRecordatorio && new Date(p.fechaRecordatorio) < hoy).length;
}
function renderAll(){ renderTable(); actualizarContadores(); }

// ===== Acciones de fila =====
tablaBody.addEventListener('click', async (e) => {
  const btnOdonto = e.target.closest('[data-odonto]');
  const btnICS    = e.target.closest('[data-ics]');
  const btnEdit   = e.target.closest('[data-edit]');
  const btnDel    = e.target.closest('[data-del]');

  if (btnOdonto) openOdonto(btnOdonto.getAttribute('data-odonto'));
  if (btnICS)    { const p = pacientesMap.get(btnICS.getAttribute('data-ics')); if (p) downloadICS(p); }
  if (btnEdit)   openEdit(btnEdit.getAttribute('data-edit'));
  if (btnDel) {
    const id = btnDel.getAttribute('data-del');
    if (!confirm('¿Eliminar este paciente?')) return;
    try { await remove(ref(db, 'pacientes/' + id)); }
    catch (e) { alert('No se pudo eliminar: ' + (e?.message || e)); }
  }
});

// ===== Odontograma (modal) =====
async function openOdonto(id){
  const p = pacientesMap.get(id);
  if (!p) return;
  odontoIdActual = id;
  odontoReady = false;

  modalOdontoEl.querySelector('.modal-title').textContent = `Odontograma — ${p.nombre ?? ''}`;
  setDx(p.odontograma?.diagnosticoEncia || 'sano');

  odontoNoFile.classList.add('d-none');
  odontoFrame.style.display = 'none';

  try {
    const head = await fetch(ODONTO_URL, { method:'HEAD', cache:'no-store' });
    if (!head.ok) throw new Error('404');

    odontoFrame.src = `${ODONTO_URL}?t=${Date.now()}`;
    odontoFrame.onload = () => {
      odontoReady = true;
      try {
        const state = p.odontograma || null;
        const fn = odontoFrame.contentWindow?.setOdontogramaState;
        const looksRecursive = fn && /setOdontogramaState\(newState\)/.test(fn.toString());
        if (state && fn && !looksRecursive) fn(state);
      } catch(e){ console.warn('[ODONTO] set state error:', e); }
      odontoFrame.style.display = 'block';
    };
  } catch (e) {
    odontoNoFile.innerHTML = `
      <b>No encuentro <code>${ODONTO_URL}</code></b> en tu hosting.<br>
      Subí el archivo a la raíz y probá abrir: <code>/${ODONTO_URL}</code>.
    `;
    odontoNoFile.classList.remove('d-none');
  }

  modalOdonto.show();
}

guardarOdontoBtn.addEventListener('click', async () => {
  if (!odontoIdActual) return;
  const p = pacientesMap.get(odontoIdActual);
  if (!p) return;

  let state = {};
  try {
    if (odontoReady && odontoFrame.contentWindow?.getOdontogramaState) {
      state = odontoFrame.contentWindow.getOdontogramaState() || {};
    }
  } catch(e){ console.warn('[ODONTO] get state error', e); }

  state = (state && typeof state === 'object') ? state : {};
  state.diagnosticoEncia = getDx();

  try {
    await update(ref(db, 'pacientes/' + odontoIdActual), { odontograma: state });
    pacientesMap.set(odontoIdActual, { ...p, odontograma: state });
    renderAll();
    modalOdonto.hide();
  } catch (e) {
    alert('No se pudo guardar el odontograma: ' + (e?.message || e));
  }
});

// ===== Modal Agregar/Editar =====
function openEdit(id) {
  const p = pacientesMap.get(id);
  if (!p) return;
  editId = id;
  document.getElementById('nombre').value   = p.nombre || '';
  const local = splitLocalFromStored(p.telefono);
  document.getElementById('telefono').value = local || '';
  mantenimientoSel.value = String(p.mantenimiento || 1);
  fechaBase.value = p.fechaBase || toISO(new Date());
  const iso = p.fechaRecordatorio || calcularRecordatorio(parseInt(mantenimientoSel.value,10), fechaBase.value);
  fechaISO.value = iso;
  fechaDDMMAAAA.value = toDDMMAAAA(iso);
  horaInput.value = p.horaRecordatorio || '09:00';
  document.querySelector('#modalPaciente .modal-title').textContent = 'Editar Paciente';
  modalPaciente.show();
}

btnAgregar.addEventListener('click', () => {
  editId = null;
  document.getElementById('formPaciente').reset();
  mantenimientoSel.value = '1';
  fechaBase.value = toISO(new Date());
  actualizarRecordatorio();
  horaInput.value = '09:00';
  document.querySelector('#modalPaciente .modal-title').textContent = 'Agregar Paciente';
  modalPaciente.show();
});

// Guardar ficha
guardarBtn.addEventListener('click', async () => {
  const nombre = document.getElementById('nombre').value.trim();
  const telLocal = ONLY_DIGITS(document.getElementById('telefono').value);
  const mantenimiento = parseInt(mantenimientoSel.value || '1', 10);

  if (!fechaBase.value) fechaBase.value = toISO(new Date());
  if (!fechaISO.value) actualizarRecordatorio();

  const fechaRecordatorio = fechaISO.value;
  const horaRecordatorio  = horaInput.value || null;
  const fechaBaseISO      = fechaBase.value;

  if (!nombre || !telLocal || !fechaRecordatorio) {
    alert('Completa todos los campos');
    return;
  }

  const telefonoFull = '595' + telLocal;

  const payload = { nombre, telefono: telefonoFull, mantenimiento, fechaBase: fechaBaseISO, fechaRecordatorio, horaRecordatorio };

  try {
    if (editId) {
      await update(ref(db, 'pacientes/' + editId), payload);
    } else {
      await push(ref(db, 'pacientes'), { ...payload, createdAt: Date.now() });
    }
    document.activeElement?.blur();
    requestAnimationFrame(() => modalPaciente.hide());
    searchMain.value = '';
    renderAll();
    editId = null;
  } catch (e) {
    alert('No se pudo guardar: ' + (e?.message || e));
  }
});

// ===== Buscador =====
searchMain.addEventListener('input', renderTable);

// ===== iCal =====
function toICSDate(iso){ if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${y}${m}${d}`; }
function toICSTime(hhmm){ if(!hhmm) return '090000'; const [hh,mm]=hhmm.split(':'); return `${hh}${mm}00`; }
function escapeICS(str=''){ return String(str).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;'); }
function downloadICS(p){
  if (!p.fechaRecordatorio) return alert('Este paciente no tiene fecha de recordatorio.');
  const uid = `${p._id || Math.random().toString(36).slice(2)}@dental-molas`;
  const dtstamp = new Date().toISOString().replace(/[-:]/g,'').replace(/\.[0-9]{3}Z$/, 'Z');
  const datePart = toICSDate(p.fechaRecordatorio);
  const timePart = toICSTime(p.horaRecordatorio);
  const isAllDay = !p.horaRecordatorio;

  const vevent = [
    'BEGIN:VEVENT',
    `UID:${uid}`, `DTSTAMP:${dtstamp}`,
    isAllDay ? `DTSTART;VALUE=DATE:${datePart}` : `DTSTART:${datePart}T${timePart}`,
    isAllDay ? null : 'DURATION:PT30M',
    `SUMMARY:${escapeICS(`Recordatorio: ${p.nombre || 'Paciente'}`)}`,
    `DESCRIPTION:${escapeICS(`Paciente: ${p.nombre || ''}\nTeléfono: ${p.telefono || ''}\nMantenimiento: ${p.mantenimiento ? p.mantenimiento + ' meses' : '—'}`)}`,
    'TRANSP:OPAQUE','BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:Recordatorio de cita','TRIGGER:-P1D','END:VALARM','END:VEVENT'
  ].filter(Boolean).join('\r\n');

  const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Dental Molas//Pacientes//ES','CALSCALE:GREGORIAN','METHOD:PUBLISH',vevent,'END:VCALENDAR'].join('\r\n');
  const blob = new Blob([ics], { type:'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${(p.nombre||'paciente').replace(/[^a-z0-9_-]+/gi,'_')}_recordatorio.ics`;
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },0);
}

// ===== Dashboard =====
function computeMantenimientoCounts(){ return [1,3,6].map(m=>snapshotToArray().filter(p=>p.mantenimiento===m).length); }
function computeAltasSeries(){
  const labels=[], counts=[], now=new Date();
  for(let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    labels.push(d.toLocaleString('es',{month:'short'})+' '+d.getFullYear());
    counts.push(snapshotToArray().filter(p=>p.createdAt && (new Date(p.createdAt).getFullYear()+'-'+String(new Date(p.createdAt).getMonth()+1).padStart(2,'0'))===key).length);
  }
  return {labels,counts};
}
function computeDxEnciaCounts(){
  const counts = { sano:0, gingivitis:0, periodontitis:0 };
  for (const p of snapshotToArray()) {
    const dx = p.odontograma?.diagnosticoEncia;
    if (dx && counts.hasOwnProperty(dx)) counts[dx]++;
  }
  return counts;
}

function renderDashboard(){
  const hoy=new Date(toISO(new Date())); const in7=new Date(hoy); in7.setDate(in7.getDate()+7);
  const arr = snapshotToArray();
  document.getElementById('kpiTotal').textContent = arr.length;
  document.getElementById('kpiConRec').textContent = arr.filter(p=>p.fechaRecordatorio).length;
  document.getElementById('kpiVencidos').textContent = arr.filter(p=> p.fechaRecordatorio && new Date(p.fechaRecordatorio) < hoy).length;
  document.getElementById('kpiProx7').textContent = arr.filter(p=>{ if(!p.fechaRecordatorio) return false; const fr=new Date(p.fechaRecordatorio); return fr>=hoy && fr<=in7; }).length;

  // Pie mantenimiento
  const [c1,c3,c6] = computeMantenimientoCounts();
  const ctxPie = document.getElementById('chartMantenimiento');
  if (ctxPie) {
    if (window.pieMantenimiento) window.pieMantenimiento.destroy();
    window.pieMantenimiento = new Chart(ctxPie, {
      type:'doughnut',
      data:{ labels:['1 mes','3 meses','6 meses'], datasets:[{ data:[c1,c3,c6] }] },
      options:{ responsive:true, plugins:{ legend:{ position:'bottom' } } }
    });
  }

  // Barras altas
  const ctxBar = document.getElementById('chartAltas');
  if (ctxBar) {
    const { labels, counts } = computeAltasSeries();
    if (window.barAltas) window.barAltas.destroy();
    window.barAltas = new Chart(ctxBar, {
      type:'bar',
      data:{ labels, datasets:[{ label:'Altas', data: counts }] },
      options:{ responsive:true, scales:{ y:{ beginAtZero:true, precision:0 } } }
    });
  }

  // Pie Dx Encía
  const ctxDx = document.getElementById('chartDxEncia');
  if (ctxDx) {
    const c = computeDxEnciaCounts();
    if (window.pieDxEncia) window.pieDxEncia.destroy();
    window.pieDxEncia = new Chart(ctxDx, {
      type: 'doughnut',
      data: { labels: ['Sano','Gingivitis','Periodontitis'],
              datasets: [{ data: [c.sano, c.gingivitis, c.periodontitis],
                           backgroundColor: ['#22c55e','#f59e0b','#ef4444'] }] },
      options: { responsive:true, plugins:{ legend:{ position:'bottom' } } }
    });
  }
}

// Abrir dashboard y render cuando esté visible (evita canvas 0x0)
btnDashboard.addEventListener('click', () => {
  const m = new bootstrap.Modal(modalDashboardEl);
  m.show();
});
modalDashboardEl.addEventListener('shown.bs.modal', renderDashboard);

// ===== Init =====
console.log('[APP] DOM OK');
