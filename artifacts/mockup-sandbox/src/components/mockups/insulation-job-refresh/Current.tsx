import "./_group.css";

export function Current() {
  return (
    <div className="insulation-current min-h-screen">
      <header className="topbar">
        <div>
          <strong>INSULATION TAKEOFF</strong>
          <small>Voice-first job calculator</small>
        </div>
        <button>Sign out</button>
      </header>

      <main>
        <button>← Jobs</button>
        <div className="page-heading">
          <div>
            <h1>Linden Ct</h1>
            <p>NV Homes · Lot 28 · Exterior walls</p>
          </div>
          <span className="status">In progress</span>
        </div>

        <section className="card">
          <h2>Voice takeoff</h2>
          <p>Continuous voice recognition runs locally on the iPhone with the selected WhisperKit model. Audio is not uploaded.</p>
          <div className="record-state">Not listening</div>
          <div className="controls">
            <button className="primary">● Start on-device</button>
            <button>Ⅱ Pause</button>
            <button>▶ Resume</button>
            <button className="danger">Stop</button>
          </div>
          <p className="hint">The first start downloads and prepares the large model; allow time and storage for about 626 MB.</p>
          <p className="hint">The first download needs internet. After it is cached, transcription runs offline; saving measurements to shared jobs still needs a connection.</p>
          <div className="voice-transcript">
            <strong>Live transcript</strong>
            <p>24 by 8</p>
            <strong>Confirmed session transcript</strong>
            <p>Exterior walls. R-19. 24 by 8.</p>
          </div>
          <p className="hint">Keep the iPhone app in the foreground while dictating. In a browser, use the Apple keyboard microphone in the manual-entry field.</p>
        </section>

        <section className="card">
          <h2>Current section</h2>
          <div className="record-state">Exterior walls · R-19</div>
          <label>
            Set section manually
            <select defaultValue="exterior walls">
              <option value="exterior walls">exterior walls</option>
            </select>
          </label>
          <h2>Measurements &amp; review</h2>
          <article className="entry">
            <div className="entry-head">
              <strong>Unassigned · R-19</strong>
              <span className="pill review">needs_review</span>
            </div>
            <p>Exterior walls. R-19.</p>
            <small>Section and material saved. Waiting for measurements, or review the entry.</small>
            <div className="entry-actions"><button>Edit / correct</button><button>Delete</button></div>
          </article>
          <article className="entry">
            <div className="entry-head">
              <strong>Exterior walls · R-19</strong>
              <span className="pill good">calculated</span>
            </div>
            <p>Exterior walls, 2 by 4, 16 inch centers, 8 foot, 12 bays.</p>
            <p className="quantity">320 sq ft</p>
            <small>320 sq ft calculated for exterior walls.</small>
            <div className="entry-actions"><button>Edit / correct</button><button>Delete</button></div>
          </article>
        </section>

        <section className="card">
          <h2>Manual entry / correction</h2>
          <label>
            Spoken text or measurement note
            <textarea rows={3} placeholder="Example: exterior walls, 2 by 4, 16 inch centers, 8 foot, 12 bays" />
          </label>
          <button className="primary">Save entry</button>
        </section>

        <section className="card">
          <h2>Share this job</h2>
          <p>Give another registered team account access to this job.</p>
          <label>Team member email<input placeholder="greg@example.com" /></label>
          <label>Permission<select><option>Can edit</option><option>View only</option></select></label>
          <button>Share job</button>
        </section>

        <section className="card">
          <h2>Job actions</h2>
          <div className="action-row">
            <button>Export CSV</button>
            <button>Print / Save PDF</button>
            <button className="primary">Mark completed</button>
          </div>
        </section>
      </main>
    </div>
  );
}
