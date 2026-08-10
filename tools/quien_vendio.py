"""READ-ONLY: quien hizo cada venta ~20.000 y sus movimientos, ordenado por hora."""
import sqlite3
import sys

db_path = sys.argv[1] if len(sys.argv) > 1 else "pasteleria.db"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Mapa de vendedores
cur.execute("SELECT id, name FROM sellers")
sellers = {r['id']: r['name'] for r in cur.fetchall()}
print("Vendedores:", sellers, "\n")

print("-- VENTAS de $19.000 a $21.000 (orden por hora) --")
cur.execute("""
    SELECT id, total, payment_method, status, seller_id, voided_at, void_reason, created_at
    FROM sales
    WHERE total BETWEEN 19000 AND 21000
    ORDER BY created_at
""")
for v in cur.fetchall():
    quien = sellers.get(v['seller_id'], '??')
    print("\nVenta #%s | $%.0f | %s | status=%s | VENDEDOR=%s (id %s)" % (
        v['id'], v['total'], v['payment_method'], v['status'], quien, v['seller_id']))
    print("   creada:  %s" % v['created_at'])
    print("   anulada: %s  razon: %s" % (v['voided_at'], v['void_reason']))
    cur.execute("""SELECT id, register_id, type, amount, payment_method, seller_id, created_at
                   FROM cash_movements WHERE sale_id=? ORDER BY id""", (v['id'],))
    for m in cur.fetchall():
        mq = sellers.get(m['seller_id'], '??')
        print("     mov #%s | caja=%s | %s | $%.0f | %s | por %s | %s" % (
            m['id'], m['register_id'], m['type'], m['amount'],
            m['payment_method'], mq, m['created_at']))

conn.close()
