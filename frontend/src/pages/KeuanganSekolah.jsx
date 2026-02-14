import { useEffect, useMemo, useState } from 'react';
import api, { financeApi } from '../api';
import { toast } from '../utils/toast';

export default function KeuanganSekolah() {
  const [feeTypes, setFeeTypes] = useState([]);
  const [payments, setPayments] = useState([]);
  const [students, setStudents] = useState([]);
  const [feeForm, setFeeForm] = useState({ name: '', amount: '', payment_type: 'monthly', is_active: 1 });
  const [paymentForm, setPaymentForm] = useState({ student_id: '', fee_type_id: '', payment_date: '', amount: '', payment_method: 'cash' });
  const [qFee, setQFee] = useState('');
  const [qPayment, setQPayment] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = async () => {
    const [ft, sp, st] = await Promise.all([
      financeApi.get('/fee-types'),
      financeApi.get('/student-payments'),
      api.get('/master/students')
    ]);
    setFeeTypes(ft.data || []);
    setPayments(sp.data || []);
    setStudents(st.data || []);
  };

  useEffect(() => { load(); }, []);

  const saveFee = async (e) => {
    e.preventDefault();
    const amount = Number(feeForm.amount || 0);
    if (amount <= 0) {
      toast.error('Nominal biaya harus lebih dari 0.');
      return;
    }
    await financeApi.post('/fee-types', { ...feeForm, amount: Number(feeForm.amount || 0) });
    setFeeForm({ name: '', amount: '', payment_type: 'monthly', is_active: 1 });
    load();
  };

  const savePayment = async (e) => {
    e.preventDefault();
    if (!paymentForm.student_id || !paymentForm.fee_type_id || !paymentForm.payment_date) {
      toast.error('Siswa, jenis biaya, dan tanggal bayar wajib diisi.');
      return;
    }
    const amount = Number(paymentForm.amount || 0);
    if (amount <= 0) {
      toast.error('Nominal pembayaran harus lebih dari 0.');
      return;
    }
    await financeApi.post('/student-payments', {
      ...paymentForm,
      student_id: Number(paymentForm.student_id),
      fee_type_id: Number(paymentForm.fee_type_id),
      amount: Number(paymentForm.amount || 0)
    });
    setPaymentForm({ student_id: '', fee_type_id: '', payment_date: '', amount: '', payment_method: 'cash' });
    load();
  };

  const studentMap = useMemo(() => Object.fromEntries(students.map((s) => [String(s.id), s.full_name])), [students]);
  const feeTypeMap = useMemo(() => Object.fromEntries(feeTypes.map((f) => [String(f.id), f.name])), [feeTypes]);

  const filteredFeeTypes = useMemo(() => {
    const term = qFee.trim().toLowerCase();
    if (!term) return feeTypes;
    return feeTypes.filter((f) =>
      String(f.name || '').toLowerCase().includes(term) ||
      String(f.payment_type || '').toLowerCase().includes(term)
    );
  }, [feeTypes, qFee]);

  const filteredPayments = useMemo(() => {
    const term = qPayment.trim().toLowerCase();
    if (!term) return payments;
    return payments.filter((p) => {
      const student = studentMap[String(p.student_id)] || '';
      const fee = feeTypeMap[String(p.fee_type_id)] || '';
      return (
        student.toLowerCase().includes(term) ||
        fee.toLowerCase().includes(term) ||
        String(p.payment_date || '').toLowerCase().includes(term)
      );
    });
  }, [payments, qPayment, studentMap, feeTypeMap]);

  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageData = filteredPayments.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="modern-table-card">
        <div className="modern-table-title">Keuangan Sekolah - Jenis Biaya</div>
        <form className="toolbar" onSubmit={saveFee}>
          <input placeholder="Nama Biaya" value={feeForm.name} onChange={(e) => setFeeForm((p) => ({ ...p, name: e.target.value }))} required />
          <input placeholder="Nominal" value={feeForm.amount} onChange={(e) => setFeeForm((p) => ({ ...p, amount: e.target.value }))} required />
          <select value={feeForm.payment_type} onChange={(e) => setFeeForm((p) => ({ ...p, payment_type: e.target.value }))}>
            <option value="monthly">Bulanan</option>
            <option value="onetime">Sekali</option>
          </select>
          <button type="submit">Tambah</button>
        </form>
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <div className="empty">Kelola jenis biaya siswa.</div>
          <input placeholder="Cari jenis biaya..." value={qFee} onChange={(e) => setQFee(e.target.value)} style={{ maxWidth: 260 }} />
        </div>
        <table className="table">
          <thead><tr><th>Nama</th><th>Nominal</th><th>Tipe</th><th>Aktif</th></tr></thead>
          <tbody>{filteredFeeTypes.map((f) => <tr key={f.id}><td>{f.name}</td><td>Rp{Number(f.amount || 0).toLocaleString('id-ID')}</td><td>{f.payment_type}</td><td>{f.is_active ? 'Ya' : 'Tidak'}</td></tr>)}</tbody>
        </table>
      </div>

      <div className="modern-table-card">
        <div className="modern-table-title">Keuangan Sekolah - Pembayaran Siswa</div>
        <form className="toolbar" onSubmit={savePayment}>
          <select value={paymentForm.student_id} onChange={(e) => setPaymentForm((p) => ({ ...p, student_id: e.target.value }))} required>
            <option value="">Pilih Siswa</option>
            {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
          <select value={paymentForm.fee_type_id} onChange={(e) => setPaymentForm((p) => ({ ...p, fee_type_id: e.target.value }))} required>
            <option value="">Pilih Jenis Biaya</option>
            {feeTypes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <input type="date" value={paymentForm.payment_date} onChange={(e) => setPaymentForm((p) => ({ ...p, payment_date: e.target.value }))} required />
          <input placeholder="Nominal Bayar" value={paymentForm.amount} onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))} required />
          <select value={paymentForm.payment_method} onChange={(e) => setPaymentForm((p) => ({ ...p, payment_method: e.target.value }))}>
            <option value="cash">Cash</option>
            <option value="transfer">Transfer</option>
            <option value="qris">QRIS</option>
          </select>
          <button type="submit">Tambah</button>
        </form>
        <div className="toolbar" style={{ justifyContent: 'space-between' }}>
          <div className="empty">List pembayaran siswa.</div>
          <input placeholder="Cari siswa/biaya/tanggal..." value={qPayment} onChange={(e) => { setQPayment(e.target.value); setPage(1); }} style={{ maxWidth: 280 }} />
        </div>
        <table className="table">
          <thead><tr><th>Tanggal</th><th>Siswa</th><th>Jenis Biaya</th><th>Metode</th><th>Nominal</th></tr></thead>
          <tbody>{pageData.map((p) => <tr key={p.id}><td>{p.payment_date?.slice?.(0, 10) || '-'}</td><td>{studentMap[String(p.student_id)] || p.student_id}</td><td>{feeTypeMap[String(p.fee_type_id)] || p.fee_type_id}</td><td>{p.payment_method || '-'}</td><td>Rp{Number(p.amount || 0).toLocaleString('id-ID')}</td></tr>)}</tbody>
        </table>
        {filteredPayments.length > 0 && (
          <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
            <button className="outline" onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage === 1}>Sebelumnya</button>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Halaman {safePage} / {totalPages}</div>
            <button className="outline" onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages}>Berikutnya</button>
          </div>
        )}
      </div>
    </div>
  );
}
