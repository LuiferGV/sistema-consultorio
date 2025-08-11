// Dental Molas - Sistema de Pacientes - Periodoncia
// v1.3.4 — Fix crítico: sin duplicados de variables (btnLogin); incluye filtro A–Z, ficha, tratamientos, login, etc.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getDatabase, ref, onChildAdded, onChildChanged, onChildRemoved,
  off, push, remove, update, set
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  setPersistence, browserLocalPersistence, browserSessionPersistence,
  sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';

window.FEATURES = Object.assign({ whatsappLink:true, phonePrefix595:true }, window.FEATURES || {});
const APP_VERSION = 'v1.3.4';
const ODONTO_URL  = 'odontograma_svg_interactivo_fdi_v_1.html';

// ===== Firebase =====
const firebaseConfig = {
  apiKey: "AIzaSyB4v68jVnlVrpM4n4A23fv23OKibY_Kqq8",
  authDomain: "sistema-consultorio-53424.firebaseapp.com",
  databaseURL: "https://sistema-consultorio-53424-default-rtdb.firebaseio.com/",
  projectId: "sistema-consultorio-53424",
  storageBucket: "sistema-consultorio-53424.appspot.com",
  messagingSenderId: "701715985597",
  appId: "1:701715985597:web:91c80fdd071edb71d433d4"
};
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);
const auth = getAuth(app);
console.log(`[APP ${APP_VERSION}] iniciado`);

// ===== DOM =====
const tablaBody = document.querySelector('#tablaPacientes tbody');
const btnAgregar = document.getElementById('btnAgregar');
const btnDashboard = document.getElementById('btnDashboard');
const mantenimientoSel = document.getElementById('mantenimiento');
const fechaDDMMAAAA = document.getElementById('fechaRecordatorioDDMMAAAA');
const fechaISO  = document.getElementById('fechaRecordatorioISO');
const searchMain = document.getElementById('searchMain');
const horaInput  = document.getElementById('horaRecordatorio');
const guardarBtn = document.getElementById('guardarPaciente');
const fechaBase  = document.getElementById('fechaBase');
const modalPacienteEl = document.getElementById('modalPaciente');

const authOverlay   = document.getElementById('authOverlay');
const loginEmail    = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const rememberMe    = document.getElementById('rememberMe');
const btnLogin      = document.getElementById('btnLogin'); // <-- único lugar donde se declara
const btnLogout     = document.getElementById('btnLogout');
const userEmailSpan = document.getElementById('userEmail');
const authErrorBox  = document.getElementById('authError');
const authInfoBox   = document.getElementById('authInfo');
const linkReset     = document.getElementById('linkReset');

const modalOdontoEl    = document.getElementById('modalOdonto');
const odontoFrame      = document.getElementById('odontoFrame');
const odontoNoFile     = document.getElementById('odontoNoFile');
const guardarOdontoBtn = document.getElementById('guardarOdonto');
const dxRadios         = document.querySelectorAll('input[name="dxEncia"]');
const getDx = () => [...dxRadios].find(r => r.checked)?.value || 'sano';
const setDx = (v) => dxRadios.forEach(r => r.checked = (r.value === (v || 'sano')));

const modalDashboardEl = document.getElementById('modalDashboard');
const modalPaciente = new bootstrap.Modal(modalPacienteEl);

// FICHA
const modalFichaEl      = document.getElementById('modalFicha');
const modalFicha        = new bootstrap.Modal(modalFichaEl);
const fichaNombreEl     = document.getElementById('fichaNombre');
const fNombreEl         = document.getElementById('fNombre');
const fTelefonoEl       = document.getElementById('fTelefono');
const fWhatsEl          = document.getElementById('fWhats');
const fIngresoEl        = document.getElementById('fIngreso');
const fMantEl           = document.getElementById('fMant');
const fDxEl             = document.getElementById('fDx');
const fRecordatorioEl   = document.getElementById('fRecordatorio');
const fichaOdontoWarn   = document.getElementById('fichaOdontoWarn');
const fichaOdontoFrame  = document.getElementById('fichaOdontoFrame');
const tratFechaInput    = document.getElementById('tratFecha');
const tratDetalleInput  = document.getElementById('tratDetalle');
const btnAddTrat        = document.getElementById('btnAddTrat');
const tratListEl        = document.getElementById('tratList');

// ===== Estado =====
const pacientesMap = new Map();
let editId = null;
let odontoIdActual = null;
let odontoReady = false;
let listenersOn = false;
let fichaIdActual = null;

// cache y refs para tratamientos (solo ficha abierta)
let tratRef = null;
let tratItems = [];

// ===== Filtros =====
const filterDxGroup = document.getElementById('filterDx');
let currentDxFilter = '';
if (filterDxGroup) {
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

const sortRecGroup = document.getElementById('sortRec');
let currentSort = ''; // '', 'prox', 'lej'
if (sortRecGroup) {
  sortRecGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-sort]');
    if (!btn) return;
    const buttons = [...sortRecGroup.querySelectorAll('button')];
    if (btn.classList.contains('active')) {
      btn.classList.remove('active');
      currentSort = '';
    } else {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSort = btn.getAttribute('data-sort') || '';
    }
    renderTable();
  });
}

// Filtro alfabético
const alphaBar = document.getElementById('alphaBar');
let currentAlpha = ''; // '', 'a'...'z'
if (alphaBar) {
  const firstBtn = alphaBar.querySelector('[data-alpha=""]');
  firstBtn?.classList.add('active');
  alphaBar.addEventListener('click', (e)=>{
    const btn = e.target.closest('button[data-alpha]');
    if (!btn) return;
    const letter = btn.getAttribute('data-alpha') || '';
    if (btn.classList.contains('active')) {
      btn.classList.remove('active');
      currentAlpha = '';
      firstBtn?.classList.add('active');
    } else {
      alphaBar.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      currentAlpha = letter;
    }
    renderTable();
  });
}

// ===== Helpers =====
const toISO = (d)=> d.toISOString().split('T')[0];
const toDDMMAAAA = (iso) => { if (!iso) return ''; const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };
const ONLY_DIGITS = s => (s||'').replace(/\D/g,'');
const dateOrNull = (p) => p?.fechaRecordatorio ? new Date(p.fechaRecordatorio) : null;

function normalizeName(s) {
  return (s||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .trim()
    .toLowerCase();
}

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
mantenimientoSel?.addEventListener('change', actualizarRecordatorio);
fechaBase?.addEventListener('change', actualizarRecordatorio);

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

// ===== Auth =====
function showOverlay(show){
  authOverlay.style.display = show ? 'flex' : 'none';
  userEmailSpan.classList.toggle('d-none', show);
  btnLogout.classList.toggle('d-none', show);
}
function setAuthMessage(type, text){
  const box = type === 'info' ? authInfoBox : authErrorBox;
  authInfoBox.classList.add('d-none'); authErrorBox.classList.add('d-none');
  if (text) { box.textContent = text; box.classList.remove('d-none'); }
}
btnLogin.addEventListener('click', async ()=> {
  const email = loginEmail.value.trim();
  const pass  = loginPassword.value.trim();
  setAuthMessage('error',''); setAuthMessage('info','');
  if (!email || !pass) { setAuthMessage('error','Completa email y contraseña.'); return; }
  btnLogin.disabled = true;
  try {
    await setPersistence(auth, rememberMe.checked ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    setAuthMessage('error', 'No se pudo iniciar sesión: ' + (e?.message || e));
  } finally {
    btnLogin.disabled = false;
  }
});
btnLogout.addEventListener('click', ()=> signOut(auth));
linkReset.addEventListener('click', async (e) => {
  e.preventDefault();
  setAuthMessage('error',''); setAuthMessage('info','');
  const email = loginEmail.value.trim();
  if (!email) { setAuthMessage('error','Ingresá tu email para enviarte el link.'); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    setAuthMessage('info','Te envié un email para restablecer la contraseña.');
  } catch (e) {
    setAuthMessage('error','No pude enviar el mail: ' + (e?.message || e));
  }
});
onAuthStateChanged(auth, (user) => {
  if (user) {
    userEmailSpan.textContent = user.email || '';
    showOverlay(false);
    attachListeners();
  } else {
    detachListeners();
    pacientesMap.clear();
    renderAll();
    showOverlay(true);
    loginPassword.value = '';
    loginEmail.focus();
  }
});

// ===== RTDB listeners =====
const pacientesRef = ref(db, 'pacientes');
function attachListeners(){
  if (listenersOn) return;
  onChildAdded(pacientesRef, (snap) => { pacientesMap.set(snap.key, { _id: snap.key, ...snap.val() }); renderAll(); });
  onChildChanged(pacientesRef, (snap) => { pacientesMap.set(snap.key, { _id: snap.key, ...snap.val() }); renderAll(); });
  onChildRemoved(pacientesRef, (snap) => { pacientesMap.delete(snap.key); renderAll(); });
  listenersOn = true;
}
function detachListeners(){
  if (!listenersOn) return;
  off(pacientesRef);
  listenersOn = false;
}

// ===== Render =====
function snapshotToArray() { return Array.from(pacientesMap.values()); }
function dxBadge(p){
  const dx = p?.odontograma?.diagnosticoEncia || 'sano';
  if (dx === 'sano') return '<span class="badge bg-success">Sano</span>';
  if (dx === 'gingivitis') return '<span class="badge bg-warning text-dark">Gingivitis</span>';
  if (dx === 'periodontitis') return '<span class="badge bg-danger">Periodontitis</span>';
  return `<span class="badge bg-secondary">${dx}</span>`;
}
function renderTable() {
  const q = (searchMain.value || '').toLowerCase();

  let data = snapshotToArray()
    .filter(p => !q || (p.nombre||'').toLowerCase().includes(q) || (p.telefono||'').toLowerCase().includes(q))
    .filter(p => !currentDxFilter || (p.odontograma?.diagnosticoEncia || 'sano') === currentDxFilter)
    .filter(p => {
      if (!currentAlpha) return true;
      const n = normalizeName(p.nombre || '');
      if (!n) return false;
      return n.charAt(0) === currentAlpha;
    });

  if (currentSort === 'prox' || currentSort === 'lej') {
    data.sort((a,b)=>{
      const da = dateOrNull(a), db = dateOrNull(b);
      if (da && db) return currentSort === 'lej' ? (db - da) : (da - db);
      if (da && !db) return -1;
      if (!da && db) return 1;
      return (a.nombre||'').localeCompare(b.nombre||'','es',{sensitivity:'base'});
    });
  } else {
    data.sort((a,b)=> (a.nombre||'').localeCompare(b.nombre||'','es',{sensitivity:'base'}));
  }

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
      <td>${p.fechaRecordatorio ? toDDMMAAAA(p.fechaRecordatorio) : '—'}${hora}</td>
      <td>
        <div class="d-flex gap-1">
          <button class="btn btn-eye btn-sm" title="Ver ficha" data-view="${p._id}">
            <i class="fa-regular fa-eye"></i>
          </button>
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

// ===== Acciones fila =====
tablaBody.addEventListener('click', async (e) => {
  const btnView  = e.target.closest('[data-view]');
  const btnOdonto= e.target.closest('[data-odonto]');
  const btnICS   = e.target.closest('[data-ics]');
  const btnEdit  = e.target.closest('[data-edit]');
  const btnDel   = e.target.closest('[data-del]');

  if (btnView)  openFicha(btnView.getAttribute('data-view'));
  if (btnOdonto) openOdonto(btnOdonto.getAttribute('data-odonto'));
  if (btnICS)   { const p = pacientesMap.get(btnICS.getAttribute('data-ics')); if (p) downloadICS(p); }
  if (btnEdit)  openEdit(btnEdit.getAttribute('data-edit'));
  if (btnDel) {
    const id = btnDel.getAttribute('data-del');
    if (!confirm('¿Eliminar este paciente?')) return;
    try { await remove(ref(db, 'pacientes/' + id)); }
    catch (e) { alert('No se pudo eliminar: ' + (e?.message || e)); }
  }
});

// ===== Odontograma (edición) =====
async function openOdonto(id){
  const p = pacientesMap.get(id);
  if (!p) return;
  odontoIdActual = id;
  odontoReady = false;

  document.querySelector('#modalOdonto .modal-title').textContent = `Odontograma — ${p.nombre ?? ''}`;
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
        if (state && fn) fn(state);
      } catch(e){ console.warn('[ODONTO] set state error:', e); }
      odontoFrame.style.display = 'block';
    };
  } catch (e) {
    odontoNoFile.innerHTML = `<b>No encuentro <code>${ODONTO_URL}</code></b>. Subí el archivo a la raíz.`;
    odontoNoFile.classList.remove('d-none');
  }
  new bootstrap.Modal(modalOdontoEl).show();
}
guardarOdontoBtn.addEventListener('click', async () => {
  const p = pacientesMap.get(odontoIdActual || '');
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
    bootstrap.Modal.getInstance(modalOdontoEl)?.hide();
  } catch (e) {
    alert('No se pudo guardar el odontograma: ' + (e?.message || e));
  }
});

// ===== FICHA (view) =====
modalFichaEl.addEventListener('hidden.bs.modal', ()=>{
  if (tratRef) { off(tratRef); tratRef = null; }
  tratItems = [];
  fichaOdontoFrame.src = 'about:blank';
});

async function openFicha(id){
  const p = pacientesMap.get(id);
  if (!p) return;
  fichaIdActual = id;

  fichaNombreEl.textContent = p.nombre || '';
  fNombreEl.textContent = p.nombre || '';
  const tel = ONLY_DIGITS(p.telefono || '');
  fTelefonoEl.textContent = tel || '—';
  const wa = toWaNumber(p.telefono || '');
  if (wa) { fWhatsEl.href = `https://wa.me/${wa}`; fWhatsEl.classList.remove('d-none'); }
  else { fWhatsEl.classList.add('d-none'); }
  fIngresoEl.textContent = p.fechaBase ? toDDMMAAAA(p.fechaBase) : '—';
  fMantEl.textContent = p.mantenimiento ? (p.mantenimiento + ' meses') : '—';
  fDxEl.innerHTML = dxBadge(p);
  fRecordatorioEl.textContent = p.fechaRecordatorio
    ? `${toDDMMAAAA(p.fechaRecordatorio)}${p.horaRecordatorio ? ' ' + p.horaRecordatorio : ''}`
    : '—';

  // Odonto (view)
  fichaOdontoWarn.classList.add('d-none');
  fichaOdontoFrame.style.display = 'none';
  try {
    const head = await fetch(ODONTO_URL, { method:'HEAD', cache:'no-store' });
    if (!head.ok) throw new Error('404');
    fichaOdontoFrame.src = `${ODONTO_URL}?view=1&t=${Date.now()}`;
    fichaOdontoFrame.onload = () => {
      try {
        const fn = fichaOdontoFrame.contentWindow?.setOdontogramaState;
        const state = p.odontograma || null;
        if (state && fn) fn(state);
      } catch (e) { console.warn('[FICHA] set odonto state error:', e); }
      fichaOdontoFrame.style.display = 'block';
    };
  } catch (e) {
    fichaOdontoWarn.textContent = `No encuentro ${ODONTO_URL}. Subí el archivo a la raíz.`;
    fichaOdontoWarn.classList.remove('d-none');
  }

  // Tratamientos
  if (tratRef) { off(tratRef); }
  tratItems = [];
  tratRef = ref(db, `pacientes/${id}/tratamientos`);
  onChildAdded(tratRef, (snap)=>{ tratItems.push({ _id:snap.key, ...snap.val() }); renderTratListSorted(); });
  onChildRemoved(tratRef, (snap)=>{ tratItems = tratItems.filter(x=>x._id!==snap.key); renderTratListSorted(); });

  renderTratListSorted();
  modalFicha.show();
}
function renderTratListSorted(){
  const items = [...tratItems];
  items.sort((a,b)=>{
    const da = a.fecha || '', dbb = b.fecha || '';
    if (da !== dbb) return dbb.localeCompare(da);
    return (b.createdAt||0) - (a.createdAt||0);
  });
  renderTratList(items);
}
function renderTratList(items){
  if (!items.length) {
    tratListEl.innerHTML = `<div class="list-group-item text-muted">Sin tratamientos registrados.</div>`;
    return;
  }
  tratListEl.innerHTML = '';
  for (const it of items) {
    const div = document.createElement('div');
    div.className = 'list-group-item d-flex justify-content-between align-items-center';
    const fecha = it.fecha ? toDDMMAAAA(it.fecha) : '—';
    div.innerHTML = `
      <div>
        <span class="badge bg-secondary me-2">${fecha}</span>
        <span>${(it.detalle || '').replace(/</g,'&lt;')}</span>
      </div>
      <button class="btn btn-sm btn-outline-danger" title="Eliminar" data-del-trat="${it._id}">
        <i class="fa-solid fa-trash"></i>
      </button>
    `;
    tratListEl.appendChild(div);
  }
}
btnAddTrat?.addEventListener('click', async ()=>{
  if (!fichaIdActual) return;
  const fecha = tratFechaInput.value || toISO(new Date());
  const detalle = tratDetalleInput.value.trim();
  if (!detalle) { alert('Escribe el detalle del tratamiento.'); return; }
  btnAddTrat.disabled = true;
  try {
    const newRef = push(ref(db, `pacientes/${fichaIdActual}/tratamientos`));
    await set(newRef, { fecha, detalle, createdAt: Date.now() });
    tratDetalleInput.value = '';
  } catch (e) {
    alert('No se pudo guardar el tratamiento: ' + (e?.message || e));
  } finally {
    btnAddTrat.disabled = false;
  }
});
tratListEl.addEventListener('click', async (e)=>{
  const btn = e.target.closest('[data-del-trat]');
  if (!btn || !fichaIdActual) return;
  const key = btn.getAttribute('data-del-trat');
  if (!confirm('¿Eliminar este tratamiento?')) return;
  try { await remove(ref(db, `pacientes/${fichaIdActual}/tratamientos/${key}`)); }
  catch (e) { alert('No se pudo eliminar: ' + (e?.message || e)); }
});

// ===== Modal Paciente =====
modalPacienteEl.addEventListener('shown.bs.modal', () => document.getElementById('nombre')?.focus());
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
  new bootstrap.Modal(modalPacienteEl).show();
}
btnAgregar.addEventListener('click', () => {
  editId = null;
  document.getElementById('formPaciente').reset();
  mantenimientoSel.value = '1';
  fechaBase.value = toISO(new Date());
  actualizarRecordatorio();
  horaInput.value = '09:00';
  document.querySelector('#modalPaciente .modal-title').textContent = 'Agregar Paciente';
  new bootstrap.Modal(modalPacienteEl).show();
});
guardarBtn.addEventListener('click', async () => {
  const nombre = document.getElementById('nombre').value.trim();
  const telLocal = ONLY_DIGITS(document.getElementById('telefono').value);
  const mantenimiento = parseInt(mantenimientoSel.value || '1', 10);
  if (!fechaBase.value) fechaBase.value = toISO(new Date());
  if (!fechaISO.value) actualizarRecordatorio();

  const fechaRecordatorio = fechaISO.value;
  const horaRecordatorio  = horaInput.value || null;
  const fechaBaseISO      = fechaBase.value;

  if (!nombre || !telLocal || !fechaRecordatorio) { alert('Completa todos los campos'); return; }
  const telefonoFull = '595' + telLocal;

  const payload = { nombre, telefono: telefonoFull, mantenimiento, fechaBase: fechaBaseISO, fechaRecordatorio, horaRecordatorio };

  try {
    if (editId) {
      await update(ref(db, 'pacientes/' + editId), payload);
    } else {
      await push(ref(db, 'pacientes'), {
        ...payload,
        odontograma: { diagnosticoEncia: 'sano' },
        createdAt: Date.now()
      });
    }
    document.activeElement?.blur();
    requestAnimationFrame(() => bootstrap.Modal.getInstance(modalPacienteEl)?.hide());
    searchMain.value = '';
    renderAll(); editId = null;
  } catch (e) {
    alert('No se pudo guardar: ' + (e?.message || e));
  }
});

// ===== iCal / Dashboard =====
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
    'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${dtstamp}`,
    isAllDay ? `DTSTART;VALUE=DATE:${datePart}` : `DTSTART:${datePart}T${timePart}`,
    isAllDay ? null : 'DURATION:PT30M',
    `SUMMARY:${escapeICS(`Recordatorio: ${p.nombre || 'Paciente'}`)}`,
    `DESCRIPTION:${escapeICS(`Paciente: ${p.nombre || ''}\nTeléfono: ${p.telefono || ''}\nMantenimiento: ${p.mantenimiento ? p.mantenimiento + ' meses' : '—'}`)}`,
    'TRANSP:OPAQUE','BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:Recordatorio de cita','TRIGGER:-P1D','END:VALARM','END:VEVENT'
  ].filter(Boolean).join('\r\n');
  const ics = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Dental Molas//Pacientes//ES','CALSCALE:GREGORIAN','METHOD:PUBLISH',vevent,'END:VCALENDAR'].join('\r\n');
  const blob = new Blob([ics], { type:'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${(p.nombre||'paciente').replace(/[^a-z0-9_-]+/gi,'_')}_recordatorio.ics`;
  document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },0);
}

function snapshot() { return snapshotToArray(); }
function computeMantenimientoCounts(){ return [1,3,6].map(m=>snapshot().filter(p=>p.mantenimiento===m).length); }
function computeAltasSeries(){
  const labels=[], counts=[], now=new Date();
  for(let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    labels.push(d.toLocaleString('es',{month:'short'})+' '+d.getFullYear());
    counts.push(snapshot().filter(p=>p.createdAt && (new Date(p.createdAt).getFullYear()+'-'+String(new Date(p.createdAt).getMonth()+1).padStart(2,'0'))===key).length);
  }
  return {labels,counts};
}
function computeDxEnciaCounts(){
  const counts = { sano:0, gingivitis:0, periodontitis:0 };
  for (const p of snapshot()) {
    const dx = p.odontograma?.diagnosticoEncia || 'sano';
    if (counts.hasOwnProperty(dx)) counts[dx]++;
  }
  return counts;
}
function renderDashboard(){
  const hoy=new Date(toISO(new Date())); const in7=new Date(hoy); in7.setDate(in7.getDate()+7);
  const arr = snapshot();
  document.getElementById('kpiTotal').textContent = arr.length;
  document.getElementById('kpiConRec').textContent = arr.filter(p=>p.fechaRecordatorio).length;
  document.getElementById('kpiVencidos').textContent = arr.filter(p=> p.fechaRecordatorio && new Date(p.fechaRecordatorio) < hoy).length;
  document.getElementById('kpiProx7').textContent = arr.filter(p=>{ if(!p.fechaRecordatorio) return false; const fr=new Date(p.fechaRecordatorio); return fr>=hoy && fr<=in7; }).length;

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
btnDashboard.addEventListener('click', () => { new bootstrap.Modal(modalDashboardEl).show(); });
modalDashboardEl.addEventListener('shown.bs.modal', renderDashboard);

// ===== Init =====
console.log('[APP] DOM OK');
