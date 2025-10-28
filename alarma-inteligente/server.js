const express = require('express');
const { PrismaClient } = require('@prisma/client');
const socketIo = require('socket.io');
const http = require('http');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken'); 

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware para parsear JSON en las peticiones (fundamental para recibir datos de Node-RED)
app.use(express.json());

// Clave secreta para firmar los tokens JWT
const JWT_SECRET = process.env.JWT_SECRET || 'mi_clave_secreta_super_segura';

// Configuración de nodemailer para alertas por correo
const transporter = nodemailer.createTransport({
  service: 'Gmail', // o otro servicio
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Middleware para proteger rutas
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'No hay token, autorización denegada' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; 
    next();
  } catch (err) {
    res.status(401).json({ message: 'El token no es válido' });
  }
};

// --- Rutas de Autenticación (sin cambios) ---

// Ruta para el registro de usuarios
app.post('/api/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'El usuario ya existe' });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
      },
    });

    res.status(201).json({ message: 'Usuario creado exitosamente', user: newUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error en el servidor' });
  }
});

// Ruta para el inicio de sesión
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ message: 'Credenciales inválidas' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Credenciales inválidas' });
    }
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: '1h', 
    });

    res.json({ message: 'Inicio de sesión exitoso', token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error en el servidor' });
  }
});

// --- RUTA MODIFICADA: ALMACENAMIENTO DE ALERTA (Actividad L) ---

// Endpoint para recibir alertas del ESP32 desde Node-RED
app.post('/api/alert', async (req, res) => {
  try {
    // 1. Obtener los campos enviados por el ESP32 (vía Node-RED)
    // El ESP32 envía: tipo, mensaje, dispositivo (nombre), sensor (nombre)
    const { tipo, mensaje, dispositivo, sensor } = req.body;
    
    // VALIDACIÓN BÁSICA: Asegurarse de tener los datos críticos
    if (!tipo || !mensaje || !dispositivo || !sensor) {
        return res.status(400).json({ message: 'Faltan datos críticos para registrar la alerta (tipo, mensaje, dispositivo o sensor).' });
    }

    // 2. BUSCAR IDs: Transformar nombres de dispositivo/sensor a IDs de la BD (Prisma)
    // Esto asume que tienes un campo 'name' en tus modelos Device y Sensor
    const device = await prisma.device.findFirst({
        where: { name: dispositivo } 
    });
    
    const sensorDb = await prisma.sensor.findFirst({
        where: { name: sensor } 
    });

    // Manejar el caso si no se encuentran
    if (!device) {
         console.warn(`Dispositivo no encontrado en BD: ${dispositivo}`);
         // Puedes optar por no guardar la alerta o usar un ID predeterminado. Aquí retornamos error.
         return res.status(404).json({ message: `Dispositivo '${dispositivo}' no registrado en la BD.` });
    }
    if (!sensorDb) {
         console.warn(`Sensor no encontrado en BD: ${sensor}`);
         return res.status(404).json({ message: `Sensor '${sensor}' no registrado en la BD.` });
    }


    // 3. Registrar alerta en la base de datos usando los IDs encontrados
    const alert = await prisma.alert.create({
      data: {
        type: tipo,     // Se usa 'tipo' del ESP32
        message: mensaje, // Se usa 'mensaje' del ESP32
        deviceId: device.id, // ID encontrado
        sensorId: sensorDb.id // ID encontrado
      },
      include: {
        device: true,
        sensor: true
      }
    });

    // 4. Enviar notificación por Socket.io a la página web
    io.emit('new-alert', alert);
    
    // 5. Enviar correo electrónico (Tu lógica original, usando los IDs encontrados)
    const users = await prisma.user.findMany({
      where: {
        devices: {
          some: { id: device.id } // Usar el device.id encontrado
        }
      }
    });

    for (const user of users) {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: `Alerta de seguridad: ${tipo}`,
        html: `<p>${mensaje}</p><p>Dispositivo: ${dispositivo}</p><p>Sensor: ${sensor}</p><p>Fecha: ${new Date()}</p>`
      });
    }

    // Respuesta a Node-RED
    res.status(201).json({ success: true, message: 'Alerta procesada y registrada.', alertId: alert.id });
  } catch (error) {
    console.error('Error al procesar la alerta:', error);
    res.status(500).json({ error: 'Error interno del servidor al procesar la alerta' });
  }
});

// --- Rutas protegidas (sin cambios) ---

// Endpoint para el estado del dispositivo
app.post('/api/device-status', authMiddleware, async (req, res) => {
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
app.get('/api/alerts', authMiddleware, async (req, res) => {
  try {
    const userDevices = await prisma.device.findMany({
      where: { userId: req.user.id }
    });
    const deviceIds = userDevices.map(device => device.id);

    const alerts = await prisma.alert.findMany({
      where: {
        deviceId: { in: deviceIds }
      },
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

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Servidor ejecutándose en puerto ${PORT}`);
});