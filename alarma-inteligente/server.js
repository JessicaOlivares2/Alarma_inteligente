const express = require('express');
const { PrismaClient } = require('@prisma/client');
const socketIo = require('socket.io');
const http = require('http');
const nodemailer = require('nodemailer');

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());

// Configuración de nodemailer para alertas por correo
const transporter = nodemailer.createTransport({
  service: 'Gmail', // o otro servicio
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Endpoint para recibir alertas del ESP32
app.post('/api/alert', async (req, res) => {
  try {
    const { deviceId, sensorId, type, message } = req.body;
    
    // Registrar alerta en la base de datos
    const alert = await prisma.alert.create({
      data: {
        type,
        message,
        deviceId,
        sensorId
      },
      include: {
        device: true,
        sensor: true
      }
    });

    // Enviar notificación por Socket.io a la página web
    io.emit('new-alert', alert);
    
    // Enviar correo electrónico
    const users = await prisma.user.findMany({
      where: {
        devices: {
          some: { id: deviceId }
        }
      }
    });

    for (const user of users) {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: `Alerta de seguridad: ${type}`,
        html: `<p>${message}</p><p>Fecha: ${new Date()}</p>`
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error procesando la alerta' });
  }
});

// Endpoint para el estado del dispositivo
app.post('/api/device-status', async (req, res) => {
  try {
    const { deviceId, status } = req.body;
    
    await prisma.device.update({
      where: { id: deviceId },
      data: { status }
    });
    
    io.emit('device-status-update', { deviceId, status });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error actualizando estado' });
  }
});

// Endpoint para obtener historial de alertas
app.get('/api/alerts', async (req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      include: {
        device: true,
        sensor: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    res.json(alerts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo alertas' });
  }
});

// Servir archivos estáticos
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor ejecutándose en puerto ${PORT}`);
});