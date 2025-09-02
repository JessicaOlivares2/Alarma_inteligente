const express = require('express');
const { PrismaClient } = require('@prisma/client');
const socketIo = require('socket.io');
const http = require('http');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs'); // Importar para encriptar contraseñas
const jwt = require('jsonwebtoken'); // Importar para manejar tokens JWT

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.json());

// Clave secreta para firmar los tokens JWT
// En producción, debe ser una variable de entorno y muy segura.
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
  const token = req.headers.authorization?.split(' ')[1]; // Extraer el token del header
  if (!token) {
    return res.status(401).json({ message: 'No hay token, autorización denegada' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Guardar la información del usuario en la solicitud
    next();
  } catch (err) {
    res.status(401).json({ message: 'El token no es válido' });
  }
};

// --- Rutas de Autenticación ---

// Ruta para el registro de usuarios
app.post('/api/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Verificar si el usuario ya existe
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'El usuario ya existe' });
    }

    // Encriptar la contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Crear el nuevo usuario en la base de datos
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

    // Buscar el usuario por email
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ message: 'Credenciales inválidas' });
    }

    // Comparar la contraseña encriptada
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Credenciales inválidas' });
    }

    // Generar un token JWT
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: '1h', // El token expira en 1 hora
    });

    res.json({ message: 'Inicio de sesión exitoso', token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error en el servidor' });
  }
});

// --- Rutas protegidas (ahora requieren autenticación) ---

// Endpoint para recibir alertas del ESP32
// NOTA: Esta ruta no necesita autenticación ya que el ESP32 no tiene un token de usuario.
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
// Ahora protegida
app.post('/api/device-status', authMiddleware, async (req, res) => {
  try {
    const { deviceId, status } = req.body;
    
    // NOTA: En un proyecto real, deberías verificar que req.user.id es el dueño del dispositivo
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
// Ahora protegida
app.get('/api/alerts', authMiddleware, async (req, res) => {
  try {
    // Buscar alertas solo para los dispositivos del usuario autenticado
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