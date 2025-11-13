// server.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
// const bcrypt = require('bcrypt'); // ¡NECESITAS ESTO! npm install bcrypt

const app = express();
const prisma = new PrismaClient();
const PORT = 5000;
// const saltRounds = 10; // Para bcrypt

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- CONFIGURACIÓN DE ARCHIVOS WEB (HTML, CSS) ---
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// ---------------------------------------------------

// --- RUTA POST PARA REGISTRO DE USUARIOS (CORREGIDO) ---
app.post('/api/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // 1. Validación básica
        if (!email || !password) {
            return res.status(400).json({ message: 'Faltan campos obligatorios (email o contraseña)' });
        }
        
        // 2. Comprobar si el email ya existe (el campo 'email' es @unique)
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(409).json({ message: 'El email ya está registrado.' });
        }

        // 3. Hashear la contraseña (¡DESCOMENTAR Y USAR BCrypt POR SEGURIDAD!)
        // const hashedPassword = await bcrypt.hash(password, saltRounds); 
        
        // 4. Registro en base de datos: SOLO EMAIL Y PASSWORD
        const newUser = await prisma.user.create({
            data: {
                email: email,
                password: password, // <-- ¡CAMBIA ESTO POR "hashedPassword" EN PRODUCCIÓN!
            },
        });

        console.log('Usuario registrado en BD:', newUser.id);
        res.status(201).json({ message: 'Registro exitoso', userId: newUser.id });
        
    } catch (error) {
        // En caso de error, muestra el detalle en la consola del servidor
        console.error('Error durante el registro:', error);
        res.status(500).json({ message: 'Error interno del servidor al registrar.' });
    }
});
// ---------------------------------------------

// --- RUTA POST PARA LOGIN DE USUARIOS ---
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // 1. Validación básica
        if (!email || !password) {
            return res.status(400).json({ message: 'Faltan email o contraseña' });
        }

        // 2. Buscar usuario
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ message: 'Email o contraseña incorrectos.' });
        }

        // 3. Comparar contraseña hasheada (¡DESCOMENTAR Y USAR BCrypt POR SEGURIDAD!)
        // const match = await bcrypt.compare(password, user.password); 
        // if (!match) {
        //     return res.status(401).json({ message: 'Email o contraseña incorrectos.' });
        // }

        // Lógica temporal para comparar SIN hash (SOLO PRUEBAS)
        if (password !== user.password) {
             return res.status(401).json({ message: 'Email o contraseña incorrectos.' });
        }
        
        // 4. Éxito: Generar token JWT o iniciar sesión
        res.json({ message: 'Login exitoso', userId: user.id });

    } catch (error) {
        console.error('Error durante el login:', error);
        res.status(500).json({ message: 'Error interno del servidor al iniciar sesión.' });
    }
});
// -----------------------------------------

// --- RUTA POST existente para Alertas (No modificada) ---
app.post('/api/alert', async (req, res) => {
    // ... Tu lógica de alertas existente ...
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
// ----------------------------------------------------------

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en puerto ${PORT}`);
});