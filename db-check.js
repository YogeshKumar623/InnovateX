import 'dotenv/config';
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
if (!uri || uri.includes('<db_') || uri.includes('<cluster-')) {
  console.error('MongoDB URI is still a placeholder. Paste your Atlas URI into MONGODB_URI in this project’s .env file.');
  process.exit(1);
}

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log('MongoDB connection successful.');
  await mongoose.disconnect();
} catch (error) {
  const codes = new Set();
  const addCode = value => { if (typeof value === 'string' && /^[A-Z0-9_]+$/.test(value)) codes.add(value); };
  addCode(error?.code); addCode(error?.cause?.code);
  try { for (const server of error?.reason?.servers?.values?.() || []) { addCode(server?.error?.code); addCode(server?.error?.cause?.code); } } catch {}
  if ([...codes].some(code => code.startsWith('ERR_SSL_'))) {
    console.error('TLS handshake failed before database authentication. Check the Atlas cluster state and network path; Atlas access requires the client IP to be allowed and outbound TCP 27017 to be reachable.');
  } else {
    console.error('MongoDB connection failed. Check the Atlas URI, database user credentials, cluster status, and Network Access IP allowlist.');
  }
  for (const code of codes) console.error(`Error code: ${code}`);
  process.exitCode = 1;
  await mongoose.disconnect().catch(() => {});
}
