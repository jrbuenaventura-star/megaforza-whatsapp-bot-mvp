import { DateTime } from "luxon";
import { prisma } from "./db.js";

function parseTimeToMinutes(t){
  const [H,M] = t.split(":").map(Number);
  return (H*60)+M;
}
function hoursNeeded(bags, bph){ return bags / Math.max(bph,1); }

function isWorkday(dt, workdays){
  const map = { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:7 };
  const set = new Set(workdays.split(",").map(w=>map[w.trim()]));
  return set.has(dt.weekday);
}

function clampToWorkStart(dt, cfg){
  const [sh, sm] = cfg.workday_start.split(":").map(Number);
  const [eh, em] = cfg.workday_end.split(":").map(Number);
  const start = dt.set({ hour: sh, minute: sm, second:0, millisecond:0 });
  const end = dt.set({ hour: eh, minute: em, second:0, millisecond:0 });
  if(dt < start) return start;
  if(dt >= end){
    let d = dt.plus({ days:1 }).set({ hour:0, minute:0, second:0, millisecond:0 });
    while(!isWorkday(d, cfg.workdays)) d = d.plus({ days:1 });
    return d.set({ hour: sh, minute: sm, second:0, millisecond:0 });
  }
  return dt;
}

function addWorkHours(startDt, hours, cfg){
  let remainingMin = Math.round(hours*60);
  let dt = startDt;
  while(remainingMin > 0){
    if(!isWorkday(dt, cfg.workdays)){
      dt = dt.plus({ days:1 }).set({ hour:0, minute:0, second:0, millisecond:0 });
      continue;
    }
    dt = clampToWorkStart(dt, cfg);
    const [eh, em] = cfg.workday_end.split(":").map(Number);
    const end = dt.set({ hour: eh, minute: em, second:0, millisecond:0 });
    const avail = end.diff(dt, 'minutes').minutes;
    if(avail <= 0){
      dt = dt.plus({ days:1 }).set({ hour:0, minute:0, second:0, millisecond:0 });
      continue;
    }
    if(remainingMin <= avail){
      dt = dt.plus({ minutes: remainingMin });
      remainingMin = 0;
      break;
    }else{
      remainingMin -= avail;
      dt = dt.plus({ days:1 }).set({ hour:0, minute:0, second:0, millisecond:0 });
    }
  }
  return dt;
}

export async function scheduleOrderForItems(items, now, cfg){
  const tz = cfg.timezone || "America/Bogota";
  const nowDT = DateTime.fromJSDate(now, { zone: tz });
  // compute backlog per line
  const openOrders = await prisma.order.findMany({
    where: { status: { in: ['paid','scheduled','in_production'] } },
    include: { items: { include: { product: true } } },
    orderBy: { created_at: 'asc' }
  });

  let backlogPelletBags = 0, backlogNonPelletBags = 0;
  for(const o of openOrders){
    for(const it of o.items){
      if(it.product.pelletized) backlogPelletBags += it.qty_bags;
      else backlogNonPelletBags += it.qty_bags;
    }
  }

  const bagsPellet = items.filter(i=>i.pelletized).reduce((s,i)=>s+i.qty_bags,0);
  const bagsNon    = items.filter(i=>!i.pelletized).reduce((s,i)=>s+i.qty_bags,0);

  const startPellet = addWorkHours(nowDT, backlogPelletBags / Math.max(cfg.pellet_bph,1), cfg);
  const startNon    = addWorkHours(nowDT, backlogNonPelletBags / Math.max(cfg.non_pellet_bph,1), cfg);

  const finPellet   = addWorkHours(startPellet, bagsPellet / Math.max(cfg.pellet_bph,1), cfg);
  const finNon      = addWorkHours(startNon, bagsNon / Math.max(cfg.non_pellet_bph,1), cfg);

  const readyAt = finPellet > finNon ? finPellet : finNon;
  const deliveryAt = readyAt.plus({ minutes: cfg.dispatch_buffer_min || 60 });

  return {
    scheduled_at: (startPellet < startNon ? startPellet : startNon).toJSDate(),
    ready_at: readyAt.toJSDate(),
    delivery_at: deliveryAt.toJSDate()
  };
}
