CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      shop_name TEXT NOT NULL,
      currency_symbol TEXT NOT NULL DEFAULT 'Rs.',
      address TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      low_stock_threshold INTEGER NOT NULL DEFAULT 10,
      print_terms TEXT NOT NULL DEFAULT 'Goods once sold are not returnable unless defective.',
      operator_name TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('cashier', 'manager')),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS operators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      batch_no INTEGER NOT NULL CHECK (batch_no >= 1),
      batch_key TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT 'General',
      pack_size INTEGER NOT NULL DEFAULT 1 CHECK (pack_size >= 1),
      stock_pcs INTEGER NOT NULL DEFAULT 0,
      buy_cents INTEGER NOT NULL DEFAULT 0,
      freight_cents INTEGER NOT NULL DEFAULT 0,
      landed_cents INTEGER NOT NULL DEFAULT 0,
      wholesale_cents INTEGER,
      retail_cents INTEGER NOT NULL DEFAULT 0,
      packing_label TEXT,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT 'N/A',
      type TEXT NOT NULL DEFAULT 'Regular' CHECK (type IN ('Regular','Office','School','Wholesale')),
      balance_cents INTEGER NOT NULL DEFAULT 0,
      opening_dues_cents INTEGER NOT NULL DEFAULT 0,
      balance_manual INTEGER NOT NULL DEFAULT 0 CHECK (balance_manual IN (0, 1)),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      iso_date TEXT NOT NULL,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_type TEXT NOT NULL,
      operator_name TEXT NOT NULL,
      retail_subtotal_cents INTEGER NOT NULL DEFAULT 0,
      item_discount_cents INTEGER NOT NULL DEFAULT 0,
      subtotal_cents INTEGER NOT NULL DEFAULT 0,
      bill_discount_cents INTEGER NOT NULL DEFAULT 0,
      grand_total_cents INTEGER NOT NULL DEFAULT 0,
      paid_cents INTEGER NOT NULL DEFAULT 0,
      unpaid_cents INTEGER NOT NULL DEFAULT 0,
      profit_cents INTEGER NOT NULL DEFAULT 0,
      surplus_applied_cents INTEGER NOT NULL DEFAULT 0,
      prev_balance_cents INTEGER NOT NULL DEFAULT 0,
      closing_balance_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('Paid','Partial','Unpaid')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS invoice_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sale_unit TEXT NOT NULL CHECK (sale_unit IN ('pcs','pkt')),
      pack_size INTEGER NOT NULL DEFAULT 1,
      qty_pcs INTEGER NOT NULL,
      packets REAL NOT NULL DEFAULT 0,
      retail_cents INTEGER NOT NULL,
      disc_cents INTEGER NOT NULL,
      disc_pct REAL NOT NULL DEFAULT 0,
      retail_total_cents INTEGER NOT NULL,
      saved_cents INTEGER NOT NULL DEFAULT 0,
      line_total_cents INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS invoice_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_line_id INTEGER NOT NULL REFERENCES invoice_lines(id) ON DELETE CASCADE,
      batch_id INTEGER NOT NULL REFERENCES batches(id),
      batch_no INTEGER NOT NULL,
      qty INTEGER NOT NULL,
      landed_cents INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sale_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      draft_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      bill_discount_cents INTEGER NOT NULL DEFAULT 0,
      paid_cents INTEGER NOT NULL DEFAULT 0,
      cart_json TEXT NOT NULL,
      operator_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS cart_reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      batch_id INTEGER NOT NULL REFERENCES batches(id),
      qty INTEGER NOT NULL CHECK (qty > 0),
      client_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, client_key, batch_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      customer_name TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('Cash','Bank·Easypaisa')),
      prev_balance_cents INTEGER NOT NULL,
      new_balance_cents INTEGER NOT NULL,
      operator_name TEXT NOT NULL,
      iso_date TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS surplus_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      customer_name TEXT NOT NULL,
      prev_surplus_cents INTEGER NOT NULL,
      new_surplus_cents INTEGER NOT NULL,
      note TEXT,
      operator_name TEXT NOT NULL,
      iso_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_number TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK (kind IN ('bulk','credit')),
      supplier_id INTEGER REFERENCES suppliers(id),
      supplier_name TEXT NOT NULL,
      ref_no TEXT,
      freight_total_cents INTEGER NOT NULL DEFAULT 0,
      freight_bill_t TEXT,
      goods_subtotal_cents INTEGER NOT NULL DEFAULT 0,
      operator_name TEXT NOT NULL,
      iso_date TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS purchase_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      batch_id INTEGER REFERENCES batches(id),
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      qty_pcs INTEGER NOT NULL,
      pack_size INTEGER NOT NULL DEFAULT 1,
      buy_cents INTEGER NOT NULL,
      freight_u_cents INTEGER NOT NULL DEFAULT 0,
      landed_cents INTEGER NOT NULL,
      retail_cents INTEGER NOT NULL,
      batch_no INTEGER
    ) STRICT;

    CREATE TABLE IF NOT EXISTS payables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK (kind IN ('supplier','freight','borrow')),
      party_name TEXT NOT NULL,
      bill_no TEXT,
      description TEXT,
      iso_date TEXT NOT NULL,
      total_cents INTEGER NOT NULL,
      paid_cents INTEGER NOT NULL DEFAULT 0,
      unpaid_cents INTEGER NOT NULL,
      purchase_id INTEGER REFERENCES purchases(id),
      operator_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS payable_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payable_id INTEGER NOT NULL REFERENCES payables(id) ON DELETE CASCADE,
      amount_cents INTEGER NOT NULL,
      iso_date TEXT NOT NULL,
      cash_entry_id INTEGER,
      note TEXT,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS cash_book_openings (
      period_key TEXT PRIMARY KEY,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS cash_book_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      iso_date TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('cash_in','cash_out','stock_purchase','freight','rent','meal','zakat','other')),
      amount_cents INTEGER NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      seller TEXT,
      bill_no TEXT,
      rent_month TEXT,
      auto INTEGER NOT NULL DEFAULT 0 CHECK (auto IN (0, 1)),
      payable_id INTEGER,
      purchase_id INTEGER,
      arrival_id INTEGER,
      operator_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS arrivals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_name TEXT NOT NULL,
      bill_t_no TEXT,
      advance_cents INTEGER NOT NULL DEFAULT 0,
      bill_t_amount_cents INTEGER NOT NULL DEFAULT 0,
      bill_t_paid_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('pending','reached','completed')),
      advance_date TEXT NOT NULL,
      reached_date TEXT,
      note TEXT,
      advance_cash_id INTEGER,
      operator_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS undo_stack (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_batches_name ON batches(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_batches_category ON batches(category);
    CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_invoices_iso_date ON invoices(iso_date);
    CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
    CREATE INDEX IF NOT EXISTS idx_receipts_iso_date ON receipts(iso_date);
    CREATE INDEX IF NOT EXISTS idx_cash_entries_iso_date ON cash_book_entries(iso_date);
    CREATE INDEX IF NOT EXISTS idx_payables_party ON payables(party_name COLLATE NOCASE);
