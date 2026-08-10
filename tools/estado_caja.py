"""READ-ONLY: estado de la caja abierta, totales por metodo y stock de productos clave."""
import sqlite3
import sys

db_path = sys.argv[1] if len(sys.argv) > 1 else "pasteleria.db"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

cur.execute("SELECT id FROM cash_register WHERE status='open' ORDER BY id DESC LIMIT 1")
row = cur.fetchone()
if not row:
    print("No hay caja abierta.")
    sys.exit(0)
reg_id = row['id']
print("Caja abierta: #%s\n" % reg_id)

# Totales por metodo (sale + void), tal como los muestra la pantalla de Caja
cur.execute("SELECT type, payment_method, amount FROM cash_movements WHERE register_id=?", (reg_id,))
movs = cur.fetchall()

def total(metodos):
    return sum(m['amount'] for m in movs
               if m['type'] in ('sale', 'void') and m['payment_method'] in metodos)

print("-- TOTAL VENTAS POR METODO (neto, sale+void) --")
print("  Efectivo:      $%.0f" % total(('efectivo',)))
print("  Tarjeta/Debito:$%.0f" % total(('tarjeta', 'debito')))
print("  Transferencia: $%.0f" % total(('transferencia',)))
print()

print("-- DETALLE movimientos tarjeta/debito --")
for m in movs:
    if m['type'] in ('sale', 'void') and m['payment_method'] in ('tarjeta', 'debito'):
        cur.execute("SELECT sale_id FROM cash_movements WHERE register_id=? AND type=? AND amount=? LIMIT 1",
                    (reg_id, m['type'], m['amount']))
        print("  %s $%.0f (%s)" % (m['type'], m['amount'], m['payment_method']))
print()

# Stock de productos de la venta #3
print("-- STOCK ACTUAL de productos de la venta #3 --")
for pid in (3, 110):
    cur.execute("SELECT id, name, stock FROM products WHERE id=?", (pid,))
    p = cur.fetchone()
    if p:
        print("  prod #%s %s: stock=%s" % (p['id'], p['name'], p['stock']))

conn.close()
