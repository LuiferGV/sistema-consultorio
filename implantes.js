// Dental Molas — Módulo de Implantes
// v1.4.0 — Módulo independiente (lista por paciente + múltiples implantes por ficha)

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getDatabase, ref, onChildAdded, onChildChanged, onChildRemoved,
  off, push, remove, update, set, get, child
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  setPersistence, browserLocalPersistence, browserSessionPersistence,
  sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const APP_VERSION = 'implantes v1.4.0';
const BASE = 'implantes'; // árbol propio: implantes/pacientes

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
console.log(`[${APP_VERSION}] iniciado`);

// ===== DOM =====
const tablaBody = document.querySelector('#tablaPacientes tbody');
const btnAgregar = document.getElementById('btnAgregar');

const searchMain = document.getElementById('searchMain');
const alphaBar   = document.getElementById('alphaBar');

const modalPacienteEl = document.getElementById('modalPaciente');
const modalPaciente   = new bootstrap.Modal(modalPacienteEl);
const guardarBtn      = document.getElementById('guardarPaciente');

// Form alta paciente + primer implante
const nombreInput   = document.getElementById('nombre');
const celularInput  = document.getElementById('celular');
const fechaCirInput = document.getElementById('fechaCirugia');
const dienteInput   = document.getElementById('dienteFDI');
const tipoInput     = document.getElementById('tipoImplante');
const implanteInput = document.getElementById('implante');
const torqueInput   = document.getElementById('torque');
const frecInput     = document.getElementById('frecCorona');
const fechaCoronaTxt= document.getElementById('fechaCoronaDDMMAAAA');
const fechaCoronaISO= document.getElementById('fechaCoronaISO');

// Ficha
const modalFichaEl  = document.getElementById('modalFicha');
const modalFicha    = new bootstrap.Modal(modalFichaEl);
const fichaNombreEl = document.getElementById('fichaNombre');
const fNombreEl     = document.getElementById('fNombre');
const fCelularEl    = document.getElementById('fCelular');
const fWhatsEl      = document.getElementById('fWhats');
const fCountEl      = document.getElementById('fCount');
const implantesList = document.getElementById('implantesList');

const iDiente   = document.getElementById('iDiente');
const iTipo     = document.getElementById('iTipo');
const iImplante = document.getElementById('iImplante');
const iTorque   = document.getElementById('iTorque');
const iFecha    = document.getElementById('iFecha');
const iFrec     = document.getElementById('iFrec');
const btnAddImplante = document.getElementById('btnAddImplante');

// Auth UI
const authOverlay   = document.getElementById('authOverlay');
const loginEmail    = document.getElementById('loginEmail');
const loginPassword = document.getElementById('loginPassword');
const rememberMe    = document.getElementById('rememberMe');
const btnLogin      = document.getElementById('btnLogin');
const btnLogout     = document.getElementById('btnLogout');
const userEmailSpan = document.getElementById('userEmail');
const authErrorBox  = document.getElementById('authError');
const authInfoBox   = document.getElementById('authInfo');
const linkReset     = document.getElementById('linkReset');

// ===== Estado =====
const pacientesMap = new Map(); // id -> { _id, nombre, celular, createdAt, ... }
let listenersOn = false;
let fichaIdActual = null;

// ===== Helpers =====
const toISO = (d)=> d.toISOString().split('T')[0];
const toDDMMAAAA = (iso) => { if (!iso) return ''; const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };
const ONLY_DIGITS = s => (s||'').replace(/\D/g,'');
const normalizeName = (s) => (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();

function addMonthsISO(iso, months){
  if (!iso) return '';
  const [y,m,d] = iso.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  dt.setMonth(dt.getMonth() + months);
  const y2 = dt.getFullYear();
  const m2 = String(dt.getMonth()+1).padStart(2,'0');
  const d2 = String(dt.getDate()).padStart(2,'0');
  return `${y2}-${m2}-${d2}`;
}

function calcCorona(){
  const base = fechaCirInput.value;
  const months = parseInt(frecInput.value||'3',10);
  const iso = base ? addMonthsISO(base, months) : '';
  fechaCoronaISO.value = iso;
  fechaCoronaTxt.value = iso ? toDDMMAAAA(iso) : '';
}
fechaCirInput.addEventListener('change', calcCorona);
frecInput.addEventListener('change', calcCorona);

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
    renderTable();
    showOverlay(true);
    loginPassword.value = '';
    loginEmail.focus();
  }
});

// ===== RTDB =====
const pacientesRef = ref(db, `${BASE}/pacientes`);
function attachListeners(){
  if (listenersOn) return;
  onChildAdded(pacientesRef, (snap)=>{ pacientesMap.set(snap.key, { _id: snap.key, ...snap.val() }); renderTable(); });
  onChildChanged(pacientesRef, (snap)=>{ pacientesMap.set(snap.key, { _id: snap.key, ...snap.val() }); renderTable(); });
  onChildRemoved(pacientesRef, (snap)=>{ pacientesMap.delete(snap.key); renderTable(); });
  listenersOn = true;
}
function detachListeners(){
  if (!listenersOn) return;
  off(pacientesRef);
  listenersOn = false;
}

// ===== Buscar + A-Z =====
let currentAlpha = '';
searchMain.addEventListener('input', renderTable);
(function initAlpha() {
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
})();

// ===== Render tabla (por paciente) =====
function patientsArray(){ return Array.from(pacientesMap.values()); }

function nextCoronaFromImplants(implantes){
  let min = null;
  if (!implantes) return null;
  Object.values(implantes).forEach(x=>{
    if (x.fechaCoronaISO) {
      const d = new Date(x.fechaCoronaISO);
      if (!min || d < min) min = d;
    }
  });
  return min;
}
function waLinkHTML(phone){
  const telDigits = ONLY_DIGITS(phone);
  const waDigits = toWaNumber(phone);
  const waLink = waDigits ? `https://wa.me/${waDigits}` : '';
  return `
    ${telDigits || ''}
    ${waLink ? `<a href="${waLink}" target="_blank" rel="noopener" class="btn btn-success btn-sm ms-2" title="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>` : ''}
  `;
}
function countImplantes(implantes){
  return implantes ? Object.keys(implantes).length : 0;
}

function renderTable(){
  const q = (searchMain.value || '').trim().toLowerCase();
  const qDigits = q.replace(/\D/g,'');
  let data = patientsArray()
    .filter(p=>{
      if (!q && !qDigits) return true;
      const name = (p.nombre||'').toLowerCase();
      const telStr = (p.celular||'').toLowerCase();
      const telDig = ONLY_DIGITS(p.celular||'');
      return (q && (name.includes(q) || telStr.includes(q))) || (qDigits && telDig.includes(qDigits));
    })
    .filter(p=>{
      if (!currentAlpha) return true;
      const n = normalizeName(p.nombre||'');
      if (!n) return false;
      return n.charAt(0) === currentAlpha;
    })
    .sort((a,b)=> (a.nombre||'').localeCompare(b.nombre||'','es',{sensitivity:'base'}));

  tablaBody.innerHTML = '';
  if (!data.length) {
    tablaBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Sin resultados</td></tr>`;
    return;
  }

  for (const p of data) {
    const tr = document.createElement('tr');
    const prox = nextCoronaFromImplants(p.implantes);
    const proxTxt = prox ? toDDMMAAAA(prox.toISOString().slice(0,10)) : '—';
    tr.innerHTML = `
      <td>${p.nombre ?? ''}</td>
      <td>${waLinkHTML(p.celular || '')}</td>
      <td><span class="badge bg-secondary">${countImplantes(p.implantes)}</span></td>
      <td>${proxTxt}</td>
      <td>
        <div class="d-flex gap-1">
          <button class="btn btn-eye btn-sm" title="Ver ficha" data-view="${p._id}">
            <i class="fa-regular fa-eye"></i>
          </button>
          <button class="btn btn-warning btn-sm" title="Editar paciente" data-edit="${p._id}">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn btn-danger btn-sm"  title="Eliminar paciente" data-del="${p._id}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    tablaBody.appendChild(tr);
  }
}

// ===== Acciones de tabla =====
tablaBody.addEventListener('click', async (e)=>{
  const btnView = e.target.closest('[data-view]');
  const btnEdit = e.target.closest('[data-edit]');
  const btnDel  = e.target.closest('[data-del]');
  if (btnView) openFicha(btnView.getAttribute('data-view'));
  if (btnEdit) openEdit(btnEdit.getAttribute('data-edit'));
  if (btnDel) {
    const id = btnDel.getAttribute('data-del');
    if (!confirm('¿Eliminar este paciente y todos sus implantes?')) return;
    try { await remove(ref(db, `${BASE}/pacientes/${id}`)); }
    catch(e){ alert('No se pudo eliminar: ' + (e?.message || e)); }
  }
});

// ===== Agregar (paciente + 1er implante) =====
btnAgregar.addEventListener('click', ()=>{
  document.getElementById('formPaciente').reset();
  frecInput.value = '3';
  fechaCirInput.value = toISO(new Date());
  calcCorona();
  modalPaciente.show();
});

guardarBtn.addEventListener('click', async ()=>{
  const nombre = nombreInput.value.trim();
  const celLocal = ONLY_DIGITS(celularInput.value);
  const fechaCir = fechaCirInput.value;
  const diente   = parseInt(dienteInput.value||'',10);
  const tipo     = tipoInput.value;
  const implante = implanteInput.value.trim();
  const torque   = torqueInput.value ? parseInt(torqueInput.value,10) : null;
  const frec     = parseInt(frecInput.value||'3',10);
  const fechaCor = fechaCoronaISO.value || '';

  if (!nombre || !celLocal || !fechaCir || !diente || !tipo) {
    alert('Completá todos los campos obligatorios.'); return;
  }
  const celular = '595' + celLocal;

  try {
    // crea paciente
    const pRef = push(ref(db, `${BASE}/pacientes`));
    const pacienteId = pRef.key;
    await set(pRef, { nombre, celular, createdAt: Date.now() });

    // agrega primer implante
    const iRef = push(ref(db, `${BASE}/pacientes/${pacienteId}/implantes`));
    await set(iRef, {
      dienteFDI: diente, tipoImplante: tipo, implante, torqueNcm: torque,
      fechaCirugia: fechaCir, frecCoronaMeses: frec, fechaCoronaISO: fechaCor,
      createdAt: Date.now()
    });

    modalPaciente.hide();
  } catch (e) {
    alert('No se pudo guardar: ' + (e?.message || e));
  }
});

// ===== Editar paciente (solo nombre/celular) =====
function openEdit(id){
  const p = pacientesMap.get(id); if (!p) return;
  // reutilizamos el mismo modal de alta para editar datos del paciente
  document.querySelector('#modalPaciente .modal-title').textContent = 'Editar Paciente';
  nombreInput.value  = p.nombre || '';
  celularInput.value = splitLocalFromStored(p.celular||'') || '';
  // limpiamos campos de implante (no se usan en edición de paciente)
  fechaCirInput.value=''; dienteInput.value=''; tipoInput.value='inmediato';
  implanteInput.value=''; torqueInput.value=''; frecInput.value='3';
  fechaCoronaTxt.value=''; fechaCoronaISO.value='';

  modalPaciente.show();

  // interceptar guardar para este flujo
  const handler = async ()=>{
    const nombre = nombreInput.value.trim();
    const celLocal = ONLY_DIGITS(celularInput.value);
    if (!nombre || !celLocal) { alert('Nombre y celular son obligatorios.'); return; }
    const celular = '595' + celLocal;
    try {
      await update(ref(db, `${BASE}/pacientes/${p._id}`), { nombre, celular });
      modalPaciente.hide();
      document.querySelector('#modalPaciente .modal-title').textContent = 'Nuevo Paciente (Implantes)';
      guardarBtn.removeEventListener('click', handler);
    } catch (e) {
      alert('No se pudo guardar: ' + (e?.message || e));
    }
  };
  // para no acumular listeners, agregamos uno temporal que se desengancha
  guardarBtn.addEventListener('click', handler, { once:true });
}

// ===== Ficha (ver/agregar/eliminar implantes) =====
modalFichaEl.addEventListener('hidden.bs.modal', ()=>{
  implantesList.innerHTML = '';
  fichaIdActual = null;
});

async function openFicha(id){
  const p = pacientesMap.get(id); if (!p) return;
  fichaIdActual = id;
  fichaNombreEl.textContent = p.nombre || '';
  fNombreEl.textContent = p.nombre || '';
  const tel = ONLY_DIGITS(p.celular || '');
  fCelularEl.textContent = tel || '—';
  const wa = toWaNumber(p.celular || '');
  if (wa) { fWhatsEl.href = `https://wa.me/${wa}`; fWhatsEl.classList.remove('d-none'); }
  else { fWhatsEl.classList.add('d-none'); }

  // Cargar implantes actuales
  const snap = await get(child(ref(db), `${BASE}/pacientes/${id}/implantes`));
  const impl = snap.exists() ? snap.val() : null;
  renderImplantesList(impl);
  fCountEl.textContent = impl ? Object.keys(impl).length : 0;

  modalFicha.show();
}

function renderImplantesList(impl){
  implantesList.innerHTML = '';
  if (!impl || !Object.keys(impl).length) {
    implantesList.innerHTML = `<div class="list-group-item text-muted">Sin implantes registrados.</div>`;
    return;
  }
  // ordenar por fecha cirugía desc
  const items = Object.entries(impl).map(([id, v])=>({ _id:id, ...v }))
    .sort((a,b)=> (b.fechaCirugia||'').localeCompare(a.fechaCirugia||''));

  for (const it of items) {
    const fechaTxt = it.fechaCirugia ? toDDMMAAAA(it.fechaCirugia) : '—';
    const coronaTxt= it.fechaCoronaISO ? toDDMMAAAA(it.fechaCoronaISO) : '—';
    const tipoTxt  = it.tipoImplante === 'inmediato' ? 'Inmediato' : 'Tardío';
    const torque   = (it.torqueNcm ?? '') !== '' ? `${it.torqueNcm} N·cm` : '—';
    const implante = it.implante || '—';

    const div = document.createElement('div');
    div.className = 'list-group-item d-flex justify-content-between align-items-center flex-wrap gap-2';
    div.innerHTML = `
      <div class="d-flex flex-column">
        <div><span class="badge bg-secondary me-2">Diente ${it.dienteFDI || '—'}</span> <span class="badge bg-info text-dark">${tipoTxt}</span></div>
        <div class="small text-muted">Implante: ${implante}</div>
      </div>
      <div class="text-end">
        <div><b>Cirugía:</b> ${fechaTxt}</div>
        <div><b>Corona (${it.frecCoronaMeses||'?'}m):</b> ${coronaTxt}</div>
        <div><b>Torque:</b> ${torque}</div>
      </div>
      <button class="btn btn-sm btn-outline-danger" title="Eliminar" data-del-impl="${it._id}">
        <i class="fa-solid fa-trash"></i>
      </button>
    `;
    implantesList.appendChild(div);
  }
}

btnAddImplante.addEventListener('click', async ()=>{
  if (!fichaIdActual) return;
  const diente = parseInt(iDiente.value||'',10);
  const tipo   = iTipo.value;
  const impl   = iImplante.value.trim();
  const torq   = iTorque.value ? parseInt(iTorque.value,10) : null;
  const fecha  = iFecha.value;
  const frec   = parseInt(iFrec.value||'3',10);
  if (!diente || !fecha) { alert('Diente y fecha de cirugía son obligatorios.'); return; }
  const fechaCor = addMonthsISO(fecha, frec);

  try {
    const newRef = push(ref(db, `${BASE}/pacientes/${fichaIdActual}/implantes`));
    await set(newRef, {
      dienteFDI: diente, tipoImplante: tipo, implante: impl, torqueNcm: torq,
      fechaCirugia: fecha, frecCoronaMeses: frec, fechaCoronaISO: fechaCor,
      createdAt: Date.now()
    });

    // refrescar lista
    const snap = await get(child(ref(db), `${BASE}/pacientes/${fichaIdActual}/implantes`));
    const impls = snap.exists() ? snap.val() : null;
    renderImplantesList(impls);
    fCountEl.textContent = impls ? Object.keys(impls).length : 0;

    // limpiar form
    iDiente.value=''; iImplante.value=''; iTorque.value='';
    iTipo.value='inmediato'; iFecha.value=''; iFrec.value='3';
  } catch (e) {
    alert('No se pudo guardar el implante: ' + (e?.message || e));
  }
});

implantesList.addEventListener('click', async (e)=>{
  const btn = e.target.closest('[data-del-impl]');
  if (!btn || !fichaIdActual) return;
  const key = btn.getAttribute('data-del-impl');
  if (!confirm('¿Eliminar este implante?')) return;
  try {
    await remove(ref(db, `${BASE}/pacientes/${fichaIdActual}/implantes/${key}`));
    // refrescar
    const snap = await get(child(ref(db), `${BASE}/pacientes/${fichaIdActual}/implantes`));
    const impls = snap.exists() ? snap.val() : null;
    renderImplantesList(impls);
    fCountEl.textContent = impls ? Object.keys(impls).length : 0;
  } catch (e) {
    alert('No se pudo eliminar: ' + (e?.message || e));
  }
});
