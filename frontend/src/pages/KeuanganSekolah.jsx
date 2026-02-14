import { useEffect, useState } from 'react';
import { financeApi } from '../api';

export default function KeuanganSekolah() {
  const [feeTypes, setFeeTypes] = useState([]);
  const [payments, setPayments] = useState([]);
  const [feeForm, setFeeForm] = useState({ name: '', amount: '', payment_type: 'monthly', is_active: 1 });
  const [paymentForm, setPaymentForm] = useState({ student_id: '', fee_type_id: '', payment_date: '', amount: '' });

  const load = async () => {
    const [ft, sp] = await Promise.all([
      financeApi.get('/fee-types'),
      financeApi.get('/student-payments')
    ]);
    setFeeTypes(ft.data || []);
    setPayments(sp.data || []);
  };

  useEffect(() => { load(); }, []);

  const saveFee = async (e) => {
    e.preventDefault();
    await financeApi.post('/fee-types', { ...feeForm, amount: Number(feeForm.amount || 0) });
    setFeeForm({ name: '', amount: '', payment_type: 'monthly', is_active: 1 });
    load();
  };

  const savePayment = async (e) => {
    e.preventDefault();
    await financeApi.post('/student-payments', {
      ...paymentForm,
      student_id: Number(paymentForm.student_id),
      fee_type_id: Number(paymentForm.fee_type_id),
      amount: Number(paymentForm.amount || 0)
    });
    setPaymentForm({ student_id: '', fee_type_id: '', payment_date: '', amount: '' });
    load();
  };

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
        <table className="table">
          <thead><tr><th>Nama</th><th>Nominal</th><th>Tipe</th><th>Aktif</th></tr></thead>
          <tbody>{feeTypes.map((f) => <tr key={f.id}><td>{f.name}</td><td>Rp{Number(f.amount || 0).toLocaleString('id-ID')}</td><td>{f.payment_type}</td><td>{f.is_active ? 'Ya' : 'Tidak'}</td></tr>)}</tbody>
        </table>
      </div>

      <div className="modern-table-card">
        <div className="modern-table-title">Keuangan Sekolah - Pembayaran Siswa</div>
        <form className="toolbar" onSubmit={savePayment}>
          <input placeholder="Student ID" value={paymentForm.student_id} onChange={(e) => setPaymentForm((p) => ({ ...p, student_id: e.target.value }))} required />
          <input placeholder="Fee Type ID" value={paymentForm.fee_type_id} onChange={(e) => setPaymentForm((p) => ({ ...p, fee_type_id: e.target.value }))} required />
          <input type="date" value={paymentForm.payment_date} onChange={(e) => setPaymentForm((p) => ({ ...p, payment_date: e.target.value }))} required />
          <input placeholder="Nominal Bayar" value={paymentForm.amount} onChange={(e) => setPaymentForm((p) => ({ ...p, amount: e.target.value }))} required />
          <button type="submit">Tambah</button>
        </form>
        <table className="table">
          <thead><tr><th>Tanggal</th><th>Student</th><th>Fee</th><th>Nominal</th></tr></thead>
          <tbody>{payments.slice(0, 100).map((p) => <tr key={p.id}><td>{p.payment_date?.slice?.(0, 10) || '-'}</td><td>{p.student_id}</td><td>{p.fee_type_id}</td><td>Rp{Number(p.amount || 0).toLocaleString('id-ID')}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
