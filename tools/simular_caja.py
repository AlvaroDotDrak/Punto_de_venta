"""READ-ONLY: simula el total Tarjeta/Debito de la pantalla de Caja de dos formas:
   - RESTANDO la anulacion (correcto, como el codigo actual)
   - SIN restarla (bug del ejecutable viejo)
para ubicar el origen de los '$20.000 de mas'."""
import sqlite3
import sys

db_path = sys.argv[1] if len(sys.argv) > 1 else "pasteleria.db"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

cur.execute("SELECT id FROM cash_register WHERE status='open' ORDER BY id DESC LIMIT 1")
reg_id = cur.fetchone()['id']
cur.execute("SELECT type, payment_method, amount FROM cash_movements WHERE register_id=?", (reg_id,))
movs = cur.fetchall()

CARD = ('tarjeta', 'debito')
sales_card = sum(m['amount'] for m in movs if m['type'] == 'sale' and m['payment_method'] in CARD)
voids_card = sum(m['amount'] for m in movs if m['type'] == 'void' and m['payment_method'] in CARD)

print("Caja #%s\n" % reg_id)
print("Ventas tarjeta BRUTO (solo 'sale'):        $%.0f" % sales_card)
print("Anulaciones tarjeta ('void'):              $%.0f" % voids_card)
print("-" * 50)
print("NETO correcto (resta la anulacion):        $%.0f  <- codigo NUEVO" % (sales_card + voids_card))
print("SIN restar la anulacion:                   $%.0f  <- ejecutable VIEJO" % sales_card)
print("-" * 50)
print("Diferencia (los '$20.000 de mas'):         $%.0f" % (-voids_card))

conn.close()
