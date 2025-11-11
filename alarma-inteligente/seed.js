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

  // Crear dispositivo ESP32 que coincide con tu ESP32
  const esp32Device = await prisma.device.upsert({
    where: { id: 'ESP32' }, // id coincide con lo que envía tu ESP32
    update: {},
    create: {
      id: 'ESP32',
      name: 'ESP32',
      location: 'Salón',
      status: 'inactive',
      userId: adminUser.id,
    },
  });

  // Crear sensor PIR_Principal
  const pirSensor = await prisma.sensor.upsert({
    where: { id: 'PIR_Principal' },
    update: {},
    create: {
      id: 'PIR_Principal',
      type: 'motion',
      name: 'PIR_Principal',
      location: 'Salón',
      status: 'normal',
      deviceId: esp32Device.id,
    },
  });

  console.log('Datos de inicialización creados:');
  console.log('- Usuario:', adminUser.email);
  console.log('- Dispositivo:', esp32Device.name);
  console.log('- Sensor:', pirSensor.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
