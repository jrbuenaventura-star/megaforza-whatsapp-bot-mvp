async function getConfig(){
  const res = await fetch(process.env.NEXT_PUBLIC_API_BASE + '/config/capacity', { cache: 'no-store' });
  return res.json();
}
async function saveConfig(formData){
  'use server'
  const payload = {
    pellet_bph: Number(formData.get('pellet_bph')),
    non_pellet_bph: Number(formData.get('non_pellet_bph')),
    workday_start: formData.get('workday_start'),
    workday_end: formData.get('workday_end'),
    workdays: formData.get('workdays'),
    timezone: formData.get('timezone'),
    dispatch_buffer_min: Number(formData.get('dispatch_buffer_min'))
  };
  await fetch(process.env.NEXT_PUBLIC_API_BASE + '/config/capacity', {
    method:'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  });
}
export default async function Page(){
  const cfg = await getConfig();
  return (
    <div>
      <h1>Capacidad y Horarios</h1>
      <form action={saveConfig}>
        <div><label>Pellet bph <input name="pellet_bph" type="number" defaultValue={cfg?.pellet_bph || 200} /></label></div>
        <div><label>No pellet bph <input name="non_pellet_bph" type="number" defaultValue={cfg?.non_pellet_bph || 300} /></label></div>
        <div><label>Inicio jornada <input name="workday_start" defaultValue={cfg?.workday_start || '08:00'} /></label></div>
        <div><label>Fin jornada <input name="workday_end" defaultValue={cfg?.workday_end || '17:00'} /></label></div>
        <div><label>Días hábiles <input name="workdays" defaultValue={cfg?.workdays || 'Mon,Tue,Wed,Thu,Fri,Sat'} /></label></div>
        <div><label>Zona horaria <input name="timezone" defaultValue={cfg?.timezone || 'America/Bogota'} /></label></div>
        <div><label>Buffer despacho (min) <input name="dispatch_buffer_min" type="number" defaultValue={cfg?.dispatch_buffer_min || 60} /></label></div>
        <button type="submit">Guardar</button>
      </form>
    </div>
  );
}
