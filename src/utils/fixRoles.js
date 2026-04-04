// src/utils/fixRoles.js
import db from '../db';
import { logAction, ACTIONS } from './auditLog';

export default async function fixRoles() {
  try {
    const sellers = await db.sellers.toArray();
    
    // 1. Check if ANY user has 'role' defined
    const hasRoles = sellers.some(s => s.role);
    if (hasRoles) return; // Ya se hizo la migración, salir.

    console.log('🔄 Migrando Roles de Usuarios (v5)...');

    for (const seller of sellers) {
      if (seller.name.toLowerCase() === 'admin') {
        // Encontrar al Admin y darle poder
        await db.sellers.update(seller.id, { role: 'admin' });
        await logAction(ACTIONS.SELLER_UPDATE, seller.id, 'Rol actualizado a ADMIN (Migración)');
        console.log(`✅ ${seller.name} ahora es ADMIN`);
      } else {
        // Los demás son vendedores
        await db.sellers.update(seller.id, { role: 'seller' });
        console.log(`👤 ${seller.name} ahora es Vendedor`);
      }
    }

    // Si no existía usuario Admin, crearlo
    const adminExists = sellers.some(s => s.name.toLowerCase() === 'admin');
    if (!adminExists) {
      await db.sellers.add({
        name: 'Admin',
        pin: '1234', // PIN por defecto
        role: 'admin',
        active: true
      });
      console.log('✨ Usuario Admin creado por defecto (PIN: 1234)');
    }
    
    // Forzar recarga de página para aplicar cambios en Context
    // window.location.reload(); 
    // (Mejor dejar que el usuario recargue o que Context lo detecte)

  } catch (err) {
    console.error('Error migrando roles:', err);
  }
}
