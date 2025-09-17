import React, { useEffect, useMemo, useState } from "react";

/**
 * Behavior Rubric App — single-file React component
 * - Editable categories, periods, and 0–3 scale labels
 * - Per-period x category scoring matrix
 * - Auto totals, %s, goal tracking
 * - Per-period comments + daily notes
 * - Multi-student support (local-only)
 * - Save to localStorage, export CSV, print daily report
 * - Import/Export settings as JSON
 * - Modern UI with Tailwind (no external component libs)
 */

// ---- Utilities ----
const todayISO = () => new Date().toISOString().slice(0, 10);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const uid = () => Math.random().toString(36).slice(2, 9);

// CSV helpers
function toCSV(rows) {
  return rows
    .map((r) => r.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
}

// localStorage helpers
const LS_KEY = "behavior_rubric_app_v1";
const loadLS = () => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
const saveLS = (state) => localStorage.setItem(LS_KEY, JSON.stringify(state));

// ---- Default Config ----
const DEFAULT_SETTINGS = {
  scaleMax: 3,
  scaleLabels: {
    0: "Not Met",
    1: "Emerging",
    2: "Meets",
    3: "Exceeds",
  },
  categories: [
    { id: uid(), name: "Be Respectful" },
    { id: uid(), name: "Be Responsible" },
    { id: uid(), name: "Be Safe" },
    { id: uid(), name: "On Task" },
  ],
  periods: [
    { id: uid(), name: "Arrival" },
    { id: uid(), name: "Morning Block" },
    { id: uid(), name: "Lunch/Recess" },
    { id: uid(), name: "Afternoon Block" },
    { id: uid(), name: "Dismissal" },
  ],
  goalPoints: 24,
};

// ---- Root Component ----
export default function BehaviorRubricApp() {
  // Global app state
  const [students, setStudents] = useState(() => {
    const s = loadLS();
    return s?.students ?? [
      { id: uid(), name: "Seth Example" },
    ];
  });
  const [settings, setSettings] = useState(() => {
    const s = loadLS();
    return s?.settings ?? DEFAULT_SETTINGS;
  });
  const [date, setDate] = useState(() => {
    const s = loadLS();
    return s?.date ?? todayISO();
  });
  const [studentId, setStudentId] = useState(() => {
    const s = loadLS();
    return s?.studentId ?? students[0]?.id;
  });

  // Data entries: keyed by date->studentId
  const [entries, setEntries] = useState(() => {
    const s = loadLS();
    return s?.entries ?? {};
  });

  // Persist
  useEffect(() => {
    saveLS({ students, settings, date, studentId, entries });
  }, [students, settings, date, studentId, entries]);

  const student = students.find((s) => s.id === studentId);

  // Ensure record exists for (date, student)
  const key = `${date}__${studentId}`;
  const record = useMemo(() => {
    const existing = entries[key];
    if (existing) return existing;
    const matrix = {};
    settings.periods.forEach((p) => {
      matrix[p.id] = {};
      settings.categories.forEach((c) => (matrix[p.id][c.id] = null));
    });
    return {
      id: uid(),
      studentId,
      date,
      matrix, // periodId -> categoryId -> score (0..scaleMax or null)
      periodComments: {}, // periodId -> string
      dailyNote: "",
      staff: "",
    };
  }, [entries, key, settings, studentId, date]);

  useEffect(() => {
    if (!entries[key]) {
      setEntries((prev) => ({ ...prev, [key]: record }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function updateRecord(mut) {
    setEntries((prev) => ({ ...prev, [key]: { ...prev[key], ...mut } }));
  }

  function setScore(periodId, categoryId, val) {
    const v = val === "" ? null : clamp(parseInt(val, 10), 0, settings.scaleMax);
    setEntries((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        matrix: {
          ...prev[key].matrix,
          [periodId]: {
            ...prev[key].matrix[periodId],
            [categoryId]: Number.isNaN(v) ? null : v,
          },
        },
      },
    }));
  }

  // Totals
  const { totalPoints, maxPoints, percent, perPeriodTotals } = useMemo(() => {
    let total = 0;
    let max = 0;
    const per = {};
    settings.periods.forEach((p) => {
      let t = 0;
      let m = 0;
      settings.categories.forEach((c) => {
        const val = record.matrix?.[p.id]?.[c.id];
        if (val !== null && val !== undefined) {
          t += val;
        }
        m += settings.scaleMax;
      });
      per[p.id] = { total: t, max: m };
      total += t;
      max += m;
    });
    return {
      totalPoints: total,
      maxPoints: max,
      percent: max > 0 ? Math.round((total / max) * 100) : 0,
      perPeriodTotals: per,
    };
  }, [record, settings]);

  // CSV export
  function exportCSV() {
    const header = [
      "Date",
      "Student",
      "Period",
      "Category",
      "Score",
      "ScaleMax",
      "PeriodTotal",
      "PeriodMax",
      "DailyTotal",
      "DailyMax",
      "Percent",
      "Staff",
      "PeriodComment",
      "DailyNote",
    ];

    const rows = [header];
    settings.periods.forEach((p) => {
      settings.categories.forEach((c) => {
        const score = record.matrix?.[p.id]?.[c.id];
        rows.push([
          date,
          student?.name ?? "",
          p.name,
          c.name,
          score ?? "",
          settings.scaleMax,
          perPeriodTotals[p.id].total,
          perPeriodTotals[p.id].max,
          totalPoints,
          maxPoints,
          `${percent}%`,
          record.staff ?? "",
          record.periodComments?.[p.id] ?? "",
          record.dailyNote ?? "",
        ]);
      });
    });

    const csv = toCSV(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `behavior_rubric_${student?.name ?? "student"}_${date}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function printDaily() {
    window.print();
  }

  // Import/Export settings
  function exportSettingsJSON() {
    const json = JSON.stringify(settings, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `behavior_rubric_settings.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importSettingsJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed || typeof parsed !== "object") throw new Error("Bad JSON");
        setSettings(parsed);
        // Rebuild current record matrix shape to match new settings
        setEntries((prev) => {
          const rec = prev[key];
          const matrix = {};
          parsed.periods.forEach((p) => {
            matrix[p.id] = {};
            parsed.categories.forEach((c) => {
              matrix[p.id][c.id] = null;
            });
          });
          return { ...prev, [key]: { ...rec, matrix } };
        });
      } catch (err) {
        alert("Invalid settings file");
      }
    };
    reader.readAsText(file);
  }

  // Students
  function addStudent(name) {
    const s = { id: uid(), name: name.trim() };
    if (!s.name) return;
    setStudents((prev) => [...prev, s]);
    setStudentId(s.id);
  }
  function renameStudent(id, newName) {
    setStudents((prev) => prev.map((s) => (s.id === id ? { ...s, name: newName } : s)));
  }
  function removeStudent(id) {
    if (!confirm("Remove this student? Their local records remain but will be hidden.")) return;
    setStudents((prev) => prev.filter((s) => s.id !== id));
    if (studentId === id) setStudentId(students[0]?.id);
  }

  // Settings editors
  function addCategory() {
    setSettings((prev) => ({ ...prev, categories: [...prev.categories, { id: uid(), name: "New Category" }] }));
  }
  function addPeriod() {
    setSettings((prev) => ({ ...prev, periods: [...prev.periods, { id: uid(), name: "New Period" }] }));
  }

  // When settings change, ensure current record matrix includes all keys
  useEffect(() => {
    setEntries((prev) => {
      const rec = prev[key];
      if (!rec) return prev;
      const nextMatrix = { ...rec.matrix };
      settings.periods.forEach((p) => {
        if (!nextMatrix[p.id]) nextMatrix[p.id] = {};
        settings.categories.forEach((c) => {
          if (!(c.id in nextMatrix[p.id])) nextMatrix[p.id][c.id] = null;
        });
      });
      return { ...prev, [key]: { ...rec, matrix: nextMatrix } };
    });
  }, [settings.periods, settings.categories, key]);

  // UI helpers
  const scaleOptions = Array.from({ length: settings.scaleMax + 1 }, (_, i) => i);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Behavior Rubric — Daily Tracker</h1>
            <p className="text-xs text-gray-500">Data stays in your browser. Export CSV to share. Print for a parent report.</p>
          </div>

          {/* Date */}
          <label className="text-sm flex items-center gap-2">
            <span className="hidden sm:inline">Date</span>
            <input
              type="date"
              className="rounded-lg border px-2 py-1"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>

          {/* Student select */}
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border px-2 py-1"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <AddStudent onAdd={addStudent} />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="rounded-xl border px-3 py-1.5 hover:bg-gray-100"
            >
              Export CSV
            </button>
            <button
              onClick={printDaily}
              className="rounded-xl border px-3 py-1.5 hover:bg-gray-100"
            >
              Print Daily
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {/* Summary card */}
        <section className="grid md:grid-cols-3 gap-4 print:grid-cols-3">
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="font-semibold mb-2">Summary</h2>
            <div className="text-sm grid grid-cols-2 gap-1">
              <div className="text-gray-500">Student</div>
              <div>{student?.name}</div>
              <div className="text-gray-500">Date</div>
              <div>{date}</div>
              <div className="text-gray-500">Daily Total</div>
              <div>{totalPoints} / {maxPoints} ({percent}%)</div>
              <div className="text-gray-500">Goal</div>
              <div>{settings.goalPoints} pts {totalPoints >= settings.goalPoints ? "✅ Met" : "❌ Not Met"}</div>
            </div>
            <div className="mt-3">
              <label className="text-sm text-gray-600">Staff / Recorder</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                placeholder="e.g., Mr. Smith"
                value={record.staff ?? ""}
                onChange={(e) => updateRecord({ staff: e.target.value })}
              />
            </div>
          </div>

          {/* Goal & Settings quick */}
          <div className="bg-white rounded-2xl shadow p-4">
            <h2 className="font-semibold mb-2">Goal & Scale</h2>
            <label className="text-sm text-gray-600">Daily Point Goal</label>
            <input
              type="number"
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={settings.goalPoints}
              onChange={(e) => setSettings((prev) => ({ ...prev, goalPoints: clamp(parseInt(e.target.value || 0, 10), 0, 999) }))}
            />
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div>
                <label className="text-sm text-gray-600">Max score per cell</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-xl border px-3 py-2"
                  value={settings.scaleMax}
                  onChange={(e) => setSettings((prev) => ({ ...prev, scaleMax: clamp(parseInt(e.target.value || 0, 10), 1, 10) }))}
                />
              </div>
              <div>
                <label className="text-sm text-gray-600">Scale labels (0..max)</label>
                <ScaleLabelsEditor settings={settings} setSettings={setSettings} />
              </div>
            </div>
          </div>

          {/* Daily note */}
          <div className="bg-white rounded-2xl shadow p-4 print:col-span-1">
            <h2 className="font-semibold mb-2">Daily Note</h2>
            <textarea
              className="w-full min-h-[104px] rounded-xl border px-3 py-2"
              placeholder="Highlights, triggers, reinforcers, home-school notes..."
              value={record.dailyNote ?? ""}
              onChange={(e) => updateRecord({ dailyNote: e.target.value })}
            />
          </div>
        </section>

        {/* Matrix */}
        <section className="bg-white rounded-2xl shadow overflow-x-auto">
          <div className="p-4 border-b flex items-center justify-between gap-2">
            <h2 className="font-semibold">Daily Rubric</h2>
            <div className="flex items-center gap-2 text-sm">
              <button onClick={addPeriod} className="rounded-lg border px-3 py-1.5 hover:bg-gray-100">+ Period</button>
              <button onClick={addCategory} className="rounded-lg border px-3 py-1.5 hover:bg-gray-100">+ Category</button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left sticky left-0 bg-gray-50 z-10">Period / Category</th>
                {settings.categories.map((c) => (
                  <th key={c.id} className="p-2 text-left">
                    <EditableText
                      value={c.name}
                      onChange={(v) => setSettings((prev) => ({
                        ...prev,
                        categories: prev.categories.map((x) => x.id === c.id ? { ...x, name: v } : x),
                      }))}
                    />
                  </th>
                ))}
                <th className="p-2 text-left">Period Total</th>
              </tr>
            </thead>
            <tbody>
              {settings.periods.map((p) => (
                <tr key={p.id} className="odd:bg-white even:bg-gray-50 border-t">
                  <td className="p-2 sticky left-0 bg-inherit z-10">
                    <EditableText
                      value={p.name}
                      onChange={(v) => setSettings((prev) => ({
                        ...prev,
                        periods: prev.periods.map((x) => x.id === p.id ? { ...x, name: v } : x),
                      }))}
                    />
                    <div className="mt-1">
                      <input
                        className="w-full rounded-lg border px-2 py-1"
                        placeholder="Comment (optional)"
                        value={record.periodComments?.[p.id] ?? ""}
                        onChange={(e) => updateRecord({
                          periodComments: { ...record.periodComments, [p.id]: e.target.value },
                        })}
                      />
                    </div>
                  </td>

                  {settings.categories.map((c) => (
                    <td key={c.id} className="p-2 align-top">
                      <select
                        aria-label={`Score for ${p.name} — ${c.name}`}
                        className="w-full rounded-lg border px-2 py-1"
                        value={record.matrix?.[p.id]?.[c.id] ?? ""}
                        onChange={(e) => setScore(p.id, c.id, e.target.value)}
                      >
                        <option value="">—</option>
                        {scaleOptions.map((n) => (
                          <option key={n} value={n}>
                            {n} — {settings.scaleLabels?.[n] ?? `Level ${n}`}
                          </option>
                        ))}
                      </select>
                    </td>
                  ))}

                  <td className="p-2 font-medium">
                    {perPeriodTotals[p.id].total} / {perPeriodTotals[p.id].max}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-gray-100">
                <td className="p-2 font-semibold">Daily Total</td>
                <td className="p-2" colSpan={settings.categories.length}>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="font-semibold">{totalPoints} / {maxPoints} ({percent}%)</div>
                    <div className="text-xs text-gray-600">Goal: {settings.goalPoints} pts — {totalPoints >= settings.goalPoints ? "✅ Met" : "❌ Not Met"}</div>
                  </div>
                </td>
                <td className="p-2"></td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* Settings panel */}
        <section className="bg-white rounded-2xl shadow p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-semibold">Settings</h2>
            <div className="flex items-center gap-2">
              <label className="rounded-lg border px-3 py-1.5 cursor-pointer hover:bg-gray-50">
                Import JSON
                <input type="file" className="hidden" accept="application/json" onChange={(e) => e.target.files?.[0] && importSettingsJSON(e.target.files[0])} />
              </label>
              <button onClick={exportSettingsJSON} className="rounded-lg border px-3 py-1.5 hover:bg-gray-100">Export JSON</button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mt-4">
            <div>
              <h3 className="font-medium mb-2">Categories</h3>
              <ReorderableList
                items={settings.categories}
                setItems={(items) => setSettings((prev) => ({ ...prev, categories: items }))}
              />
            </div>
            <div>
              <h3 className="font-medium mb-2">Periods</h3>
              <ReorderableList
                items={settings.periods}
                setItems={(items) => setSettings((prev) => ({ ...prev, periods: items }))}
              />
            </div>
          </div>
        </section>

        {/* Student management */}
        <section className="bg-white rounded-2xl shadow p-4">
          <h2 className="font-semibold mb-2">Students</h2>
          <div className="space-y-2">
            {students.map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <input
                  className="rounded-lg border px-3 py-1.5"
                  value={s.name}
                  onChange={(e) => renameStudent(s.id, e.target.value)}
                />
                <button className="rounded-lg border px-3 py-1.5 hover:bg-gray-100" onClick={() => setStudentId(s.id)}>Select</button>
                <button className="rounded-lg border px-3 py-1.5 hover:bg-red-50 text-red-600" onClick={() => removeStudent(s.id)}>Remove</button>
              </div>
            ))}
          </div>
        </section>

        <footer className="text-center text-xs text-gray-500 pb-12 print:hidden">
          Built for quick, school-friendly data collection. Save/export often if using shared devices.
        </footer>
      </main>

      {/* Print styles */}
      <style>{`
        @media print {
          header, footer, .print\:hidden { display: none !important; }
          .print\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .rounded-2xl { border-radius: 0; box-shadow: none; }
          .shadow { box-shadow: none; }
          body { background: white; }
        }
      `}</style>
    </div>
  );
}

// ---- Small Components ----
function EditableText({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  useEffect(() => setVal(value), [value]);
  return (
    <div>
      {editing ? (
        <input
          autoFocus
          className="rounded-lg border px-2 py-1 w-full"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => { setEditing(false); onChange(val.trim() || value); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { setEditing(false); onChange(val.trim() || value); }
            if (e.key === "Escape") { setEditing(false); setVal(value); }
          }}
        />
      ) : (
        <button
          type="button"
          className="text-left font-medium hover:underline"
          onClick={() => setEditing(true)}
        >
          {value}
        </button>
      )}
    </div>
  );
}

function AddStudent({ onAdd }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return (
    <div className="relative">
      {!open ? (
        <button className="rounded-xl border px-3 py-1.5 hover:bg-gray-100" onClick={() => setOpen(true)}>+ Student</button>
      ) : (
        <div className="flex items-center gap-2">
          <input className="rounded-lg border px-2 py-1" placeholder="Student name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="rounded-lg border px-3 py-1.5 hover:bg-gray-100" onClick={() => { onAdd(name); setName(""); setOpen(false); }}>Add</button>
          <button className="rounded-lg border px-3 py-1.5 hover:bg-gray-100" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

function ScaleLabelsEditor({ settings, setSettings }) {
  const labels = Array.from({ length: settings.scaleMax + 1 }, (_, i) => i);
  return (
    <div className="space-y-1">
      {labels.map((n) => (
        <div key={n} className="flex items-center gap-2">
          <span className="text-xs w-5 text-gray-500">{n}</span>
          <input
            className="flex-1 rounded-lg border px-2 py-1"
            value={settings.scaleLabels?.[n] ?? ""}
            onChange={(e) => setSettings((prev) => ({
              ...prev,
              scaleLabels: { ...prev.scaleLabels, [n]: e.target.value },
            }))}
          />
        </div>
      ))}
    </div>
  );
}

function ReorderableList({ items, setItems }) {
  function move(idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    const [it] = next.splice(idx, 1);
    next.splice(j, 0, it);
    setItems(next);
  }
  function remove(idx) {
    const next = [...items];
    next.splice(idx, 1);
    setItems(next);
  }
  function rename(idx, name) {
    const next = [...items];
    next[idx] = { ...next[idx], name };
    setItems(next);
  }
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={it.id} className="flex items-center gap-2">
          <input className="flex-1 rounded-lg border px-3 py-1.5" value={it.name} onChange={(e) => rename(i, e.target.value)} />
          <div className="flex items-center gap-1">
            <button className="rounded-md border px-2 py-1 hover:bg-gray-100" onClick={() => move(i, -1)} title="Move up">↑</button>
            <button className="rounded-md border px-2 py-1 hover:bg-gray-100" onClick={() => move(i, +1)} title="Move down">↓</button>
            <button className="rounded-md border px-2 py-1 hover:bg-red-50 text-red-600" onClick={() => remove(i)} title="Remove">✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
