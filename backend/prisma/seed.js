import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const products = [
  { sku:"SUP-GAN", name:"Suplemento Ganadero", pelletized:false },
  { sku:"BOV-1372", name:"Bovinos 13-72", pelletized:false },
  { sku:"BOV-1065", name:"Bovinos 10-65", pelletized:false },
  { sku:"SUP-LEC", name:"Suplemento lechero", pelletized:false },
  { sku:"LEC-18", name:"Lechero 18%", pelletized:false },
  { sku:"LEC-18P", name:"Lechero 18% Peletizado", pelletized:true },
  { sku:"LEC-16", name:"Lechero 16%", pelletized:false },
  { sku:"TOR-LID", name:"Toros de lidia/ Terneras", pelletized:false },
  { sku:"GAN-CEB", name:"Ganado ceba", pelletized:false },
  { sku:"TER-P", name:"Terneras Peletizado", pelletized:true },
  { sku:"SUP-NOGA", name:"Suplenoga", pelletized:false },
  { sku:"SOL-LAC", name:"Solulac", pelletized:false },
  { sku:"PAL-SEM", name:"Palmiste Semilla", pelletized:false },
  { sku:"MEL", name:"Melaza", pelletized:false },
  { sku:"ALG-ENM", name:"Semilla de algodon enmelazada", pelletized:false },
  { sku:"PAL-CRM", name:"Palmiste semilla y melaza (cresagro)", pelletized:false },
  { sku:"SUP-FED", name:"Suplemento Federativo", pelletized:false },
  { sku:"SUP-FIB", name:"Suplefibra", pelletized:false },
  { sku:"SUP-FIBP", name:"Suplefibra Peletizado", pelletized:true },
  { sku:"EQU-10", name:"Suplequinos 10%", pelletized:false },
  { sku:"EQU-16", name:"Soluequinos 16%", pelletized:false },
  { sku:"AVI", name:"Soluavicola", pelletized:false },
  { sku:"NUT-CER", name:"Nutri-Cerdo", pelletized:false },
];

async function main(){
  for(const p of products){
    await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: { ...p, price_per_bag: 0 }
    });
  }
  await prisma.capacityConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      pellet_bph: 200,
      non_pellet_bph: 300,
      workday_start: "08:00",
      workday_end: "17:00",
      workdays: "Mon,Tue,Wed,Thu,Fri,Sat",
      timezone: "America/Bogota",
      dispatch_buffer_min: 60
    }
  });
  console.log("Seed complete.");
}

main().finally(() => prisma.$disconnect());
