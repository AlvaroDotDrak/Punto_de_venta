/**
 * Audit Log — Records all security-relevant actions
 */
import db from '../db';

/**
 * Log an action to the audit trail
 * @param {string} action - Action type (login, login_failed, logout, sale, etc.)
 * @param {number|null} userId - Seller ID who performed the action
 * @param {string} details - Additional details
 */
export async function logAction(action, userId = null, details = '') {
  try {
    await db.auditLog.add({
      action,
      userId,
      details,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Audit log write failed:', err.message);
  }
}

/**
 * Get recent audit log entries
 * @param {number} limit - Max number of entries
 * @returns {Promise<Array>}
 */
export async function getRecentLogs(limit = 50) {
  try {
    return await db.auditLog.orderBy('id').reverse().limit(limit).toArray();
  } catch {
    return [];
  }
}

// Action constants
export const ACTIONS = {
  LOGIN: 'login',
  LOGIN_FAILED: 'login_failed',
  LOGIN_LOCKED: 'login_locked',
  LOGOUT: 'logout',
  SALE: 'sale',
  CASH_OPEN: 'cash_open',
  CASH_CLOSE: 'cash_close',
  DATA_EXPORT: 'data_export',
  DATA_IMPORT: 'data_import',
  DATA_CLEAR: 'data_clear',
  PRODUCT_CREATE: 'product_create',
  PRODUCT_UPDATE: 'product_update',
  ORDER_CREATE: 'order_create',
  ORDER_UPDATE: 'order_update',
  BACKUP_AUTO: 'backup_auto',
  VOID_SALE: 'void_sale',
  INGREDIENT_PURCHASE: 'ingredient_purchase',
  INGREDIENT_UPDATE: 'ingredient_update',
  SHOWCASE_CANCEL: 'showcase_cancel',
  SHOWCASE_EXTEND: 'showcase_extend',
  ORDER_SALE: 'order_sale',
};
