import { Server } from 'socket.io';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { authenticate } from './auth.js';
import { Patient, Doctor, Bill } from './models.js';

// Change streams only observe committed writes. Events contain no record data;
// each browser reloads its own authorised REST projection.
export async function startRealtime(server, config) {
  const io = new Server(server, {
    transports: ['websocket'],
    cors: { origin: config.origin, credentials: true },
    allowRequest: (req, done) => done(null, req.headers.origin === config.origin),
    maxHttpBufferSize: 1024,
  });
  const auth = authenticate(config);
  const parseCookies = cookieParser();
  let stream,
    retry,
    stopped = false,
    available = false;
  async function validate(socket) {
    await auth(socket.request, {}, () => {});
    return socket.request.user;
  }
  io.use(async (socket, next) => {
    try {
      parseCookies(socket.request, {}, () => {});
      const user = await validate(socket);
      if (
        [...io.sockets.sockets.values()].filter(
          (s) => String(s.request.user?._id) === String(user._id),
        ).length >= 10
      )
        throw new Error('Connection limit');
      socket.join(`user:${user._id}`);
      next();
    } catch {
      next(new Error('Please sign in to connect.'));
    }
  });
  io.on('connection', (socket) => {
    socket.emit('realtime:availability', { available });
    // Clients cannot subscribe to other users, roles or records.
    socket.onAny(() => socket.disconnect(true));
  });
  async function dispatch(users = new Set(), roles = []) {
    for (const socket of io.sockets.sockets.values()) {
      try {
        const user = await validate(socket);
        if (users.has(String(user._id)) || roles.includes(user.role)) socket.emit('data:changed');
      } catch {
        socket.disconnect(true);
      }
    }
  }
  async function changed(change) {
    const collection = change.ns.coll;
    const doc = change.fullDocument;
    if (['sessions', 'users'].includes(collection)) {
      await dispatch(new Set(doc ? [String(doc._id)] : []));
      return;
    }
    if (!doc) return; // Deleted data is reconciled by the bounded REST fallback.
    const users = new Set();
    if (doc.recipient) users.add(String(doc.recipient));
    if (doc.user) users.add(String(doc.user));
    let patient = doc.patient;
    if (collection === 'payments')
      patient = (await Bill.findById(doc.bill).select('patient'))?.patient;
    if (patient) {
      const profile = await Patient.findById(patient).select('user');
      if (profile) users.add(String(profile.user));
    }
    if (doc.doctor) {
      const profile = await Doctor.findById(doc.doctor).select('user');
      if (profile) users.add(String(profile.user));
    }
    const roles =
      collection === 'notifications'
        ? []
        : collection === 'deliveries'
          ? ['admin']
          : ['admin', 'receptionist'];
    await dispatch(users, roles);
  }
  const collections = [
    'appointments',
    'consultations',
    'bills',
    'payments',
    'notifications',
    'deliveries',
    'patients',
    'doctors',
    'doctorschedules',
    'departments',
    'feedbacks',
    'sessions',
    'users',
  ];
  async function watch() {
    if (stopped) return;
    try {
      stream = mongoose.connection.db.watch([{ $match: { 'ns.coll': { $in: collections } } }], {
        fullDocument: 'updateLookup',
        maxAwaitTimeMS: 100,
      });
      const current = stream;
      const first = await current.tryNext();
      if (stopped) {
        await stream.close();
        return;
      }
      available = true;
      io.emit('realtime:availability', { available });
      if (first) await changed(first);
      // A MongoDB change stream must use one consumption mode throughout.
      // Keep the initial readiness read and all later reads in iterator mode.
      (async () => {
        try {
          for await (const event of current) {
            if (stopped || current !== stream) return;
            await changed(event);
          }
        } catch {
          if (!stopped && current === stream) degrade();
        }
      })();
    } catch {
      degrade();
    }
  }
  function degrade() {
    if (stopped || retry) return;
    available = false;
    io.emit('realtime:availability', { available });
    stream?.close().catch(() => {});
    retry = setTimeout(() => {
      retry = null;
      watch();
    }, 5000);
    retry.unref();
  }
  await watch();
  const heartbeat = setInterval(() => {
    dispatch().catch(degrade);
  }, 5000);
  heartbeat.unref();
  return {
    io,
    stop: async () => {
      stopped = true;
      clearInterval(heartbeat);
      clearTimeout(retry);
      await stream?.close();
      await new Promise((resolve) => io.close(resolve));
    },
  };
}
