// server.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
// const bcrypt = require('bcrypt'); // Para producción
// const saltRounds = 10;

const app = express();
const prisma = new PrismaClient();
const PORT = 5000;

// Carpeta de videos
const VIDEO_DIR = path.join(__dirname, 'videos');
if (!fs.existsSync(VIDEO_DIR)) {
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
  console.log('📁 Carpeta de videos creada en:', VIDEO_DIR);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- ARCHIVOS ESTÁTICOS (HTML, CSS, JS) ---
app.use(express.static(path.join(__dirname, 'public')));
// Servir los archivos .mp4 de /videos
app.use('/videos', express.static(path.join(__dirname, 'videos')));

// Página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🧠 FUNCIÓN: grabar clip desde la cámara Dahua con FFmpeg
function grabarClip(nombreBase = 'alerta', duracionSegundos = 10) {
  return new Promise((resolve, reject) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${nombreBase}-${timestamp}.mp4`;
    const outputPath = path.join(VIDEO_DIR, fileName);

    // ⚠️ Ajustar usuario/contraseña si es distinto
    const rtspUrl = 'rtsp://admin:admin1234@10.56.2.19:554/cam/realmonitor?channel=1&subtype=0';

    const cmd = `ffmpeg -y -rtsp_transport tcp -i "${rtspUrl}" -t ${duracionSegundos} -vcodec copy -acodec copy "${outputPath}"`;

    console.log('🎥 Ejecutando FFmpeg:', cmd);

    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Error al grabar video:', error);
        return reject(error);
      }
      console.log('✅ Video grabado en:', outputPath);

      const webPath = `/videos/${fileName}`; // ruta accesible desde el navegador
      resolve(webPath);
    });
  });
}

// ======================================================
//  RUTAS DE AUTENTICACIÓN
// ======================================================

// Registro
app.post('/api/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: 'Faltan campos obligatorios (email o contraseña)' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res
        .status(409)
        .json({ message: 'El email ya está registrado.' });
    }

    // Producción:
    // const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = await prisma.user.create({
      data: {
        email,
        password, // ⚠️ en producción usar hashedPassword
      },
    });

    console.log('👤 Usuario registrado en BD:', newUser.id);
    res.status(201).json({ message: 'Registro exitoso', userId: newUser.id });
  } catch (error) {
    console.error('Error durante el registro:', error);
    res
      .status(500)
      .json({ message: 'Error interno del servidor al registrar.' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: 'Faltan email o contraseña' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res
        .status(401)
        .json({ message: 'Email o contraseña incorrectos.' });
    }

    // Producción:
    // const match = await bcrypt.compare(password, user.password);
    // if (!match) {
    //   return res.status(401).json({ message: 'Email o contraseña incorrectos.' });
    // }

    if (password !== user.password) {
      return res
        .status(401)
        .json({ message: 'Email o contraseña incorrectos.' });
    }

    // Acá podrías generar un JWT, por ahora devolvemos id
    res.json({ message: 'Login exitoso', userId: user.id, token: 'fake-token-demo' });
  } catch (error) {
    console.error('Error durante el login:', error);
    res
      .status(500)
      .json({ message: 'Error interno del servidor al iniciar sesión.' });
  }
});

// ======================================================
//  RUTA POST /api/alert  (ESP32 → Node-RED → backend)
// ======================================================
app.post('/api/alert', async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ message: 'Payload vacío' });
    }

    const { tipo, mensaje, dispositivo, sensor } = req.body;

    if (!tipo || !mensaje || !dispositivo || !sensor) {
      return res
        .status(400)
        .json({ message: 'Faltan campos obligatorios en el payload' });
    }

    console.log('🚨 Alerta recibida:', req.body);

    // Buscar dispositivo
    const device = await prisma.device.findFirst({
      where: { name: dispositivo },
      include: { sensors: true },
    });

    if (!device) {
      console.log(`Dispositivo no encontrado en BD: ${dispositivo}`);
      return res.status(400).json({
        message: `Dispositivo '${dispositivo}' no registrado en la BD.`,
      });
    }

    // Buscar sensor
    const sensorObj = device.sensors.find((s) => s.name === sensor);
    if (!sensorObj) {
      console.log(
        `Sensor no encontrado en BD: ${sensor} del dispositivo ${dispositivo}`
      );
      return res.status(400).json({
        message: `Sensor '${sensor}' no registrado para dispositivo '${dispositivo}'`,
      });
    }

    // 1) Guardar alerta en BD (sin video de momento)
    const alerta = await prisma.alert.create({
      data: {
        type: tipo,
        message: mensaje,
        deviceId: device.id,
        sensorId: sensorObj.id,
        // videoPath: null // asegurarse de que exista en el schema como String?
      },
    });

    console.log('💾 Alerta guardada en BD:', alerta.id);

    // 2) Disparar grabación en background (no bloquea respuesta)
    grabarClip(`alerta-${alerta.id}`, 10)
      .then(async (webPath) => {
        console.log(
          '🔗 Asignando videoPath a alerta:',
          alerta.id,
          '→',
          webPath
        );
        try {
          await prisma.alert.update({
            where: { id: alerta.id },
            data: { videoPath: webPath },
          });
        } catch (err) {
          console.error('Error actualizando videoPath en BD:', err);
        }
      })
      .catch((err) => {
        console.error('No se pudo grabar el video para alerta', alerta.id, err);
      });

    // 3) Responder rápido a Node-RED / ESP32
    res.json({
      message: 'Alerta recibida y guardada en BD',
      alertaId: alerta.id,
    });
  } catch (error) {
    console.error('Error procesando alerta:', error);
    res.status(500).json({
      message: 'Error al procesar alerta',
      error: error.message,
    });
  }
});

// ======================================================
//  API DE VIDEOS (para videos.html)
// ======================================================

// Listar alertas con video
app.get('/api/videos', async (req, res) => {
  try {
    const videos = await prisma.alert.findMany({
      where: {
        videoPath: {
          not: null,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        type: true,
        message: true,
        createdAt: true,
        videoPath: true,
      },
    });

    res.json(videos);
  } catch (error) {
    console.error('Error listando videos:', error);
    res
      .status(500)
      .json({ message: 'Error al obtener lista de videos' });
  }
});

// Eliminar video + registro de alerta
app.delete('/api/videos/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const alerta = await prisma.alert.findUnique({ where: { id } });

    if (!alerta || !alerta.videoPath) {
      return res
        .status(404)
        .json({ message: 'Alerta o video no encontrado' });
    }

    // Quitar el prefijo inicial "/" si lo tiene
    const relativePath = alerta.videoPath.replace(/^[\\/]/, ''); // /videos/xxx.mp4 → videos/xxx.mp4
    const fullPath = path.join(__dirname, relativePath);

    // Eliminar archivo de video
    fs.unlink(fullPath, (err) => {
      if (err) {
        console.error('⚠️ Error eliminando archivo de video:', err);
      } else {
        console.log('🗑️ Video borrado:', fullPath);
      }
    });

    // Eliminar alerta de la BD (o podrías dejarla y solo limpiar videoPath)
    await prisma.alert.delete({ where: { id } });

    res.json({ message: 'Video y alerta eliminados correctamente' });
  } catch (error) {
    console.error('Error al eliminar video:', error);
    res
      .status(500)
      .json({ message: 'Error al eliminar video', error: error.message });
  }
});

// ======================================================
//  ARRANCAR SERVIDOR
// ======================================================
app.listen(PORT, () => {
  console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
});
