import { useState, type FormEvent } from "react";
import { ArrowLeft, AudioLines, Check, ChevronDown, CircleAlert, CircleCheck, Download, FileText, HardDrive, LockKeyhole, Mic, MoreHorizontal, Pencil, Printer, Ruler, Share2, ShieldCheck, Trash2, Wifi, Pause, Square } from "lucide-react";
import "./_group.css";
import "./MobileFirst.css";

const sections = ["exterior walls", "basement exterior", "party walls", "band joists", "attic", "batt ceilings", "slopes", "garage ceiling", "sill", "caulk", "foam"];

type Entry = { id: number; quantity?: string; section: string; material: string; transcript: string; incomplete?: boolean };

export function MobileFirst() {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [complete, setComplete] = useState(false);
  const [toast, setToast] = useState("");
  const [manualText, setManualText] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [entries, setEntries] = useState<Entry[]>([
    { id: 1, quantity: "320", section: "Exterior walls", material: "R-19", transcript: "2 by 4, 16 inch centers, 8 foot, 12 bays" },
    { id: 2, section: "Exterior walls", material: "R-19", transcript: "Section and material saved. Add dimensions to calculate.", incomplete: true },
  ]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  }

  function startRecording() {
    setRecording(true);
    setPaused(false);
    notify("On-device dictation is ready on this iPhone.");
  }

  function finishRecording() {
    setRecording(false);
    setPaused(false);
    notify("Dictation stopped. Confirmed measurements stay with this job.");
  }

  function saveManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualText.trim()) return;
    if (editingId !== null) {
      setEntries(current => current.map(entry => entry.id === editingId
        ? { ...entry, quantity: undefined, transcript: manualText.trim(), incomplete: true }
        : entry));
      setEditingId(null);
      setManualText("");
      notify("Correction saved. Check dimensions to recalculate.");
      return;
    }
    setEntries(current => [...current, {
      id: Date.now(),
      section: "Exterior walls",
      material: "R-19",
      transcript: manualText.trim(),
      incomplete: true,
    }]);
    setManualText("");
    notify("Entry saved for measurement review.");
  }

  function exportCsv() {
    const rows = [["Section", "Material", "Measurement", "Transcript"], ...entries.map(entry => [entry.section, entry.material, entry.quantity ? `${entry.quantity} sq ft` : "Needs dimensions", entry.transcript])];
    const csv = rows.map(row => row.map(value => `"${value.replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "linden-ct-takeoff.csv";
    link.click();
    URL.revokeObjectURL(link.href);
    notify("CSV exported.");
  }

  async function shareJob() {
    if (!email.trim()) {
      notify("Enter a team member email to share this job.");
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: "Linden Ct takeoff", text: `Insulation takeoff for Linden Ct — share with ${email}` });
        return;
      } catch { /* Keep the job screen in place if the native share sheet is dismissed. */ }
    }
    notify("Sharing is available when connected to the team workspace.");
  }

  return (
    <div className="mobile-first">
      <header className="mf-topbar">
        <div className="mf-brand">
          <img className="mf-logo" src="/__mockup/images/fulcher-logo.png" alt="Fulcher number one" />
          <span className="mf-brand-copy">Insulation Takeoff<b>Field takeoff</b></span>
        </div>
        <button className="mf-icon-button" aria-label="More job options" onClick={() => document.getElementById("mf-job-actions")?.scrollIntoView({ behavior: "smooth", block: "center" })}><MoreHorizontal size={21} /></button>
      </header>

      <main className="mf-main">
        <button className="mf-back" onClick={() => notify("Linden Ct is your selected job.")}><ArrowLeft size={15} /> Jobs</button>
        <div className="mf-job-heading">
          <div>
            <p className="mf-eyebrow">NV HOMES <span>·</span> LOT 28</p>
            <h1>Linden Ct</h1>
            <p className="mf-location">Exterior walls <span className="mf-dot" /> {complete ? "Job completed" : "Job in progress"}</p>
          </div>
          <div className="mf-job-status"><span />{complete ? "Completed" : "In progress"}</div>
        </div>

        <section className={`mf-voice mf-panel${recording ? " mf-recording" : ""}`}>
          <div className="mf-section-head">
            <div>
              <p className="mf-eyebrow">ON-DEVICE DICTATION</p>
              <h2>Voice takeoff</h2>
            </div>
            <span className="mf-private"><LockKeyhole size={12} /> Private</span>
          </div>

          <div className="mf-hero-control">
            <button className="mf-start" aria-label={recording ? "Listening on this iPhone" : "Start voice takeoff"} onClick={recording ? () => setPaused(value => !value) : startRecording}>
              <Mic size={38} strokeWidth={2.5} />
              <span className="mf-wave" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /></span>
              <strong>LET’S<span>TAKEOFF!</span></strong>
              <span className="mf-red-swoosh" />
            </button>
            <p className="mf-ready-line"><ShieldCheck size={13} /> {recording ? paused ? "Paused · audio stays on this iPhone" : "Listening · audio stays on this iPhone" : "Tap once to dictate · processed on this iPhone"}</p>
            {recording && <div className="mf-record-controls">
              <button className="mf-control" onClick={() => setPaused(value => !value)}><Pause size={13} />{paused ? "Resume" : "Pause"}</button>
              <button className="mf-control mf-control-danger" onClick={finishRecording}><Square size={12} /> Stop</button>
            </div>}
          </div>

          <div className="mf-model-note">
            <HardDrive size={14} />
            <span><b>On-device speech recognition</b><small>First use downloads about 626 MB over the internet. Once cached, dictation works offline.</small></span>
          </div>

          <div className={`mf-transcript${recording ? " is-recording" : ""}`}>
            <div className="mf-transcript-title"><AudioLines size={14} /><b>Live transcript</b><span className="mf-live-dot" /></div>
            <p className="mf-live-words">{recording ? paused ? "Dictation paused" : "Listening for measurements…" : "24 by 8"}</p>
            <div className="mf-transcript-divider" />
            <span className="mf-confirmed-label">CONFIRMED THIS SESSION</span>
            <p className="mf-confirmed-words">Exterior walls. R-19. 24 by 8.</p>
          </div>
          <p className="mf-footnote"><Wifi size={12} /> Audio stays on this iPhone. Saving to a shared job needs a connection.</p>
        </section>

        <section className="mf-section-card mf-panel">
          <div className="mf-section-head mf-section-head-tight">
            <div>
              <p className="mf-eyebrow">TAKING OFF</p>
              <h2>Exterior walls</h2>
            </div>
            <span className="mf-material">R-19</span>
          </div>
          <div className="mf-section-summary">
            <label htmlFor="mf-section">Current section</label>
            <div className="mf-select-wrap">
              <select id="mf-section" defaultValue="exterior walls">
                {sections.map(section => <option key={section} value={section}>{section}</option>)}
              </select>
              <ChevronDown size={15} />
            </div>
          </div>

          <div className="mf-measure-heading">
            <div><h2>Measurements</h2><span>{entries.length} {entries.length === 1 ? "entry" : "entries"}</span></div>
            <button className="mf-add-entry" onClick={() => { document.getElementById("mf-manual-panel")?.setAttribute("open", ""); document.getElementById("mf-manual")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}><span>+</span> Add</button>
          </div>

          {entries.map(entry => <article className={`mf-entry${entry.incomplete ? " mf-entry-review" : " mf-entry-complete"}`} key={entry.id}>
            <div className="mf-entry-top">
              <span className={entry.incomplete ? "mf-review-label" : "mf-entry-kind"}>{entry.incomplete ? <><CircleAlert size={14} /> NEEDS MEASUREMENTS</> : <><CircleCheck size={14} /> CALCULATED</>}</span>
              <button className="mf-entry-menu" aria-label={`Options for ${entry.section} measurement`} onClick={() => notify("Use Edit or Delete to manage this measurement.")}><MoreHorizontal size={18} /></button>
            </div>
            {entry.quantity
              ? <div className="mf-quantity-line"><strong>{entry.quantity}</strong><span>sq ft</span></div>
              : <div className="mf-review-title">{entry.section} <span>·</span> {entry.material}</div>}
            <p className="mf-entry-transcript">{entry.transcript}</p>
            <div className="mf-entry-meta"><span>{entry.section}</span><span className="mf-meta-dot">·</span><span>{entry.material}</span></div>
            {entry.incomplete
              ? <button className="mf-review-edit" onClick={() => { document.getElementById("mf-manual-panel")?.setAttribute("open", ""); document.getElementById("mf-manual")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}><Pencil size={13} /> Add measurements</button>
              : <div className="mf-entry-actions">
                <button onClick={() => { setEditingId(entry.id); setManualText(entry.transcript); document.getElementById("mf-manual-panel")?.setAttribute("open", ""); document.getElementById("mf-manual")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}><Pencil size={13} /> Edit / correct</button>
                <button className="mf-delete" onClick={() => { if (window.confirm("Delete this measurement?")) setEntries(current => current.filter(item => item.id !== entry.id)); }}><Trash2 size={13} /> Delete</button>
              </div>}
          </article>)}
          <p className="mf-complete-note"><Check size={13} /> Clear measurements calculate automatically. Only unfinished or conflicting entries need review.</p>
        </section>

        <details id="mf-manual-panel" className="mf-panel mf-manual mf-collapsible">
          <summary className="mf-section-head mf-collapsible-summary">
            <div><p className="mf-eyebrow">TYPE INSTEAD</p><h2>Manual entry</h2></div>
            <Ruler size={17} className="mf-heading-icon" />
          </summary>
          <form className="mf-collapsible-content" onSubmit={saveManual}>
            <label htmlFor="mf-manual">Spoken text or measurement note</label>
            <textarea id="mf-manual" rows={3} value={manualText} onChange={event => setManualText(event.target.value)} placeholder="Example: exterior walls, 2 by 4, 16 inch centers, 8 foot, 12 bays" />
            <button className="mf-save" type="submit"><Check size={15} /> {editingId === null ? "Save entry" : "Save correction"}</button>
          </form>
        </details>

        <details className="mf-panel mf-share mf-collapsible">
          <summary className="mf-section-head mf-collapsible-summary">
            <div><p className="mf-eyebrow">TEAM ACCESS</p><h2>Share this job</h2></div>
            <Share2 size={17} className="mf-heading-icon" />
          </summary>
          <div className="mf-collapsible-content">
            <p className="mf-share-intro">Give another registered team account access.</p>
            <label htmlFor="mf-email">Team member email</label>
            <input id="mf-email" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="greg@example.com" />
            <label htmlFor="mf-permission">Permission</label>
            <div className="mf-select-wrap">
              <select id="mf-permission" defaultValue="editor"><option value="editor">Can edit</option><option value="viewer">View only</option></select>
              <ChevronDown size={15} />
            </div>
            <button className="mf-share-button" onClick={shareJob}>Share job</button>
          </div>
        </details>

        <details id="mf-job-actions" className="mf-panel mf-job-actions mf-collapsible">
          <summary className="mf-section-head mf-collapsible-summary">
            <div><p className="mf-eyebrow">WHEN YOU’RE DONE</p><h2>Job actions</h2></div>
          </summary>
          <div className="mf-collapsible-content">
            <div className="mf-export-row">
              <button onClick={exportCsv}><Download size={14} /> Export CSV</button>
              <button onClick={() => window.print()}><Printer size={14} /> Print / Save PDF</button>
            </div>
            <button className="mf-complete-button" onClick={() => { setComplete(value => !value); notify(complete ? "Job marked in progress." : "Job marked completed."); }}><CircleCheck size={16} /> {complete ? "Reopen job" : "Mark completed"}</button>
          </div>
        </details>

        <footer className="mf-footer">
          <span><FileText size={12} /> Linden Ct · Lot 28</span>
          <span>Takeoff saved to job</span>
        </footer>
      </main>
      {toast && <div className="mf-toast" role="status">{toast}</div>}
      <div className="mf-safe-area" />
    </div>
  );
}
