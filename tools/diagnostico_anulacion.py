"""
Diagnostico READ-ONLY de una venta anulada que no desconto caja/stock.
NO modifica nada: solo lee y muestra el estado.

Uso:
    python tools/diagnostico_anulacion.py "C:\\ruta\\a\\pasteleria.db"

Si no se pasa ruta, usa .\\pasteleria.db
"""
import sqlite3
import sys

db_path = sys.argv[1] if len(sys.argv) > 1 else "pasteleria.db"
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print("== Diagnostico sobre: " + db_path + " ==\n")

# 1) Todas las ventas anuladas (y las cercanas a 20.000 por si el estado quedo raro)
print("-- VENTAS ANULADAS --")
cur.execute("""
    SELECT id, total, subtotal, payment_method, status, voided_at, void_reason, created_at
    FROM sales
    WHERE status = 'voided' OR total BETWEEN 19000 AND 21000
    ORDER BY created_at DESC
""")
ventas = cur.fetchall()
if not ventas:
    print("  (ninguna venta anulada ni cercana a $20.000)")
for v in ventas:
    print("  Venta #%s | $%.0f | %s | status=%s | anulada=%s | creada=%s" % (
        v['id'], v['total'], v['payment_method'], v['status'], v['voided_at'], v['created_at']))
    print("      razon: %s" % v['void_reason'])

    # 2) Items de la venta (para saber que stock reponer)
    cur.execute("""
        SELECT product_id, product_name, quantity, showcase_type, weight
        FROM sale_items WHERE sale_id = ?
    """, (v['id'],))
    items = cur.fetchall()
    print("      items:")
    for it in items:
        prod = None
        if it['product_id']:
            cur.execute("SELECT stock, sold_by FROM products WHERE id = ?", (it['product_id'],))
            prod = cur.fetchone()
        stock_actual = prod['stock'] if prod else None
        sold_by = prod['sold_by'] if prod else None
        print("        - %s (prod_id=%s) x%s | showcase=%s | weight=%s | sold_by=%s | STOCK ACTUAL=%s" % (
            it['product_name'], it['product_id'], it['quantity'],
            it['showcase_type'], it['weight'], sold_by, stock_actual))

    # 3) Movimientos de caja de esta venta (existe el 'void'?)
    cur.execute("""
        SELECT id, register_id, type, amount, payment_method, created_at
        FROM cash_movements WHERE sale_id = ?
        ORDER BY id
    """, (v['id'],))
    movs = cur.fetchall()
    print("      movimientos de caja:")
    if not movs:
        print("        (NINGUNO)")
    tiene_void = False
    register_id = None
    for m in movs:
        if m['type'] == 'void':
            tiene_void = True
        if m['type'] == 'sale':
            register_id = m['register_id']
        print("        - mov #%s | caja=%s | %s | $%.0f | %s | %s" % (
            m['id'], m['register_id'], m['type'], m['amount'],
            m['payment_method'], m['created_at']))
    print("      >>> tiene movimiento de anulacion (void)?: %s" % (
        "SI" if tiene_void else "NO -- FALTA"))

    # 4) Estado de la caja donde ocurrio la venta
    if register_id:
        cur.execute("""
            SELECT id, status, opened_at, closed_at, opening_amount,
                   closing_amount, expected_amount, opened_by, closed_by
            FROM cash_register WHERE id = ?
        """, (register_id,))
        reg = cur.fetchone()
        if reg:
            print("      caja #%s: status=%s | abierta=%s por %s | cerrada=%s por %s" % (
                reg['id'], reg['status'], reg['opened_at'], reg['opened_by'],
                reg['closed_at'], reg['closed_by']))
            print("                    apertura=$%.0f | esperado=$%s | contado=$%s" % (
                reg['opening_amount'], reg['expected_amount'], reg['closing_amount']))
    print()

# 5) Caja(s) abierta(s) actualmente
print("-- CAJA ABIERTA ACTUAL --")
cur.execute("SELECT id, opened_at, opened_by FROM cash_register WHERE status = 'open'")
abiertas = cur.fetchall()
if not abiertas:
    print("  (no hay caja abierta)")
for r in abiertas:
    print("  caja #%s abierta %s por %s" % (r['id'], r['opened_at'], r['opened_by']))

conn.close()
print("\n== Fin del diagnostico (no se modifico nada) ==")
