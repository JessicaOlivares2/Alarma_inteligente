const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Crear usuario admin por defecto
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@alarma.com' },
    update: {},
    create: {
      email: 'admin@alarma.com',
      password: 'admin123', // En producción, esto debe estar encriptado
    },
  });

  // Crear dispositivo por defecto
  const defaultDevice = await prisma.device.upsert({
    where: { id: 'ESP32_001' },
    update: {},
    create: {
      id: 'ESP32_001',
      name: 'Dispositivo Principal',
      location: 'Salón Principal',
      status: 'inactive',
      userId: adminUser.id,
    },
  });

  // Crear sensores por defecto
  const sensors = await Promise.all([
    prisma.sensor.upsert({
      where: { id: 'motion_01' },
      update: {},
      create: {
        id: 'motion_01',
        type: 'motion',
        name: 'Sensor de Movimiento',
        location: 'Entrada Principal',
        status: 'normal',
        deviceId: defaultDevice.id,
      },
    }),
    prisma.sensor.upsert({
      where: { id: 'magnetic_01' },
      update: {},
      create: {
        id: 'magnetic_01',
        type: 'magnetic',
        name: 'Sensor Magnético',
        location: 'Puerta Principal',
        status: 'normal',
        deviceId: defaultDevice.id,
      },
    }),
  ]);

  console.log('Datos de inicialización creados:');
  console.log('- Usuario:', adminUser.email);
  console.log('- Dispositivo:', defaultDevice.name);
  console.log('- Sensores:', sensors.map(s => s.name).join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });