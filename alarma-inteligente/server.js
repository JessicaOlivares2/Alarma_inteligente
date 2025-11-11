// server.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();
const PORT = 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/api/alert', async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ message: 'Payload vacío' });
    }

    const { tipo, mensaje, dispositivo, sensor } = req.body;

    if (!tipo || !mensaje || !dispositivo || !sensor) {
      return res.status(400).json({ message: 'Faltan campos obligatorios en el payload' });
    }

    console.log('Alerta recibida:', req.body);

    // Buscar dispositivo por nombre (findFirst en lugar de findUnique)
    const device = await prisma.device.findFirst({
      where: { name: dispositivo },
      include: { sensors: true },
    });

    if (!device) {
      console.log(`Dispositivo no encontrado en BD: ${dispositivo}`);
      return res.status(400).json({ message: `Dispositivo '${dispositivo}' no registrado en la BD.` });
    }

    // Buscar sensor en el dispositivo
    const sensorObj = device.sensors.find(s => s.name === sensor);
    if (!sensorObj) {
      console.log(`Sensor no encontrado en BD: ${sensor} del dispositivo ${dispositivo}`);
      return res.status(400).json({ message: `Sensor '${sensor}' no registrado para dispositivo '${dispositivo}'` });
    }

    // Guardar alerta
    const alerta = await prisma.alert.create({
      data: {
        type: tipo,
        message: mensaje,
        deviceId: device.id,
        sensorId: sensorObj.id,
      },
    });

    console.log('Alerta guardada en BD:', alerta.id);
    res.json({ message: 'Alerta recibida y guardada en BD', alertaId: alerta.id });

  } catch (error) {
    console.error('Error procesando alerta:', error);
    res.status(500).json({ message: 'Error al procesar alerta', error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en puerto ${PORT}`);
});
