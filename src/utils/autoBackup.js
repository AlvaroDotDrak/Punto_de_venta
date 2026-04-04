/**
 * Auto Backup — Automatic daily backup system
 * Exports all data as JSON every 24 hours
 */
import db from '../db';
import { logAction, ACTIONS } from './auditLog';

const BACKUP_KEY = 'lastAutoBackupDate';
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if a backup is needed and trigger if so
 * @returns {Promise<boolean>} true if backup was triggered
 */
export async function checkAndRunBackup() {
  try {
    const lastBackup = localStorage.getItem(BACKUP_KEY);
    const now = Date.now();

    if (lastBackup && (now - parseInt(lastBackup)) < BACKUP_INTERVAL_MS) {
      return false; // Not yet time
    }

    // Check if there's any data worth backing up
    const salesCount = await db.sales.count();
    const productsCount = await db.products.count();
    if (salesCount === 0 && productsCount === 0) {
      return false; // No data to backup
    }

    await performBackup();
    return true;
  } catch (err) {
    console.warn('Auto backup check failed:', err.message);
    return false;
  }
}

/**
 * Perform the backup — export all data as JSON and trigger download
 */
async function performBackup() {
  const data = {
    products: await db.products.toArray(),
    sales: await db.sales.toArray(),
    saleItems: await db.saleItems.toArray(),
    orders: await db.orders.toArray(),
    orderItems: await db.orderItems.toArray(),
    showcaseItems: await db.showcaseItems.toArray(),
    cashRegister: await db.cashRegister.toArray(),
    cashMovements: await db.cashMovements.toArray(),
    sellers: await db.sellers.toArray(),
    exportedAt: new Date().toISOString(),
    autoBackup: true,
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pasteleria-auto-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Mark backup as done
  localStorage.setItem(BACKUP_KEY, Date.now().toString());
  
  await logAction(ACTIONS.BACKUP_AUTO, null, `Backup automático: ${data.sales.length} ventas, ${data.products.length} productos`);
}
