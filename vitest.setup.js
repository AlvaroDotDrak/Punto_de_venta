// vitest.setup.js
import '@testing-library/jest-dom';
import 'fake-indexeddb/auto'; // Esto simula IndexedDB automáticamente

// Limpiar la BD después de cada test para evitar contaminación
import { afterEach } from 'vitest';
import Dexie from 'dexie';

afterEach(async () => {
  await Dexie.delete('TestPasteleriaDB');
});
