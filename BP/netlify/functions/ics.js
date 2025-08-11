// netlify/functions/ics.js
exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    // Parámetros esperados
    const titulo = (q.t || 'Mantenimiento periodontal – Profilaxis').toString();
    // fecha en formato YYYY-MM-DD
    const fecha = (q.d || '').toString(); 
    // hora y duración
    const hour = Math.max(0, Math.min(23, parseInt(q.h || '9', 10)));
    const mins = Math.max(0, Math.min(59, parseInt(q.m || '0', 10)));
    const dur  = Math.max(5, Math.min(600, parseInt(q.dur || '30', 10)));

    const paciente = (q.p || '').toString();
    const historia = (q.hi || '').toString();
    const prof     = (q.pr || '').toString();
    const notas    = (q.n  || '').toString();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return { statusCode: 400, body: 'Fecha inválida, use YYYY-MM-DD' };
    }

    // Armamos fecha/hora "flotante" (sin Z) para que iOS la tome en la zona local
    const toICSLocal = (y, m, d, hh, mm, ss=0) =>
      `${y}${m.toString().padStart(2,'0')}${d.toString().padStart(2,'0')}T${hh.toString().padStart(2,'0')}${mm.toString().padStart(2,'0')}${ss.toString().padStart(2,'0')}`;

    const [Y, M, D] = fecha.split('-').map(Number);
    const dtStart = toICSLocal(Y, M, D, hour, mins, 0);

    // Sumar duración en minutos (simple sin TZ, suficiente para flotante)
    const startDate = new Date(Y, M-1, D, hour, mins, 0);
    const endDate   = new Date(startDate.getTime() + dur*60000);
    const dtEnd = toICSLocal(
      endDate.getFullYear(), endDate.getMonth()+1, endDate.getDate(),
      endDate.getHours(), endDate.getMinutes(), endDate.getSeconds()
    );

    const safe = s => String(s || '').replace(/[\n\r,]/g, ' ');
    const uid  = `evt-${Date.now()}-${Math.random().toString(36).slice(2)}@perio-verse`;

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//PerioVerse//ICS//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${safe(titulo)}`,
      `DESCRIPTION:Paciente: ${safe(paciente)}\\nHistoria: ${safe(historia)}\\nProfesional: ${safe(prof)}\\nNotas: ${safe(notas)}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ];

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="cita.ics"',
        'Cache-Control': 'no-store'
      },
      body: lines.join('\n')
    };
  } catch (e) {
    return { statusCode: 500, body: 'ERROR ' + e.message };
  }
};
