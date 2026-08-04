const pool = require('../db');

let paymentTablesReady = false;

function normalizePeriod(value) {
  const period = String(value || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    const error = new Error('Periode wajib berformat YYYY-MM.');
    error.status = 400;
    throw error;
  }
  return period;
}

function periodRange(value) {
  const period = normalizePeriod(value);
  const [year, month] = period.split('-').map(Number);
  return {
    period,
    startDate: `${period}-01`,
    endDate: `${period}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
  };
}

function actorName(actor) {
  return String(actor?.display_name || actor?.username || actor?.id || 'admin').trim().slice(0, 100);
}

function normalizedIdentity(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function expenseRecipientKey(name, rowId) {
  const normalized = normalizedIdentity(name);
  return normalized ? `expense:${normalized}`.slice(0, 190) : `expense-row:${rowId}`;
}

function resolveExtraRecipient(row) {
  const rawId = Number(row.teacher_id || 0);
  if (rawId <= -2000000000) {
    return { key: `teacher:${Math.abs(rawId) - 2000000000}`, type: 'teacher' };
  }
  if (rawId <= -1000000000) {
    return { key: `extra_teacher:${Math.abs(rawId) - 1000000000}`, type: 'extra_teacher' };
  }
  if (rawId < 0) return { key: `extra_teacher:${Math.abs(rawId)}`, type: 'extra_teacher' };
  if (rawId > 0) return { key: `teacher:${rawId}`, type: 'teacher' };
  return { key: `extra-name:${normalizedIdentity(row.teacher_name)}`.slice(0, 190), type: 'extra_teacher' };
}

async function ensurePaymentTables() {
  if (paymentTablesReady) return;
  await pool.query(
    `CREATE TABLE IF NOT EXISTS payroll_payment_batches (
      period CHAR(7) PRIMARY KEY,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      source_generated_at DATETIME NULL,
      prepared_at DATETIME NOT NULL,
      prepared_by VARCHAR(100) NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_payment_batch_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS payroll_payment_items (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      period CHAR(7) NOT NULL,
      recipient_key VARCHAR(190) NOT NULL,
      recipient_type VARCHAR(30) NOT NULL,
      recipient_name VARCHAR(255) NOT NULL,
      component_type VARCHAR(30) NOT NULL,
      component_label VARCHAR(255) NOT NULL,
      amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      payload_json LONGTEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_payment_item_period (period),
      INDEX idx_payment_item_recipient (period, recipient_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS payroll_recipient_accounts (
      recipient_key VARCHAR(190) PRIMARY KEY,
      recipient_name VARCHAR(255) NOT NULL,
      bank_name VARCHAR(100) NULL,
      account_number VARCHAR(100) NULL,
      account_name VARCHAR(255) NULL,
      notes VARCHAR(500) NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`
  );
  await pool.query(
    `CREATE TABLE IF NOT EXISTS payroll_payment_statuses (
      period CHAR(7) NOT NULL,
      recipient_key VARCHAR(190) NOT NULL,
      selected TINYINT(1) NOT NULL DEFAULT 1,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      transfer_date DATE NULL,
      transfer_reference VARCHAR(255) NULL,
      transfer_bank_name VARCHAR(100) NULL,
      transfer_account_number VARCHAR(100) NULL,
      transfer_account_name VARCHAR(255) NULL,
      notes VARCHAR(500) NULL,
      updated_by VARCHAR(100) NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (period, recipient_key),
      INDEX idx_payment_status_period (period, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`
  );
  for (const definition of [
    'ADD COLUMN transfer_bank_name VARCHAR(100) NULL',
    'ADD COLUMN transfer_account_number VARCHAR(100) NULL',
    'ADD COLUMN transfer_account_name VARCHAR(255) NULL'
  ]) {
    try {
      await pool.query(`ALTER TABLE payroll_payment_statuses ${definition}`);
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  paymentTablesReady = true;
}

async function getPayrollPeriodRow(period) {
  try {
    const [rows] = await pool.query(
      'SELECT status, generated_at, generated_by FROM payroll_periods WHERE period=? LIMIT 1',
      [period]
    );
    return rows[0] || null;
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') return null;
    throw error;
  }
}

function baseTeacherAmount(payload) {
  return [
    payload.bisyarohMengajar,
    payload.bisyarohTransport,
    payload.bisyarohTransportKegiatan,
    payload.honorTugas,
    payload.wiyathabakti
  ].reduce((sum, value) => sum + Number(value || 0), 0);
}

async function collectPaymentItems(periodValue) {
  const { period, startDate, endDate } = periodRange(periodValue);
  const [snapshotRows] = await pool.query(
    `SELECT guru_id, teacher_name, payload_json
     FROM payroll_snapshots WHERE period=? ORDER BY teacher_name`,
    [period]
  );
  const items = [];
  snapshotRows.forEach((row) => {
    const guruId = Number(row.guru_id);
    if (guruId <= -1000000000) return;
    const payload = JSON.parse(row.payload_json || '{}');
    items.push({
      recipientKey: `teacher:${row.guru_id}`,
      recipientType: 'teacher',
      recipientName: row.teacher_name || payload.nama || '-',
      componentType: 'kbm',
      componentLabel: 'Bisyaroh Guru KBM',
      amount: baseTeacherAmount(payload),
      payload: {
        mengajar: Number(payload.bisyarohMengajar || 0),
        transportKehadiran: Number(payload.bisyarohTransport || 0),
        transportKegiatan: Number(payload.bisyarohTransportKegiatan || 0),
        tugasTambahan: Number(payload.honorTugas || 0),
        wiyatabhakti: Number(payload.wiyathabakti || 0)
      }
    });
  });

  const [extraRows] = await pool.query(
    `SELECT id, teacher_id, teacher_name, nama_ekstra, teacher_type, jumlah_hadir, nominal
     FROM pengeluaran_ekstrakurikuler
     WHERE tanggal BETWEEN ? AND ?
     ORDER BY nama_ekstra, teacher_name, id`,
    [startDate, endDate]
  );
  extraRows.forEach((row) => {
    const recipient = resolveExtraRecipient(row);
    items.push({
      recipientKey: recipient.key,
      recipientType: recipient.type,
      recipientName: row.teacher_name || '-',
      componentType: 'extracurricular',
      componentLabel: `Ekstrakurikuler - ${row.nama_ekstra || 'Ekstra'}`,
      amount: (Number(row.jumlah_hadir) || 0) * (Number(row.nominal) || 0),
      payload: {
        rowId: row.id,
        namaEkstra: row.nama_ekstra || '',
        jenis: row.teacher_type || '',
        jumlahHadir: Number(row.jumlah_hadir || 0),
        tarif: Number(row.nominal || 0)
      }
    });
  });

  try {
    const [disciplineRows] = await pool.query(
      `SELECT id, teacher_id, teacher_name, jumlah_hadir, nominal
       FROM pengeluaran_kedisiplinan
       WHERE tanggal BETWEEN ? AND ? ORDER BY teacher_name, id`,
      [startDate, endDate]
    );
    disciplineRows.forEach((row) => {
      const recipient = resolveExtraRecipient(row);
      items.push({
        recipientKey: recipient.key,
        recipientType: recipient.type,
        recipientName: row.teacher_name || '-',
        componentType: 'discipline',
        componentLabel: 'Kedisiplinan',
        amount: (Number(row.jumlah_hadir) || 0) * (Number(row.nominal) || 0),
        payload: {
          rowId: row.id,
          jumlah: Number(row.jumlah_hadir || 0),
          tarif: Number(row.nominal || 0)
        }
      });
    });
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
  }

  const [expenseRows] = await pool.query(
    `SELECT id, kategori, penerima, jumlah, nominal, keterangan
     FROM pengeluaran_lain WHERE tanggal BETWEEN ? AND ? ORDER BY tanggal, id`,
    [startDate, endDate]
  );
  expenseRows.forEach((row) => {
    items.push({
      recipientKey: expenseRecipientKey(row.penerima, row.id),
      recipientType: 'expense',
      recipientName: String(row.penerima || '').trim() || 'Penerima belum diisi',
      componentType: 'other_expense',
      componentLabel: row.kategori || 'Pengeluaran Lain',
      amount: (Number(row.jumlah) || 0) * (Number(row.nominal) || 0),
      payload: {
        rowId: row.id,
        jumlah: Number(row.jumlah || 0),
        nominal: Number(row.nominal || 0),
        keterangan: row.keterangan || ''
      }
    });
  });
  return items;
}

async function preparePaymentBatch(periodValue, actor) {
  const { period } = periodRange(periodValue);
  await ensurePaymentTables();
  const payrollRow = await getPayrollPeriodRow(period);
  if (!payrollRow) {
    const error = new Error('Bisyaroh periode ini belum digenerate. Generate Bisyaroh terlebih dahulu.');
    error.status = 409;
    throw error;
  }
  const [paidRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM payroll_payment_statuses
     WHERE period=? AND status='transferred'`,
    [period]
  );
  if (Number(paidRows[0]?.total || 0) > 0) {
    const error = new Error('Data transfer tidak dapat dibuat ulang karena sudah ada penerima yang ditransfer.');
    error.status = 409;
    throw error;
  }
  const items = await collectPaymentItems(period);
  const preparedAt = new Date();
  const preparedBy = actorName(actor);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM payroll_payment_items WHERE period=?', [period]);
    await connection.query('DELETE FROM payroll_payment_statuses WHERE period=?', [period]);
    await connection.query(
      `INSERT INTO payroll_payment_batches
         (period, status, source_generated_at, prepared_at, prepared_by)
       VALUES (?, 'draft', ?, ?, ?)
       ON DUPLICATE KEY UPDATE status='draft', source_generated_at=VALUES(source_generated_at),
         prepared_at=VALUES(prepared_at), prepared_by=VALUES(prepared_by)`,
      [period, payrollRow.generated_at, preparedAt, preparedBy]
    );
    if (items.length) {
      await connection.query(
        `INSERT INTO payroll_payment_items
           (period, recipient_key, recipient_type, recipient_name, component_type,
            component_label, amount, payload_json)
         VALUES ?`,
        [items.map((item) => [
          period, item.recipientKey, item.recipientType, item.recipientName,
          item.componentType, item.componentLabel, item.amount, JSON.stringify(item.payload || {})
        ])]
      );
      const uniqueRecipients = new Map();
      items.forEach((item) => uniqueRecipients.set(item.recipientKey, item.recipientName));
      await connection.query(
        `INSERT INTO payroll_payment_statuses (period, recipient_key, selected, status, updated_by)
         VALUES ?`,
        [[...uniqueRecipients.keys()].map((key) => [period, key, 1, 'draft', preparedBy])]
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return getPaymentBatch(period);
}

function parsePayload(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function validationForRecipient(recipient, duplicateAccounts) {
  const errors = [];
  if (!recipient.recipientName || recipient.recipientName === 'Penerima belum diisi') errors.push('Nama penerima belum diisi');
  if (!recipient.bankName) errors.push('Bank belum diisi');
  if (!recipient.accountNumber) errors.push('Nomor rekening belum diisi');
  if (!recipient.accountName) errors.push('Nama pemilik rekening belum diisi');
  if (recipient.total <= 0) errors.push('Nominal transfer harus lebih dari 0');
  if (recipient.accountNumber && duplicateAccounts.has(recipient.accountNumber)) errors.push('Nomor rekening dipakai penerima lain');
  const extraLabels = recipient.components
    .filter((item) => item.type === 'extracurricular')
    .map((item) => normalizedIdentity(item.label));
  if (new Set(extraLabels).size !== extraLabels.length) errors.push('Komponen honor ekstra terdeteksi ganda');
  return errors;
}

async function getPaymentBatch(periodValue) {
  const { period } = periodRange(periodValue);
  await ensurePaymentTables();
  const payrollRow = await getPayrollPeriodRow(period);
  const [batchRows] = await pool.query(
    'SELECT period, status, source_generated_at, prepared_at, prepared_by, updated_at FROM payroll_payment_batches WHERE period=? LIMIT 1',
    [period]
  );
  if (!batchRows.length) {
    return {
      period,
      payrollStatus: payrollRow?.status || 'not_generated',
      payrollGeneratedAt: payrollRow?.generated_at || null,
      batch: null,
      recipients: [],
      summary: {
        recipients: 0, total: 0, selected: 0, selectedTotal: 0, ready: 0,
        transferred: 0, invalid: 0, kbm: 0, extracurricular: 0, otherExpense: 0, discipline: 0
      }
    };
  }
  const [rows] = await pool.query(
    `SELECT i.id, i.recipient_key, i.recipient_type, i.recipient_name,
            i.component_type, i.component_label, i.amount, i.payload_json,
            CASE WHEN s.status='transferred' THEN COALESCE(s.transfer_bank_name, a.bank_name) ELSE a.bank_name END AS bank_name,
            CASE WHEN s.status='transferred' THEN COALESCE(s.transfer_account_number, a.account_number) ELSE a.account_number END AS account_number,
            CASE WHEN s.status='transferred' THEN COALESCE(s.transfer_account_name, a.account_name) ELSE a.account_name END AS account_name,
            a.notes AS account_notes,
            s.selected, s.status, s.transfer_date, s.transfer_reference, s.notes AS payment_notes
     FROM payroll_payment_items i
     LEFT JOIN payroll_recipient_accounts a ON a.recipient_key=i.recipient_key
     LEFT JOIN payroll_payment_statuses s ON s.period=i.period AND s.recipient_key=i.recipient_key
     WHERE i.period=?
     ORDER BY i.recipient_name, i.component_type, i.id`,
    [period]
  );
  const recipientMap = new Map();
  rows.forEach((row) => {
    if (!recipientMap.has(row.recipient_key)) {
      recipientMap.set(row.recipient_key, {
        recipientKey: row.recipient_key,
        recipientType: row.recipient_type,
        recipientName: row.recipient_name,
        bankName: row.bank_name || '',
        accountNumber: row.account_number || '',
        accountName: row.account_name || '',
        accountNotes: row.account_notes || '',
        selected: Number(row.selected ?? 1) === 1,
        status: row.status || 'draft',
        transferDate: row.transfer_date || null,
        transferReference: row.transfer_reference || '',
        paymentNotes: row.payment_notes || '',
        total: 0,
        components: []
      });
    }
    const recipient = recipientMap.get(row.recipient_key);
    const amount = Number(row.amount || 0);
    recipient.total += amount;
    recipient.components.push({
      id: row.id,
      type: row.component_type,
      label: row.component_label,
      amount,
      detail: parsePayload(row.payload_json)
    });
  });
  const recipients = [...recipientMap.values()];
  const accountOwners = new Map();
  recipients.forEach((recipient) => {
    const account = String(recipient.accountNumber || '').replace(/\s+/g, '');
    if (!account) return;
    if (!accountOwners.has(account)) accountOwners.set(account, new Set());
    accountOwners.get(account).add(recipient.recipientKey);
  });
  const duplicateAccounts = new Set(
    [...accountOwners.entries()].filter(([, owners]) => owners.size > 1).map(([account]) => account)
  );
  recipients.forEach((recipient) => {
    const normalizedAccount = String(recipient.accountNumber || '').replace(/\s+/g, '');
    recipient.validationErrors = validationForRecipient(recipient, new Set(
      duplicateAccounts.has(normalizedAccount) ? [recipient.accountNumber] : []
    ));
    recipient.isValid = recipient.validationErrors.length === 0;
  });
  const summary = {
    recipients: recipients.length,
    total: recipients.reduce((sum, row) => sum + row.total, 0),
    selected: recipients.filter((row) => row.selected).length,
    selectedTotal: recipients.filter((row) => row.selected).reduce((sum, row) => sum + row.total, 0),
    ready: recipients.filter((row) => row.status === 'ready').length,
    transferred: recipients.filter((row) => row.status === 'transferred').length,
    invalid: recipients.filter((row) => !row.isValid).length,
    kbm: recipients.flatMap((row) => row.components).filter((item) => item.type === 'kbm').reduce((sum, item) => sum + item.amount, 0),
    extracurricular: recipients.flatMap((row) => row.components).filter((item) => item.type === 'extracurricular').reduce((sum, item) => sum + item.amount, 0),
    otherExpense: recipients.flatMap((row) => row.components).filter((item) => item.type === 'other_expense').reduce((sum, item) => sum + item.amount, 0),
    discipline: recipients.flatMap((row) => row.components).filter((item) => item.type === 'discipline').reduce((sum, item) => sum + item.amount, 0)
  };
  return {
    period,
    payrollStatus: payrollRow?.status || 'not_generated',
    payrollGeneratedAt: payrollRow?.generated_at || null,
    batch: {
      period: batchRows[0].period,
      status: batchRows[0].status,
      sourceGeneratedAt: batchRows[0].source_generated_at,
      preparedAt: batchRows[0].prepared_at,
      preparedBy: batchRows[0].prepared_by,
      sourceChanged: Boolean(
        payrollRow?.generated_at && batchRows[0].source_generated_at
        && new Date(payrollRow.generated_at).getTime() !== new Date(batchRows[0].source_generated_at).getTime()
      )
    },
    recipients,
    summary
  };
}

async function saveRecipientAccount(data, actor) {
  await ensurePaymentTables();
  const recipientKey = String(data.recipientKey || '').trim();
  const recipientName = String(data.recipientName || '').trim();
  if (!recipientKey || !recipientName) {
    const error = new Error('Identitas dan nama penerima wajib diisi.');
    error.status = 400;
    throw error;
  }
  await pool.query(
    `INSERT INTO payroll_recipient_accounts
       (recipient_key, recipient_name, bank_name, account_number, account_name, notes)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE recipient_name=VALUES(recipient_name), bank_name=VALUES(bank_name),
       account_number=VALUES(account_number), account_name=VALUES(account_name), notes=VALUES(notes)`,
    [
      recipientKey, recipientName, String(data.bankName || '').trim(),
      String(data.accountNumber || '').trim(), String(data.accountName || '').trim(),
      String(data.notes || '').trim()
    ]
  );
  return { success: true, message: `Rekening ${recipientName} berhasil disimpan.`, updatedBy: actorName(actor) };
}

async function updatePaymentRecipients(periodValue, itemsValue, actor) {
  const { period } = periodRange(periodValue);
  await ensurePaymentTables();
  if (!Array.isArray(itemsValue) || !itemsValue.length) {
    const error = new Error('Pilih minimal satu penerima.');
    error.status = 400;
    throw error;
  }
  const allowedStatuses = new Set(['draft', 'ready', 'transferred', 'failed', 'postponed']);
  const current = await getPaymentBatch(period);
  const currentMap = new Map(current.recipients.map((row) => [row.recipientKey, row]));
  const values = itemsValue.map((item) => {
    const recipient = currentMap.get(String(item.recipientKey));
    if (!recipient) {
      const error = new Error('Penerima tidak ditemukan pada data transfer periode ini.');
      error.status = 404;
      throw error;
    }
    const status = String(item.status || recipient.status || 'draft');
    if (!allowedStatuses.has(status)) {
      const error = new Error('Status pembayaran tidak valid.');
      error.status = 400;
      throw error;
    }
    if (recipient.status === 'transferred' && status !== 'transferred') {
      const error = new Error(`Status ${recipient.recipientName} sudah ditransfer dan tidak dapat dikembalikan melalui perubahan status biasa.`);
      error.status = 409;
      throw error;
    }
    if ((status === 'ready' || status === 'transferred') && !recipient.isValid) {
      const error = new Error(`${recipient.recipientName} belum siap: ${recipient.validationErrors.join(', ')}.`);
      error.status = 409;
      throw error;
    }
    const transferDate = item.transferDate || recipient.transferDate || null;
    if (status === 'transferred' && !transferDate) {
      const error = new Error(`Tanggal transfer ${recipient.recipientName} wajib diisi.`);
      error.status = 400;
      throw error;
    }
    return [
      period,
      recipient.recipientKey,
      item.selected === undefined ? recipient.selected : Boolean(item.selected),
      status,
      transferDate,
      String(item.transferReference ?? recipient.transferReference ?? '').trim(),
      status === 'transferred' ? recipient.bankName : null,
      status === 'transferred' ? recipient.accountNumber : null,
      status === 'transferred' ? recipient.accountName : null,
      String(item.notes ?? recipient.paymentNotes ?? '').trim(),
      actorName(actor)
    ];
  });
  await pool.query(
    `INSERT INTO payroll_payment_statuses
       (period, recipient_key, selected, status, transfer_date, transfer_reference,
        transfer_bank_name, transfer_account_number, transfer_account_name, notes, updated_by)
     VALUES ?
     ON DUPLICATE KEY UPDATE selected=VALUES(selected), status=VALUES(status),
       transfer_date=VALUES(transfer_date), transfer_reference=VALUES(transfer_reference),
       transfer_bank_name=VALUES(transfer_bank_name), transfer_account_number=VALUES(transfer_account_number),
       transfer_account_name=VALUES(transfer_account_name),
       notes=VALUES(notes), updated_by=VALUES(updated_by)`,
    [values]
  );
  const refreshed = await getPaymentBatch(period);
  const statuses = new Set(refreshed.recipients.map((row) => row.status));
  const batchStatus = statuses.size === 1 && statuses.has('transferred')
    ? 'transferred'
    : (statuses.has('transferred') ? 'partially_transferred' : (statuses.has('ready') ? 'ready' : 'draft'));
  await pool.query('UPDATE payroll_payment_batches SET status=? WHERE period=?', [batchStatus, period]);
  return getPaymentBatch(period);
}

async function assertPaymentCanReset(periodValue) {
  const period = normalizePeriod(periodValue);
  await ensurePaymentTables();
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total FROM payroll_payment_statuses
     WHERE period=? AND status='transferred'`,
    [period]
  );
  if (Number(rows[0]?.total || 0) > 0) {
    const error = new Error('Bisyaroh tidak dapat diubah karena pembayaran periode ini sudah ditransfer.');
    error.status = 409;
    throw error;
  }
}

async function clearUnpaidBatch(periodValue) {
  const period = normalizePeriod(periodValue);
  await ensurePaymentTables();
  await assertPaymentCanReset(period);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM payroll_payment_items WHERE period=?', [period]);
    await connection.query('DELETE FROM payroll_payment_statuses WHERE period=?', [period]);
    await connection.query('DELETE FROM payroll_payment_batches WHERE period=?', [period]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  getPaymentBatch,
  preparePaymentBatch,
  saveRecipientAccount,
  updatePaymentRecipients,
  assertPaymentCanReset,
  clearUnpaidBatch
};
