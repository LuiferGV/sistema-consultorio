/* implantes.js — Módulo Implantes (v1.7.5)
   - WhatsApp verde (brand) sin subrayado
   - Acciones con colores diferenciados: Ver=ámbar, Editar=azul oscuro, Eliminar=rojo
   - Recordatorio: Próximos (≤21 días) / Lejanos (>21 días)
*/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.1/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-auth.js";
import {
  getDatabase, ref, push, set, get, update, remove, onValue
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-database.js";

/* === FIREBASE === */
const firebaseConfig = {
  apiKey: "AIzaSyB4v68jVnlVrpM4n4A23fv23OKibY_Kqq8",
  authDomain: "sistema-consultorio-53424.firebaseapp.com",
  databaseURL: "https://sistema-consultorio-53424-default-rtdb.firebaseio.com",
  projectId: "sistema-consultorio-53424",
  storageBucket: "sistema-consultorio-53424.firebasestorage.app",
  messagingSenderId: "701715985597",
  appId: "1:701715985597:web:91c80fdd071edb71d433d4"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getDatabase(app);

/* === HELPERS === */
const $  = s=>document.querySelector(s);
const $$ = s=>document.querySelectorAll(s);
const fmtGs  = n => "Gs. " + (Number(n)||0).toLocaleString("es-PY");
const toISO  = d => { const t=new Date(d); return isNaN(t)?"":t.toISOString().slice(0,10); };
const todayISO = ()=> toISO(new Date());
const addDays = (date, days)=>{ const d=new Date(date); d.setDate(d.getDate()+days); return d; };
const addMonthsISO = (iso,m)=>{ const d=new Date(iso); if(isNaN(d))return""; d.setMonth(d.getMonth()+Number(m||0)); return toISO(d); };
const onlyNum = s => Number(String(s||"").replace(/\D/g,""))||0;
const toDDMMAAAA = iso => { const d=new Date(iso); return isNaN(d)?"":d.toLocaleDateString("es-PY",{day:"2-digit",month:"2-digit",year:"numeric"}); };

/* === ESTADO === */
let currentUser=null;
let pacientes   = {};
let pacienteSelId = null;
const filters = { search:"", alpha:"", impl:"", record:"" };

/* === CÓDIGOS EPIKUT === */
const CODES_EPIKUT_S = ["ILM 3585","ILM 3510","ILM 3511","ILM 3513","ILM 3515","ILM 3885","ILM 3810","ILM 3811","ILM 3813","ILM 3815","ILM 4085","ILM 4010","ILM 4011","ILM 4013","ILM 4015","ILM 4585","ILM 4510","ILM 4511","ILM 4513","ILM 4515","ILM 5085","ILM 5010","ILM 5011","ILM 5013","ILM 5015"];
const CODES_EPIKUT_S_PLUS = ["ILM 3585N","ILM 3510N","ILM 3511N","ILM 3513N","ILM 3515N","ILM 3885N","ILM 3810N","ILM 3811N","ILM 3813N","ILM 3815N","ILM 4085N","ILM 4010N","ILM 4011N","ILM 4013N","ILM 4015N","ILM 4585N","ILM 4510N","ILM 4511N","ILM 4513N","ILM 4515N","ILM 5085N","ILM 5010N","ILM 5011N","ILM 5013N","ILM 5015N"];
const fillCodes = (el, sistema)=>
  el.innerHTML = (sistema==="epikut_s_plus"?CODES_EPIKUT_S_PLUS:CODES_EPIKUT_S).map(c=>`<option>${c}</option>`).join("");

/* === AUTH === */
function showAuth(v){ $("#authOverlay").style.display = v?"flex":"none"; }
function showMain(v){ document.querySelector("main").style.display = v?"":"none"; }

async function doLogin(){
  const email=$("#loginEmail").value.trim(), pass=$("#loginPassword").value;
  $("#authError").classList.add("d-none");
  try{
    await setPersistence(auth,browserLocalPersistence);
    await signInWithEmailAndPassword(auth,email,pass);
  }catch(e){
    $("#authError").textContent="No se pudo iniciar sesión: "+e.message;
    $("#authError").classList.remove("d-none");
  }
}
const doLogout=()=>signOut(auth);
function doReset(){
  const email=$("#loginEmail").value.trim(); if(!email) return;
  sendPasswordResetEmail(auth,email)
    .then(()=>{ $("#authInfo").textContent="Te enviamos un correo para reestablecer."; $("#authInfo").classList.remove("d-none"); setTimeout(()=>$("#authInfo").classList.add("d-none"),4000); })
    .catch(e=>{ $("#authError").textContent=e.message; $("#authError").classList.remove("d-none"); });
}
onAuthStateChanged(auth,(user)=>{
  currentUser=user;
  if(user){
    $("#userEmail").textContent=user.email; $("#userEmail").classList.remove("d-none"); $("#btnLogout").classList.remove("d-none");
    showAuth(false); showMain(true);
    onValue(ref(db,"implantes/pacientes"),(snap)=>{ pacientes=snap.exists()?snap.val():{}; renderTabla(); renderKPIs(); });
  }else{
    showMain(false); showAuth(true);
    $("#userEmail").classList.add("d-none"); $("#btnLogout").classList.add("d-none");
  }
});
$("#btnLogin")?.addEventListener("click",doLogin);
$("#btnLogout")?.addEventListener("click",doLogout);
$("#linkReset")?.addEventListener("click",(e)=>{e.preventDefault();doReset();});

/* === FILTROS === */
$("#searchMain").addEventListener("input",(e)=>{ filters.search=e.target.value.toLowerCase().trim(); renderTabla(); });
$("#alphaBar").addEventListener("click",(e)=>{
  const b=e.target.closest("button[data-alpha]"); if(!b) return;
  const v=b.dataset.alpha||""; filters.alpha=(filters.alpha===v)?"":v;
  $$("#alphaBar button").forEach(x=>x.classList.remove("active")); if(filters.alpha) b.classList.add("active");
  renderTabla();
});
$("#filterImpl").addEventListener("click",(e)=>{
  const b=e.target.closest("button[data-impl]"); if(!b) return;
  const v=b.dataset.impl; filters.impl=(filters.impl===v)?"":v;
  $$("#filterImpl .btn-chip").forEach(x=>x.classList.remove("active")); if(filters.impl) b.classList.add("active");
  renderTabla();
});

/*  Recordatorio: delegado global — toggle */
document.addEventListener("click",(e)=>{
  const b=e.target.closest("[data-rec]");
  if(!b) return;
  const v=b.dataset.rec;
  filters.record = (filters.record===v) ? "" : v;
  const parent=b.parentElement;
  if(parent) parent.querySelectorAll("[data-rec]").forEach(x=>x.classList.remove("active"));
  if(filters.record) b.classList.add("active");
  renderTabla();
});

/* === COMPAT === */
function normalizeImpl(i={}){
  return {
    dienteFDI : i.dienteFDI ?? i.diente ?? null,
    tipo      : (i.tipo ?? i.tipoImplante ?? i.implanteTipo ?? "").toString().toLowerCase() || "inmediato",
    sistema   : i.sistema ?? i.sistemaImpl ?? "epikut_s",
    codigo    : i.codigo ?? i.codigoImpl ?? i.implanteCodigo ?? "",
    torque    : Number(i.torque ?? i.implanteTorque ?? 0) || 0,
    fechaCirugiaISO : i.fechaCirugiaISO ?? i.fechaCirugia ?? "",
    frecuenciaMeses : Number(i.frecuenciaMeses ?? i.coronaMeses ?? 3) || 3,
    fechaCoronaISO  : i.fechaCoronaISO ?? i.proxCoronaISO ?? (i.fechaCirugiaISO||i.fechaCirugia ? addMonthsISO(i.fechaCirugiaISO||i.fechaCirugia, i.frecuenciaMeses||i.coronaMeses||3) : "")
  };
}
async function getFinanzasYPagos(pacienteId){
  const base = `implantes/pacientes/${pacienteId}`;
  let total = 0, pagos = {};
  const f1=await get(ref(db,`${base}/finanzas`)); if(f1.exists() && f1.val().total!=null) total=Number(f1.val().total)||0;
  if(!total){ const f2=await get(ref(db,`${base}/cuenta`)); if(f2.exists() && f2.val().total!=null) total=Number(f2.val().total)||0; }
  const p1=await get(ref(db,`${base}/pagos`)); if(p1.exists()) pagos=p1.val();
  if(!Object.keys(pagos).length){ const p2=await get(ref(db,`${base}/finanzas/pagos`)); if(p2.exists()) pagos=p2.val(); }
  if(!Object.keys(pagos).length){ const p3=await get(ref(db,`${base}/cuenta/pagos`)); if(p3.exists()) pagos=p3.val(); }
  return { total, pagos };
}

/* === KPIs y TABLA === */
function renderKPIs(){
  const ids = Object.keys(pacientes||{});
  $("#kpiTotal").textContent = ids.length;

  const hoy=new Date(), en7=new Date(hoy.getTime()+7*86400000);
  let conCorona=0, prox7=0, vencidos=0;

  ids.forEach(id=>{
    const imp = Object.values(pacientes[id]?.implantes||{}).map(normalizeImpl);
    if(!imp.length) return;
    const fechas = imp.map(x=>new Date(x.fechaCoronaISO||0)).filter(d=>!isNaN(d));
    if(!fechas.length) return;
    if(fechas.some(d=>d>=hoy)) conCorona++;
    if(fechas.some(d=>d>=hoy && d<=en7)) prox7++;
    if(fechas.some(d=>d<hoy)) vencidos++;
  });

  $("#kpiConCorona").textContent = conCorona;
  $("#kpiProx7").textContent     = prox7;
  $("#kpiVencidos").textContent  = vencidos;
}

function earliestCoronaDate(p){
  const fechas = Object.values(p.implantes||{}).map(normalizeImpl).map(x=>new Date(x.fechaCoronaISO||0)).filter(d=>!isNaN(d));
  if(!fechas.length) return null;
  fechas.sort((a,b)=>a-b); return fechas[0];
}

/*  Regla Recordatorio (21 días) */
function inProximos(date){
  if(!date) return false;
  const hoy = new Date(); const limite = addDays(hoy,21);
  return date >= hoy && date <= limite;
}
function inLejanos(date){
  if(!date) return false;
  const limite = addDays(new Date(),21);
  return date > limite;
}

function matchFilters(p){
  const s=filters;

  if(s.search){
    const h=(p.nombre||"").toLowerCase()+" "+(p.celular||"");
    if(!h.includes(s.search)) return false;
  }
  if(s.alpha){
    const n=(p.nombre||"").toLowerCase(); if(!n.startsWith(s.alpha)) return false;
  }
  if(s.impl){
    const tipos = new Set(Object.values(p.implantes||{}).map(normalizeImpl).map(x=>x.tipo));
    if(!tipos.has(s.impl)) return false;
  }
  if(s.record){
    const d = earliestCoronaDate(p);
    if(!d) return false;
    if(s.record==="proximos" && !inProximos(d)) return false;
    if(s.record==="lejanos"  && !inLejanos(d))  return false;
  }
  return true;
}

function renderTabla(){
  const tb=$("#tablaPacientes tbody"); tb.innerHTML="";
  let rows = Object.entries(pacientes||{}).filter(([id,p])=>matchFilters(p));

  if(filters.record==="proximos"||filters.record==="lejanos"){
    rows.sort((a,b)=>{
      const da=earliestCoronaDate(a[1]), db=earliestCoronaDate(b[1]);
      if(!da&&!db) return 0; if(!da) return 1; if(!db) return -1;
      return (da-db); // ascendente por fecha
    });
  }else{
    rows.sort((a,b)=> (a[1].nombre||"").localeCompare(b[1].nombre||"","es"));
  }

  rows.forEach(([id,p])=>{
    const impl = Object.values(p.implantes||{}).map(normalizeImpl);
    const tipos = new Set(impl.map(x=>x.tipo));

    // Píldoras
    let tipoNode = `<span class="pill pill-none">—</span>`;
    if(tipos.size===1){
      tipoNode = tipos.has("tardio")
        ? `<span class="pill pill-tar">Tardío</span>`
        : `<span class="pill pill-inm">Inmediato</span>`;
    }else if(tipos.size>1){
      tipoNode = `<span class="pill pill-mix">Inmediato/Tardío</span>`;
    }

    const prox = earliestCoronaDate(p);
    const proxTxt = prox? prox.toLocaleDateString("es-PY",{day:"2-digit",month:"2-digit",year:"numeric"}) : "—";
    const cel = p.celular? `https://wa.me/595${p.celular}` : null;

    const tr=document.createElement("tr");
    tr.innerHTML=`
      <td>${p.nombre||""}</td>
      <td>${p.celular||""} ${cel?`<a class="btn-badge badge-wa ms-2" target="_blank" href="${cel}" title="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>`:""}</td>
      <td>${tipoNode}</td>
      <td>${impl.length}</td>
      <td>${proxTxt}</td>
      <td class="text-nowrap">
        <button class="btn-badge badge-amber me-1" data-ver="${id}" title="Ver ficha"><i class="fa-regular fa-eye"></i></button>
        <button class="btn-badge badge-dblue me-1" data-edit="${id}" title="Editar"><i class="fa-regular fa-pen-to-square"></i></button>
        <button class="btn-badge badge-red" data-del="${id}" title="Eliminar"><i class="fa-regular fa-trash-can"></i></button>
      </td>`;
    tb.appendChild(tr);
  });
}

$("#tablaPacientes").addEventListener("click",(e)=>{
  const ver=e.target.closest("[data-ver]");
  const ed =e.target.closest("[data-edit]");
  const del=e.target.closest("[data-del]");
  if(ver){ abrirFicha(ver.dataset.ver); return; }
  if(ed ){ abrirEditar(ed.dataset.edit); return; }
  if(del){ if(confirm("¿Eliminar paciente?")) remove(ref(db,`implantes/pacientes/${del.dataset.del}`)); }
});

/* === ALTA/EDICIÓN PACIENTE === */
$("#btnAgregar").addEventListener("click",()=>{ limpiarFormPaciente(); new bootstrap.Modal("#modalPaciente").show(); });
function limpiarFormPaciente(){
  $("#formPaciente").reset();
  fillCodes($("#codigoImpl"), $("#sistemaImpl").value);
  $("#fechaCoronaISO").value=""; $("#fechaCoronaDDMMAAAA").value="";
}
$("#sistemaImpl").addEventListener("change",()=> fillCodes($("#codigoImpl"),$("#sistemaImpl").value));
$("#fechaCirugia").addEventListener("change", calcCoronaAddPaciente);
$("#frecCorona").addEventListener("change", calcCoronaAddPaciente);
function calcCoronaAddPaciente(){
  const fc=$("#fechaCirugia").value, fm=$("#frecCorona").value;
  const iso=addMonthsISO(fc,fm); $("#fechaCoronaISO").value=iso; $("#fechaCoronaDDMMAAAA").value=toDDMMAAAA(iso);
}
function abrirEditar(id){
  const p=pacientes[id]; if(!p) return;
  $("#nombre").value=p.nombre||""; $("#celular").value=p.celular||"";
  $("#guardarPaciente").dataset.editId=id;
  new bootstrap.Modal("#modalPaciente").show();
}
$("#guardarPaciente").addEventListener("click", async ()=>{
  const nombre=$("#nombre").value.trim(), celular=$("#celular").value.trim();
  if(!nombre || !celular) return;
  const editId=$("#guardarPaciente").dataset.editId||null;
  const pid   = editId || push(ref(db,"implantes/pacientes")).key;
  await update(ref(db,`implantes/pacientes/${pid}`),{nombre,celular});

  const d = Number($("#dienteFDI").value);
  const fc= $("#fechaCirugia").value;
  if(d && fc){
    const impl={
      dienteFDI:d,
      tipo: ($("#tipoImplante").value||"inmediato").toLowerCase(),
      sistema: $("#sistemaImpl").value || "epikut_s",
      codigo : $("#codigoImpl").value || "",
      torque : Number($("#torque").value)||0,
      fechaCirugiaISO: toISO(fc),
      frecuenciaMeses : Number($("#frecCorona").value)||3,
      fechaCoronaISO  : $("#fechaCoronaISO").value || addMonthsISO(fc,$("#frecCorona").value||3),
      creadoEn: Date.now()
    };
    const key=push(ref(db,`implantes/pacientes/${pid}/implantes`)).key;
    await set(ref(db,`implantes/pacientes/${pid}/implantes/${key}`), impl);
  }
  delete $("#guardarPaciente").dataset.editId;
  bootstrap.Modal.getInstance($("#modalPaciente"))?.hide();
});

/* === FICHA (implantes + finanzas) === */
$("#iSistema").addEventListener("change",()=> fillCodes($("#iCodigo"),$("#iSistema").value));
let editImplId=null;

async function abrirFicha(id){
  pacienteSelId=id;
  const p=pacientes[id]; if(!p) return;
  $("#fichaNombre").textContent=p.nombre||""; $("#fNombre").textContent=p.nombre||"";
  $("#fCelular").textContent=p.celular||""; $("#fCount").textContent=Object.keys(p.implantes||{}).length;
  $("#fWhats").href = p.celular? `https://wa.me/595${p.celular}` : "#";
  fillCodes($("#iCodigo"), $("#iSistema").value);
  await renderImplantes(id); await renderFinanzas(id);
  new bootstrap.Modal("#modalFicha").show();
}

async function renderImplantes(id){
  const imp = Object.entries(pacientes[id]?.implantes||{}).map(([iid,i])=>[iid, normalizeImpl(i)]);
  imp.sort((a,b)=> new Date(a[1].fechaCirugiaISO||0) - new Date(b[1].fechaCirugiaISO||0));
  const cont=$("#implantesList"); cont.innerHTML="";
  if(!imp.length){ cont.innerHTML=`<div class="list-group-item text-muted">Sin implantes registrados.</div>`; $("#fCount").textContent=0; return; }
  $("#fCount").textContent=imp.length;

  imp.forEach(([iid,i])=>{
    const tipoBadge = i.tipo==="tardio" ? `<span class="badge bg-danger ms-2">Tardío</span>` : `<span class="badge bg-success ms-2">Inmediato</span>`;
    const li=document.createElement("div");
    li.className="list-group-item d-flex justify-content-between align-items-start";
    li.innerHTML=`
      <div class="me-2">
        <div><strong>Diente ${i.dienteFDI||""}</strong> — ${i.sistema==="epikut_s_plus"?"Epikut S Plus":"Epikut S"} (${i.codigo||""}) ${tipoBadge}</div>
        <div class="small text-muted">Cirugía: ${toDDMMAAAA(i.fechaCirugiaISO)||"—"} · Corona: ${toDDMMAAAA(i.fechaCoronaISO)||"—"} · Torque: ${i.torque||0} N·cm</div>
      </div>
      <div class="d-flex gap-2">
        <button class="btn-badge badge-dblue" title="Editar" data-edit-impl="${iid}"><i class="fa-regular fa-pen-to-square"></i></button>
        <button class="btn-badge badge-red"   title="Eliminar" data-del-impl="${iid}"><i class="fa-regular fa-trash-can"></i></button>
      </div>
    `;
    li.querySelector("[data-del-impl]").addEventListener("click", async ()=>{
      if(!confirm("¿Eliminar implante?")) return;
      await remove(ref(db,`implantes/pacientes/${id}/implantes/${iid}`));
      renderImplantes(id); renderTabla();
    });
    li.querySelector("[data-edit-impl]").addEventListener("click", ()=>{
      $("#iDiente").value = i.dienteFDI||"";
      $("#iTipo").value   = i.tipo||"inmediato";
      $("#iSistema").value= i.sistema||"epikut_s";
      fillCodes($("#iCodigo"), $("#iSistema").value);
      $("#iCodigo").value = i.codigo||"";
      $("#iTorque").value = i.torque||0;
      $("#iFecha").value  = i.fechaCirugiaISO||"";
      $("#iFrec").value   = i.frecuenciaMeses||3;
      editImplId = iid;
      $("#btnAddImplante").textContent = "Guardar cambios";
    });
    cont.appendChild(li);
  });
}
$("#btnAddImplante").addEventListener("click", async ()=>{
  const id=pacienteSelId; if(!id) return;
  const d=Number($("#iDiente").value), fc=toISO($("#iFecha").value);
  if(!d || !fc){ alert("Completá diente y fecha de cirugía."); return; }
  const frec=Number($("#iFrec").value)||3;
  const impl={
    dienteFDI:d, tipo:($("#iTipo").value||"inmediato").toLowerCase(),
    sistema:$("#iSistema").value||"epikut_s", codigo:$("#iCodigo").value||"",
    torque:Number($("#iTorque").value)||0, fechaCirugiaISO:fc,
    frecuenciaMeses:frec, fechaCoronaISO:addMonthsISO(fc,frec), actualizadoEn:Date.now()
  };
  if(editImplId){
    await update(ref(db,`implantes/pacientes/${id}/implantes/${editImplId}`), impl);
    editImplId=null; $("#btnAddImplante").textContent="Agregar";
  }else{
    const iid=push(ref(db,`implantes/pacientes/${id}/implantes`)).key;
    await set(ref(db,`implantes/pacientes/${id}/implantes/${iid}`),{...impl,creadoEn:Date.now()});
  }
  $("#formImplante").reset(); fillCodes($("#iCodigo"), $("#iSistema").value);
  await renderImplantes(id); renderTabla();
});

/* === FINANZAS === */
async function renderFinanzas(id){
  const { total, pagos } = await getFinanzasYPagos(id);
  const arr = Object.values(pagos||{});
  const pagado = arr.reduce((a,p)=>a+(Number(p.monto)||0),0);
  const saldo  = total - pagado;
  $("#finTotalLbl").textContent=fmtGs(total);
  $("#finPagadoLbl").textContent=fmtGs(pagado);
  $("#finSaldoLbl").textContent=fmtGs(saldo);
  $("#finSaldoLbl").classList.toggle("money-zero", saldo<=0);

  $("#btnEditTotal").onclick = ()=>{
    $("#finEditorRow").classList.remove("d-none");
    $("#finTotalInput").value = total? String(total):"";
  };
  $("#btnCancelarTotal").onclick = ()=> $("#finEditorRow").classList.add("d-none");
  $("#finGuardarTotal").onclick = async ()=>{
    const nuevo=onlyNum($("#finTotalInput").value);
    await update(ref(db,`implantes/pacientes/${id}/finanzas`),{total:nuevo});
    $("#finEditorRow").classList.add("d-none");
    renderFinanzas(id);
  };

  $("#finFechaPago").value=todayISO(); $("#finMontoPago").value="";
  $("#finMetodoPago").value="efectivo"; $("#finNroComp").value=""; $("#finObs").value="";
  $("#finAgregarPago").onclick=()=>agregarPago(id);

  const list=$("#finPagosList"); list.innerHTML="";
  if(!arr.length){ list.innerHTML=`<div class="list-group-item text-muted">Sin pagos registrados.</div>`; }
  else{
    Object.entries(pagos).sort((a,b)=> new Date(a[1].fechaISO||0)-new Date(b[1].fechaISO||0)).forEach(([pid,p])=>{
      list.appendChild(renderPagoItem(id,pid,p));
    });
  }
}
function renderPagoItem(pacienteId,pagoId,p){
  const li=document.createElement("div");
  li.className="list-group-item d-flex justify-content-between align-items-start";
  const metodo=(p.metodo||"").toLowerCase()==="transferencia"?"secondary":"success";
  const comp=(p.nroComp||"").trim(); const obs=(p.obs||"").trim();
  li.innerHTML=`
    <div class="me-2">
      <div><strong>${toDDMMAAAA(p.fechaISO||"")}</strong> — ${fmtGs(p.monto||0)}
        <span class="badge bg-${metodo} ms-2">${p.metodo||"Efectivo"}</span>
        ${comp?`<span class="badge bg-info ms-2">Comprobante #${comp}</span>`:""}
      </div>
      ${obs?`<div class="text-muted small mt-1">${obs}</div>`:""}
    </div>
    <button class="btn-badge badge-red" title="Eliminar" data-del-pago="${pagoId}">
      <i class="fa-regular fa-trash-can"></i>
    </button>`;
  li.querySelector("[data-del-pago]").addEventListener("click", async ()=>{
    if(!confirm("¿Eliminar pago?")) return;
    const base=`implantes/pacientes/${pacienteId}`;
    const paths=[`${base}/pagos/${pagoId}`,`${base}/finanzas/pagos/${pagoId}`,`${base}/cuenta/pagos/${pagoId}`];
    for(const path of paths){ await remove(ref(db,path)).catch(()=>{}); }
    renderFinanzas(pacienteId);
  });
  return li;
}
async function agregarPago(id){
  const fechaISO=$("#finFechaPago").value || todayISO();
  const monto=onlyNum($("#finMontoPago").value);
  const metodo=$("#finMetodoPago").value || "efectivo";
  const nroComp=($("#finNroComp").value||"").trim();
  const obs=($("#finObs").value||"").trim();
  if(!monto){ alert("Ingresá un monto válido."); return; }
  const pago={ fechaISO, monto, metodo, nroComp:nroComp||null, obs:obs||null, createdAt:Date.now() };
  const newId=push(ref(db,`implantes/pacientes/${id}/pagos`)).key;
  await set(ref(db,`implantes/pacientes/${id}/pagos/${newId}`), pago);
  $("#finMontoPago").value=""; $("#finNroComp").value=""; $("#finObs").value="";
  renderFinanzas(id);
}

/* === DASHBOARD === */
$("#btnDash").addEventListener("click", async ()=>{
  const ids=Object.keys(pacientes||{});
  let totalMontos=0, pagadoTotal=0;
  const Y=new Date().getFullYear(); const meses=new Array(12).fill(0);
  for(const id of ids){
    const {total, pagos}=await getFinanzasYPagos(id);
    totalMontos+=Number(total)||0;
    Object.values(pagos||{}).forEach(p=>{
      const m=Number(p.monto)||0; pagadoTotal+=m;
      const d=new Date(p.fechaISO||0); if(!isNaN(d)&&d.getFullYear()===Y){ meses[d.getMonth()]+=m; }
    });
  }
  $("#fdTotalGeneral").textContent=fmtGs(totalMontos);
  $("#fdPagadoTotal").textContent=fmtGs(pagadoTotal);
  $("#fdSaldoGeneral").textContent=fmtGs(totalMontos-pagadoTotal);
  $("#fdIngresosAnio").textContent=fmtGs(meses.reduce((a,b)=>a+b,0));
  if(window._chartIngresos) window._chartIngresos.destroy();
  const ctx=document.getElementById("chartIngresos");
  window._chartIngresos=new Chart(ctx,{type:"bar",data:{labels:["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"],datasets:[{label:"Ingresos (Gs.)",data:meses}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{ticks:{callback:v=>v.toLocaleString("es-PY")}}}}});
  new bootstrap.Modal("#modalFinDash").show();
});

/* INIT */
console.log("[implantes v1.7.5] colores acciones + WA OK");
