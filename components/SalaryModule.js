import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { toCSV } from '../lib/csv';

const MONTH_OPTIONS = [
  { id: 1, label: 'January' },
  { id: 2, label: 'February' },
  { id: 3, label: 'March' },
  { id: 4, label: 'April' },
  { id: 5, label: 'May' },
  { id: 6, label: 'June' },
  { id: 7, label: 'July' },
  { id: 8, label: 'August' },
  { id: 9, label: 'September' },
  { id: 10, label: 'October' },
  { id: 11, label: 'November' },
  { id: 12, label: 'December' },
];

const CATEGORY_OPTIONS = ['All', 'Teaching', 'Admin', 'Non Teaching'];

const currentDate = new Date();
const CURRENT_MONTH = currentDate.getMonth() + 1;
const CURRENT_YEAR = currentDate.getFullYear();

const emptyStructure = {
  basicPay: 0,
  hra: 0,
  da: 0,
  specialAllowance: 0,
  conveyanceAllowance: 0,
  medicalAllowance: 0,
  otherAllowances: [],
  pfApplicable: false,
  pfEmployeeContribution: 0,
  pfEmployerContribution: 0,
  esiApplicable: false,
  professionalTaxApplicable: false,
  tdsApplicable: false,
  advanceRecoveryPerMonth: 0,
  otherDeductions: [],
};

const formatCurrency = (value = 0) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const buildGrossSalary = (structure = emptyStructure) => {
  const allowances =
    (structure.otherAllowances || []).reduce((total, item) => total + Number(item?.amount || 0), 0) +
    Number(structure.specialAllowance || 0) +
    Number(structure.conveyanceAllowance || 0) +
    Number(structure.medicalAllowance || 0);
  return (
    Number(structure.basicPay || 0) +
    Number(structure.hra || 0) +
    Number(structure.da || 0) +
    allowances
  );
};

const SalarySlip = ({ staff, salary, structure, monthLabel }) => {
  if (!staff || !salary) return null;
  const allowances = salary.allowancesSnapshot || structure || {};
  const deductions = salary.deductionsSnapshot || {};

  return (
    <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 text-slate-800 shadow-xl print:max-w-full print:shadow-none">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{staff.fullName}</h2>
          <p className="text-sm text-slate-500">Staff ID: {staff.staffId}</p>
          <p className="text-sm text-slate-500">{staff.designationCategory} · {staff.subRole}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-cardinal">Salary Slip</p>
          <p className="text-xs text-slate-500">{monthLabel}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-700">Earnings</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt>Basic Pay</dt><dd>{formatCurrency(allowances.basicPay)}</dd></div>
            <div className="flex justify-between"><dt>HRA</dt><dd>{formatCurrency(allowances.hra)}</dd></div>
            <div className="flex justify-between"><dt>DA</dt><dd>{formatCurrency(allowances.da)}</dd></div>
            <div className="flex justify-between"><dt>Special Allowance</dt><dd>{formatCurrency(allowances.specialAllowance)}</dd></div>
            <div className="flex justify-between"><dt>Conveyance</dt><dd>{formatCurrency(allowances.conveyanceAllowance)}</dd></div>
            <div className="flex justify-between"><dt>Medical</dt><dd>{formatCurrency(allowances.medicalAllowance)}</dd></div>
            {(allowances.otherAllowances || []).map((item, index) => (
              <div key={index} className="flex justify-between">
                <dt>{item.label || 'Allowance'}</dt>
                <dd>{formatCurrency(item.amount)}</dd>
              </div>
            ))}
            {salary.overtimeAmount ? (
              <div className="flex justify-between"><dt>Overtime</dt><dd>{formatCurrency(salary.overtimeAmount)}</dd></div>
            ) : null}
            {(salary.extraPayments || []).map((item, index) => (
              <div key={index} className="flex justify-between">
                <dt>{item.label}</dt>
                <dd>{formatCurrency(item.amount)}</dd>
              </div>
            ))}
            <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 font-semibold">
              <dt>Gross Salary</dt>
              <dd>{formatCurrency(salary.grossSalary)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-700">Deductions</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt>PF (Employee)</dt><dd>{formatCurrency(deductions.pfEmployeeContribution)}</dd></div>
            <div className="flex justify-between"><dt>PF (Employer)</dt><dd>{formatCurrency(deductions.pfEmployerContribution)}</dd></div>
            <div className="flex justify-between"><dt>ESI</dt><dd>{formatCurrency(deductions.esiContribution)}</dd></div>
            <div className="flex justify-between"><dt>Professional Tax</dt><dd>{formatCurrency(deductions.professionalTax)}</dd></div>
            <div className="flex justify-between"><dt>TDS</dt><dd>{formatCurrency(deductions.tdsAmount)}</dd></div>
            <div className="flex justify-between"><dt>Advance Recovery</dt><dd>{formatCurrency(deductions.advanceRecoveryPerMonth)}</dd></div>
            {(deductions.otherDeductions || []).map((item, index) => (
              <div key={index} className="flex justify-between">
                <dt>{item.label}</dt>
                <dd>{formatCurrency(item.amount)}</dd>
              </div>
            ))}
            {salary.penaltiesAmount ? (
              <div className="flex justify-between"><dt>Penalties</dt><dd>{formatCurrency(salary.penaltiesAmount)}</dd></div>
            ) : null}
            <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 font-semibold">
              <dt>Total Deductions</dt>
              <dd>{formatCurrency(salary.totalDeductions)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-emerald-700">Net Payable</p>
          <p className="text-xl font-bold text-emerald-800">{formatCurrency(salary.netPayable)}</p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>Status: {salary.paymentStatus || 'Pending'}</p>
          <p>Processed on: {salary.processedAt ? new Date(salary.processedAt.seconds * 1000).toLocaleString() : 'Draft'}</p>
          <p className="mt-1 text-[11px] text-slate-400">This is a system generated slip.</p>
        </div>
      </div>
    </div>
  );
};

const SalarySlipModal = ({ open, onClose, salary, staff, structure, monthLabel, onDownloadCsv }) => {
  if (!open || !salary) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-8">
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Salary Slip</h3>
            <p className="text-sm text-slate-500">{staff?.fullName} · {monthLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDownloadCsv}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              Download CSV
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-lg border border-cardinal px-3 py-1.5 text-sm font-semibold text-cardinal transition hover:bg-cardinal/10"
            >
              Print / PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
            >
              Close
            </button>
          </div>
        </div>
        <div className="p-6">
          <SalarySlip staff={staff} salary={salary} structure={structure} monthLabel={monthLabel} />
        </div>
      </div>
    </div>
  );
};

const SalaryStructureForm = ({ staff, structure, onSave, saving }) => {
  const [draft, setDraft] = useState(structure || emptyStructure);

  useEffect(() => {
    setDraft(structure || emptyStructure);
  }, [structure]);

  const handleField = (field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleArrayFieldChange = (field, index, key, value) => {
    setDraft((prev) => {
      const list = Array.isArray(prev[field]) ? [...prev[field]] : [];
      list[index] = { ...list[index], [key]: value };
      return { ...prev, [field]: list };
    });
  };

  const handleAddRow = (field) => {
    setDraft((prev) => ({ ...prev, [field]: [...(prev[field] || []), { label: '', amount: 0 }] }));
  };

  const handleRemoveRow = (field, index) => {
    setDraft((prev) => ({ ...prev, [field]: (prev[field] || []).filter((_, idx) => idx !== index) }));
  };

  const gross = buildGrossSalary(draft);

  if (!staff) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Select a staff member to edit salary structure.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Salary Structure</h3>
          <p className="text-sm text-slate-500">Configure salary breakdown for {staff.fullName}</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold text-slate-700">Gross Salary</p>
          <p className="text-lg font-bold text-emerald-700">{formatCurrency(gross)}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {[
          ['basicPay', 'Basic Pay'],
          ['hra', 'HRA'],
          ['da', 'DA'],
          ['specialAllowance', 'Special Allowance'],
          ['conveyanceAllowance', 'Conveyance'],
          ['medicalAllowance', 'Medical Allowance'],
        ].map(([field, label]) => (
          <label key={field} className="text-sm font-semibold text-slate-700">
            {label}
            <input
              type="number"
              value={draft[field] || ''}
              onChange={(event) => handleField(field, Number(event.target.value || 0))}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
              min="0"
            />
          </label>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Other Allowances</p>
            <button
              type="button"
              onClick={() => handleAddRow('otherAllowances')}
              className="text-sm font-semibold text-cardinal"
            >
              + Add
            </button>
          </div>
          {(draft.otherAllowances || []).map((item, index) => (
            <div key={index} className="grid grid-cols-12 items-center gap-2">
              <input
                value={item.label}
                onChange={(event) => handleArrayFieldChange('otherAllowances', index, 'label', event.target.value)}
                placeholder="Label"
                className="col-span-6 rounded-lg border border-slate-200 px-2 py-1 text-sm"
              />
              <input
                type="number"
                value={item.amount}
                onChange={(event) => handleArrayFieldChange('otherAllowances', index, 'amount', Number(event.target.value || 0))}
                placeholder="Amount"
                className="col-span-4 rounded-lg border border-slate-200 px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => handleRemoveRow('otherAllowances', index)}
                className="col-span-2 text-xs font-semibold text-rose-600"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">Other Deductions</p>
            <button type="button" onClick={() => handleAddRow('otherDeductions')} className="text-sm font-semibold text-cardinal">
              + Add
            </button>
          </div>
          {(draft.otherDeductions || []).map((item, index) => (
            <div key={index} className="grid grid-cols-12 items-center gap-2">
              <input
                value={item.label}
                onChange={(event) => handleArrayFieldChange('otherDeductions', index, 'label', event.target.value)}
                placeholder="Label"
                className="col-span-6 rounded-lg border border-slate-200 px-2 py-1 text-sm"
              />
              <input
                type="number"
                value={item.amount}
                onChange={(event) => handleArrayFieldChange('otherDeductions', index, 'amount', Number(event.target.value || 0))}
                placeholder="Amount"
                className="col-span-4 rounded-lg border border-slate-200 px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => handleRemoveRow('otherDeductions', index)}
                className="col-span-2 text-xs font-semibold text-rose-600"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={draft.pfApplicable}
            onChange={(event) => handleField('pfApplicable', event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-cardinal focus:ring-cardinal"
          />
          Provident Fund applicable
        </label>
        <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={draft.esiApplicable}
            onChange={(event) => handleField('esiApplicable', event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-cardinal focus:ring-cardinal"
          />
          ESI applicable
        </label>
        <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={draft.professionalTaxApplicable}
            onChange={(event) => handleField('professionalTaxApplicable', event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-cardinal focus:ring-cardinal"
          />
          Professional Tax applicable
        </label>
        <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={draft.tdsApplicable}
            onChange={(event) => handleField('tdsApplicable', event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-cardinal focus:ring-cardinal"
          />
          TDS applicable
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm font-semibold text-slate-700">
          PF Employee Contribution
          <input
            type="number"
            value={draft.pfEmployeeContribution || ''}
            onChange={(event) => handleField('pfEmployeeContribution', Number(event.target.value || 0))}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          PF Employer Contribution
          <input
            type="number"
            value={draft.pfEmployerContribution || ''}
            onChange={(event) => handleField('pfEmployerContribution', Number(event.target.value || 0))}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Advance Recovery / Month
          <input
            type="number"
            value={draft.advanceRecoveryPerMonth || ''}
            onChange={(event) => handleField('advanceRecoveryPerMonth', Number(event.target.value || 0))}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          />
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => onSave(draft, gross)}
          disabled={saving}
          className="rounded-xl bg-cardinal px-5 py-2 text-sm font-semibold text-white shadow hover:bg-cardinal/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? 'Saving…' : 'Save Structure'}
        </button>
      </div>
    </div>
  );
};

const SalaryProcessingPanel = ({
  staff,
  month,
  year,
  structure,
  attendance,
  salaryDoc,
  onSave,
  saving,
}) => {
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [overtimeAmount, setOvertimeAmount] = useState(0);
  const [extraPayments, setExtraPayments] = useState([]);
  const [manualPenalties, setManualPenalties] = useState(0);
  const [paymentStatus, setPaymentStatus] = useState('Pending');
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [transactionId, setTransactionId] = useState('');

  useEffect(() => {
    if (salaryDoc) {
      setOvertimeHours(salaryDoc.overtimeHours || 0);
      setOvertimeAmount(salaryDoc.overtimeAmount || 0);
      setExtraPayments(salaryDoc.extraPayments || []);
      setManualPenalties(salaryDoc.penaltiesAmount || 0);
      setPaymentStatus(salaryDoc.paymentStatus || 'Pending');
      setPaymentMethod(salaryDoc.paymentMethod || 'Bank Transfer');
      setTransactionId(salaryDoc.transactionId || '');
    }
  }, [salaryDoc]);

  const handleExtraChange = (index, key, value) => {
    setExtraPayments((prev) => {
      const list = [...prev];
      list[index] = { ...list[index], [key]: value };
      return list;
    });
  };

  const addExtra = () => setExtraPayments((prev) => [...prev, { label: '', amount: 0 }]);
  const removeExtra = (index) => setExtraPayments((prev) => prev.filter((_, idx) => idx !== index));

  if (!staff) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Select a staff member to process salary.
      </div>
    );
  }

  const totalWorkingDays = attendance?.totalWorkingDays || 0;
  const presentDays = attendance?.presentDays || totalWorkingDays;
  const unpaidLeaves = attendance?.unpaidLeaves || 0;
  const absenceFactor = totalWorkingDays > 0 ? presentDays / totalWorkingDays : 1;
  const grossSalary = buildGrossSalary(structure) * absenceFactor + Number(overtimeAmount || 0);
  const allowanceSnapshot = {
    ...structure,
    grossSalary: buildGrossSalary(structure),
  };

  const deductionBase = {
    pfEmployeeContribution: structure?.pfApplicable ? Number(structure.pfEmployeeContribution || 0) : 0,
    pfEmployerContribution: structure?.pfApplicable ? Number(structure.pfEmployerContribution || 0) : 0,
    esiContribution: structure?.esiApplicable ? Math.round(grossSalary * 0.0075) : 0,
    professionalTax: structure?.professionalTaxApplicable ? 200 : 0,
    tdsAmount: structure?.tdsApplicable ? Math.round(grossSalary * 0.05) : 0,
    advanceRecoveryPerMonth: Number(structure?.advanceRecoveryPerMonth || 0),
    otherDeductions: structure?.otherDeductions || [],
  };

  const otherDeductionsTotal = (deductionBase.otherDeductions || []).reduce(
    (sum, item) => sum + Number(item?.amount || 0),
    0,
  );

  const penaltiesAmount = Number(attendance?.penaltiesAmount || 0) + Number(manualPenalties || 0);

  const totalDeductions =
    deductionBase.pfEmployeeContribution +
    deductionBase.pfEmployerContribution +
    deductionBase.esiContribution +
    deductionBase.professionalTax +
    deductionBase.tdsAmount +
    deductionBase.advanceRecoveryPerMonth +
    otherDeductionsTotal +
    penaltiesAmount;

  const extraTotal = (extraPayments || []).reduce((sum, item) => sum + Number(item?.amount || 0), 0);
  const netPayable = grossSalary + extraTotal - totalDeductions;

  const handleSave = (status) => {
    onSave({
      overtimeHours,
      overtimeAmount,
      extraPayments,
      penaltiesAmount,
      paymentStatus: status,
      paymentMethod,
      transactionId,
      attendanceImpactDaysDeducted: unpaidLeaves,
      grossSalary: Math.round(grossSalary + extraTotal),
      totalDeductions: Math.round(totalDeductions),
      netPayable: Math.round(netPayable),
      allowanceSnapshot,
      deductionSnapshot: deductionBase,
    });
  };

  return (
    <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Salary processing</h3>
          <p className="text-sm text-slate-500">
            {staff.fullName} · {MONTH_OPTIONS.find((m) => m.id === month)?.label} {year}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Attendance: {presentDays}/{totalWorkingDays} working days · Unpaid leaves: {unpaidLeaves}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500">Net Payable</p>
          <p className="text-2xl font-bold text-emerald-700">{formatCurrency(netPayable)}</p>
          <p className="text-xs text-slate-500">Gross: {formatCurrency(grossSalary + extraTotal)}</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">
          Overtime Hours
          <input
            type="number"
            value={overtimeHours}
            onChange={(event) => setOvertimeHours(Number(event.target.value || 0))}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Overtime Amount
          <input
            type="number"
            value={overtimeAmount}
            onChange={(event) => setOvertimeAmount(Number(event.target.value || 0))}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          />
        </label>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700">Extra Payments (bonus, incentives)</p>
          <button type="button" onClick={addExtra} className="text-sm font-semibold text-cardinal">
            + Add
          </button>
        </div>
        {(extraPayments || []).map((item, index) => (
          <div key={index} className="grid grid-cols-12 items-center gap-2">
            <input
              value={item.label}
              onChange={(event) => handleExtraChange(index, 'label', event.target.value)}
              placeholder="Label"
              className="col-span-6 rounded-lg border border-slate-200 px-2 py-1 text-sm"
            />
            <input
              type="number"
              value={item.amount}
              onChange={(event) => handleExtraChange(index, 'amount', Number(event.target.value || 0))}
              placeholder="Amount"
              className="col-span-4 rounded-lg border border-slate-200 px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={() => removeExtra(index)}
              className="col-span-2 text-xs font-semibold text-rose-600"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">
          Manual Penalties / Adjustments
          <input
            type="number"
            value={manualPenalties}
            onChange={(event) => setManualPenalties(Number(event.target.value || 0))}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Payment Method
          <select
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          >
            {['Bank Transfer', 'Cash', 'UPI', 'Cheque'].map((method) => (
              <option key={method}>{method}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">
          Transaction ID (optional)
          <input
            value={transactionId}
            onChange={(event) => setTransactionId(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
            placeholder="UTR / Reference"
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Payment Status
          <select
            value={paymentStatus}
            onChange={(event) => setPaymentStatus(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          >
            {['Pending', 'Paid', 'On Hold', 'Cancelled'].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => handleSave('Pending')}
          disabled={saving}
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed"
        >
          Save Draft Salary
        </button>
        <button
          type="button"
          onClick={() => handleSave('Paid')}
          disabled={saving}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed"
        >
          Mark As Paid
        </button>
      </div>
    </div>
  );
};

const MonthlySheet = ({ salaries, onDownload }) => {
  if (!salaries.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
        No salary entries found for the selected period.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700">Monthly Salary Sheet</h3>
        <button
          type="button"
          onClick={onDownload}
          className="rounded-lg border border-cardinal px-3 py-1.5 text-sm font-semibold text-cardinal transition hover:bg-cardinal/10"
        >
          Download sheet as CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              {['Staff ID', 'Name', 'Category', 'Sub Role', 'Gross', 'Deductions', 'Net', 'Payment Status', 'Payment Method'].map((heading) => (
                <th key={heading} className="px-4 py-2 text-left font-semibold text-slate-700">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {salaries.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-2 font-medium text-slate-900">{row.staffId}</td>
                <td className="px-4 py-2 text-slate-700">{row.staffNameSnapshot || row.staffName || row.staff?.fullName}</td>
                <td className="px-4 py-2 text-slate-700">{row.designationSnapshot || row.designationCategory}</td>
                <td className="px-4 py-2 text-slate-700">{row.subRole}</td>
                <td className="px-4 py-2 text-slate-700">{formatCurrency(row.grossSalary)}</td>
                <td className="px-4 py-2 text-slate-700">{formatCurrency(row.totalDeductions)}</td>
                <td className="px-4 py-2 font-semibold text-emerald-700">{formatCurrency(row.netPayable)}</td>
                <td className="px-4 py-2 text-slate-700">{row.paymentStatus}</td>
                <td className="px-4 py-2 text-slate-700">{row.paymentMethod || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const downloadCsvBlob = (rows, fileName) => {
  const csv = toCSV(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
};

const SalaryModule = ({ processorUid }) => {
  const [staff, setStaff] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [structures, setStructures] = useState({});
  const [structureSaving, setStructureSaving] = useState(false);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [salaries, setSalaries] = useState([]);
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [salarySaving, setSalarySaving] = useState(false);
  const [slipContext, setSlipContext] = useState({ open: false, salary: null });

  useEffect(() => {
    const staffRef = collection(db, 'staff');
    const unsub = onSnapshot(query(staffRef, orderBy('fullName', 'asc')), (snapshot) => {
      const rows = [];
      snapshot.forEach((docSnap) => {
        rows.push({ id: docSnap.id, ...docSnap.data() });
      });
      setStaff(rows);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!selectedMonth || !selectedYear) return;
    setSalaryLoading(true);
    const salariesRef = collection(db, 'salaries');
    const salariesQuery = query(
      salariesRef,
      where('month', '==', selectedMonth),
      where('year', '==', selectedYear),
    );
    const unsub = onSnapshot(salariesQuery, (snapshot) => {
      const rows = [];
      snapshot.forEach((docSnap) => rows.push({ id: docSnap.id, ...docSnap.data() }));
      setSalaries(rows);
      setSalaryLoading(false);
    });
    return unsub;
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    if (!selectedStaff?.staffId) return;
    const run = async () => {
      const structureRef = doc(db, 'salaryStructures', selectedStaff.staffId);
      const structureSnap = await getDoc(structureRef);
      if (structureSnap.exists()) {
        setStructures((prev) => ({ ...prev, [selectedStaff.staffId]: structureSnap.data() }));
      }
      const attendanceQuery = query(
        collection(db, 'staffAttendance'),
        where('staffId', '==', selectedStaff.staffId),
        where('month', '==', selectedMonth),
        where('year', '==', selectedYear),
      );
      const attendanceSnap = await getDocs(attendanceQuery);
      attendanceSnap.forEach((docSnap) => {
        setAttendanceMap((prev) => ({ ...prev, [selectedStaff.staffId]: docSnap.data() }));
      });
    };
    run();
  }, [selectedMonth, selectedYear, selectedStaff]);

  const selectedStructure = selectedStaff ? structures[selectedStaff.staffId] || { ...emptyStructure, staffId: selectedStaff.staffId } : null;
  const selectedAttendance = selectedStaff ? attendanceMap[selectedStaff.staffId] : null;
  const selectedSalaryDoc = useMemo(
    () => salaries.find((entry) => entry.staffId === selectedStaff?.staffId),
    [salaries, selectedStaff],
  );

  const staffForTable = useMemo(() => {
    return staff
      .filter((member) => selectedCategory === 'All' || member.designationCategory === selectedCategory)
      .map((member) => {
        const salaryRow = salaries.find((entry) => entry.staffId === member.staffId);
        return {
          ...member,
          netPay: salaryRow?.netPayable,
          paymentStatus: salaryRow?.paymentStatus || 'Pending',
        };
      });
  }, [staff, salaries, selectedCategory]);

  const stats = useMemo(() => {
    const totalStaff = staffForTable.length;
    const paid = salaries.filter((s) => s.paymentStatus === 'Paid');
    const totalPaid = paid.reduce((sum, row) => sum + Number(row.netPayable || 0), 0);
    const totalPending = salaries
      .filter((s) => s.paymentStatus !== 'Paid')
      .reduce((sum, row) => sum + Number(row.netPayable || 0), 0);
    const totalPf = salaries.reduce(
      (sum, row) => sum + Number(row?.deductionsSnapshot?.pfEmployerContribution || 0) + Number(row?.deductionsSnapshot?.pfEmployeeContribution || 0),
      0,
    );
    const totalEsi = salaries.reduce((sum, row) => sum + Number(row?.deductionsSnapshot?.esiContribution || 0), 0);
    return { totalStaff, totalPaid, totalPending, totalPf, totalEsi };
  }, [salaries, staffForTable]);

  const handleStructureSave = async (draft, gross) => {
    if (!selectedStaff) return;
    setStructureSaving(true);
    try {
      const payload = {
        ...draft,
        staffId: selectedStaff.staffId,
        grossSalary: gross,
        updatedAt: serverTimestamp(),
        createdAt: draft.createdAt || serverTimestamp(),
      };
      await setDoc(doc(db, 'salaryStructures', selectedStaff.staffId), payload, { merge: true });
      setStructures((prev) => ({ ...prev, [selectedStaff.staffId]: payload }));
    } catch (error) {
      console.error('Error saving salary structure', error);
    } finally {
      setStructureSaving(false);
    }
  };

  const handleSalarySave = async (payload) => {
    if (!selectedStaff) return;
    setSalarySaving(true);
    try {
      const salaryId = `${selectedStaff.staffId || selectedStaff.id}_${selectedYear}_${selectedMonth}`;
      const salaryRef = doc(db, 'salaries', salaryId);
      const salaryData = {
        staffId: selectedStaff.staffId,
        staffNameSnapshot: selectedStaff.fullName,
        designationSnapshot: selectedStaff.designationCategory,
        subRole: selectedStaff.subRole,
        month: selectedMonth,
        year: selectedYear,
        allowancesSnapshot: payload.allowanceSnapshot,
        deductionsSnapshot: payload.deductionSnapshot,
        attendanceImpactDaysDeducted: payload.attendanceImpactDaysDeducted,
        overtimeHours: payload.overtimeHours,
        overtimeAmount: payload.overtimeAmount,
        extraPayments: payload.extraPayments,
        grossSalary: payload.grossSalary,
        totalDeductions: payload.totalDeductions,
        netPayable: payload.netPayable,
        paymentStatus: payload.paymentStatus,
        paymentMethod: payload.paymentMethod,
        transactionId: payload.transactionId,
        penaltiesAmount: payload.penaltiesAmount,
        processedAt: payload.paymentStatus === 'Paid' ? serverTimestamp() : null,
        processedByUid: payload.paymentStatus === 'Paid' ? processorUid || null : null,
        createdAt: serverTimestamp(),
      };
      await setDoc(salaryRef, salaryData, { merge: true });
    } catch (error) {
      console.error('Salary save failed', error);
    } finally {
      setSalarySaving(false);
    }
  };

  const openSlip = (salary) => {
    if (!salary) return;
    const staffRow = staff.find((member) => member.staffId === salary.staffId) || selectedStaff;
    setSlipContext({ open: true, salary, staff: staffRow });
  };

  const handleDownloadSlipCsv = (salary) => {
    if (!salary) return;
    downloadCsvBlob(
      [
        {
          staffId: salary.staffId,
          month: salary.month,
          year: salary.year,
          netPayable: salary.netPayable,
          grossSalary: salary.grossSalary,
          deductions: salary.totalDeductions,
          paymentStatus: salary.paymentStatus,
          paymentMethod: salary.paymentMethod,
        },
      ],
      `salary_${salary.staffId}_${salary.year}_${salary.month}.csv`,
    );
  };

  const handleDownloadSheet = () => {
    const sheetRows = salaries.map((row) => ({
      staffId: row.staffId,
      name: row.staffNameSnapshot,
      category: row.designationSnapshot,
      subRole: row.subRole,
      grossSalary: row.grossSalary,
      totalDeductions: row.totalDeductions,
      netPayable: row.netPayable,
      paymentStatus: row.paymentStatus,
      paymentMethod: row.paymentMethod,
    }));
    downloadCsvBlob(sheetRows, `salary_sheet_${selectedYear}_${selectedMonth}.csv`);
  };

  const filteredSalaries = salaries.filter((row) => {
    if (selectedCategory === 'All') return true;
    const staffRow = staff.find((member) => member.staffId === row.staffId);
    return staffRow?.designationCategory === selectedCategory;
  });

  return (
    <section className="mt-8 space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm font-semibold text-slate-700">
          Month
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(Number(event.target.value))}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          >
            {MONTH_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Year
          <select
            value={selectedYear}
            onChange={(event) => setSelectedYear(Number(event.target.value))}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          >
            {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map((year) => (
              <option key={year}>{year}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Category
          <select
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-cardinal focus:outline-none focus:ring-2 focus:ring-cardinal/20"
          >
            {CATEGORY_OPTIONS.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Total Staff</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{stats.totalStaff}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Total Salary Payout</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-700">{formatCurrency(stats.totalPaid)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Pending Salary</p>
          <p className="mt-2 text-2xl font-semibold text-amber-600">{formatCurrency(stats.totalPending)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">PF Outflow</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(stats.totalPf)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-slate-500">ESI Outflow</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(stats.totalEsi)}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Staff Salary Overview</h3>
            <p className="text-xs text-slate-500">Click a row to process salary for the selected month.</p>
          </div>
          {salaryLoading && <span className="h-5 w-5 animate-spin rounded-full border-2 border-cardinal/30 border-t-cardinal" />}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['Staff ID', 'Name', 'Category', 'Sub Role', 'Employment Type', 'Net Salary', 'Status', 'Action'].map((heading) => (
                  <th key={heading} className="px-4 py-2 text-left font-semibold text-slate-700">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {staffForTable.map((member) => {
                const salaryRow = salaries.find((entry) => entry.staffId === member.staffId);
                return (
                  <tr key={member.staffId} className="hover:bg-cardinal/5">
                  <td className="px-4 py-2 font-semibold text-slate-900">{member.staffId}</td>
                  <td className="px-4 py-2 text-slate-700">{member.fullName}</td>
                  <td className="px-4 py-2 text-slate-700">{member.designationCategory}</td>
                  <td className="px-4 py-2 text-slate-700">{member.subRole}</td>
                  <td className="px-4 py-2 text-slate-700">{member.employmentType}</td>
                  <td className="px-4 py-2 font-semibold text-emerald-700">
                    {member.netPay ? formatCurrency(member.netPay) : '—'}
                  </td>
                  <td className="px-4 py-2 text-slate-700">{member.paymentStatus}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedStaff(member)}
                        className="rounded-lg border border-cardinal px-3 py-1.5 text-xs font-semibold text-cardinal transition hover:bg-cardinal/10"
                      >
                        View details
                      </button>
                      {salaryRow && (
                        <button
                          type="button"
                          onClick={() => openSlip(salaryRow)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          View slip
                        </button>
                      )}
                    </div>
                  </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SalaryStructureForm
          staff={selectedStaff}
          structure={selectedStructure}
          onSave={handleStructureSave}
          saving={structureSaving}
        />
        <SalaryProcessingPanel
          staff={selectedStaff}
          month={selectedMonth}
          year={selectedYear}
          structure={selectedStructure || emptyStructure}
          attendance={selectedAttendance}
          salaryDoc={selectedSalaryDoc}
          onSave={handleSalarySave}
          saving={salarySaving}
        />
      </div>

      <MonthlySheet salaries={filteredSalaries} onDownload={handleDownloadSheet} />

      {slipContext.open && (
        <SalarySlipModal
          open={slipContext.open}
          salary={slipContext.salary}
          staff={slipContext.staff}
          structure={slipContext.salary?.allowancesSnapshot || selectedStructure}
          monthLabel={`${MONTH_OPTIONS.find((m) => m.id === (slipContext.salary?.month || selectedMonth))?.label} ${
            slipContext.salary?.year || selectedYear
          }`}
          onDownloadCsv={() => handleDownloadSlipCsv(slipContext.salary)}
          onClose={() => setSlipContext({ open: false, salary: null, staff: null })}
        />
      )}
    </section>
  );
};

export default SalaryModule;
export { SalarySlip };
