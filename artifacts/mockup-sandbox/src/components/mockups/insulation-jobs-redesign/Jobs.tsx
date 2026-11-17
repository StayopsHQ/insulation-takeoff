import { useEffect, useRef, useState, type FormEvent } from "react";
import "./Jobs.css";

const previewJob = {
  name: "Test",
  address: "NV · Linden Ct · 28",
  updated: "Updated 11/16/2026, 11:48 PM",
  status: "In Progress",
};

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg className="jobs-chevron" width="28" height="28" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m7.5 4.5 5.5 5.5-5.5 5.5" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="7.5" r="4" fill="currentColor" />
      <path d="M4.5 20.25c.35-4 3.3-6.25 7.5-6.25s7.15 2.25 7.5 6.25" fill="currentColor" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M19 10.1c0 5.05-7 11.15-7 11.15S5 15.15 5 10.1a7 7 0 1 1 14 0Z" fill="currentColor" />
      <circle cx="12" cy="10" r="2.35" fill="#fff" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="15" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <path d="M7.5 3v5M16.5 3v5M4 10h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 13h2m3 0h2m3 0h1M7 16.5h2m3 0h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 3.5v11M3.5 9h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M7 3.25H4.75A1.75 1.75 0 0 0 3 5v8a1.75 1.75 0 0 0 1.75 1.75H7M10.5 5.5 14 9l-3.5 3.5M14 9H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="m4 4 10 10M14 4 4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Jobs() {
  const [openMenu, setOpenMenu] = useState<"nav" | "account" | null>(null);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [toast, setToast] = useState("");
  const navRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = (message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 3600);
  };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!navRef.current?.contains(target) && !accountRef.current?.contains(target)) {
        setOpenMenu(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNewJobOpen(false);
        setOpenMenu(null);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const openNewJob = () => {
    setOpenMenu(null);
    setNewJobOpen(true);
  };

  const submitNewJob = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNewJobOpen(false);
    notify("New job is ready to create in your connected workspace.");
  };

  return (
    <div className="jobs-redesign">
      <header className="jobs-header">
        <div className="jobs-header-left">
          <div className="jobs-account" ref={navRef}>
            <button
              className="jobs-icon-button"
              type="button"
              aria-label="Open navigation menu"
              aria-expanded={openMenu === "nav"}
              onClick={() => setOpenMenu(openMenu === "nav" ? null : "nav")}
            >
              <MenuIcon />
            </button>
            {openMenu === "nav" && (
              <div className="jobs-dropdown jobs-dropdown--nav" role="menu">
                <button type="button" role="menuitem" onClick={() => setOpenMenu(null)}>
                  <span aria-hidden="true">▤</span> Jobs
                </button>
                <button type="button" role="menuitem" onClick={openNewJob}>
                  <PlusIcon /> New Job
                </button>
              </div>
            )}
          </div>

          <div className="jobs-brand">
            <img className="jobs-brand-logo" src="/__mockup/images/fulcher-logo.png" alt="Fulcher #1" />
            <span className="jobs-brand-copy">
              <strong>INSULATION TAKEOFF</strong>
              <small>JOB CALCULATOR</small>
            </span>
          </div>
        </div>

        <div className="jobs-account" ref={accountRef}>
          <button
            className="jobs-account-trigger"
            type="button"
            aria-haspopup="menu"
            aria-expanded={openMenu === "account"}
            onClick={() => setOpenMenu(openMenu === "account" ? null : "account")}
          >
            <span className="jobs-profile-icon"><PersonIcon /></span>
            <span>Greg</span>
            <ChevronDown />
          </button>
          {openMenu === "account" && (
            <div className="jobs-dropdown jobs-dropdown--account" role="menu">
              <button
                className="jobs-dropdown-danger"
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpenMenu(null);
                  notify("Sign out is available in the connected Insulation Takeoff app.");
                }}
              >
                <SignOutIcon /> Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="jobs-main">
        <section className="jobs-heading" aria-labelledby="jobs-heading">
          <div className="jobs-heading-copy">
            <h1 id="jobs-heading">Your Jobs</h1>
            <p className="jobs-description">Jobs are shared between authorized team accounts.</p>
          </div>
          <button className="jobs-new-button" type="button" onClick={openNewJob}>
            <PlusIcon />
            <span>New Job</span>
          </button>
        </section>

        <section className="jobs-list" aria-label="Saved jobs">
          <button
            className="jobs-card"
            type="button"
            onClick={() => notify(`“${previewJob.name}” selected. Open the saved takeoff in the connected app.`)}
            aria-label={`Open ${previewJob.name}, ${previewJob.status}`}
          >
            <span className="jobs-card-main">
              <strong className="jobs-card-title">{previewJob.name}</strong>
              <span className="jobs-card-address">
                <LocationIcon />
                <span>{previewJob.address}</span>
              </span>
              <span className="jobs-card-meta">
                <CalendarIcon />
                <span>{previewJob.updated}</span>
              </span>
            </span>
            <span className="jobs-status">{previewJob.status}</span>
            <ChevronRight />
          </button>
        </section>
      </main>

      {newJobOpen && (
        <div
          className="jobs-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setNewJobOpen(false);
          }}
        >
          <section
            className="jobs-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-job-title"
          >
            <div className="jobs-dialog-header">
              <div>
                <p className="jobs-dialog-kicker">Start a takeoff</p>
                <h2 id="new-job-title">New Job</h2>
              </div>
              <button
                className="jobs-dialog-close"
                type="button"
                aria-label="Close new job form"
                onClick={() => setNewJobOpen(false)}
              >
                <CloseIcon />
              </button>
            </div>
            <form onSubmit={submitNewJob}>
              <div className="jobs-form-grid">
                <div className="jobs-field jobs-field--wide">
                  <label htmlFor="job-name">Job / customer name</label>
                  <input id="job-name" name="name" placeholder="e.g. Oak Ridge Lot 24" required />
                </div>
                <div className="jobs-field">
                  <label htmlFor="job-builder">Builder</label>
                  <input id="job-builder" name="builder" placeholder="Builder name" />
                </div>
                <div className="jobs-field">
                  <label htmlFor="job-subdivision">Subdivision</label>
                  <input id="job-subdivision" name="subdivision" placeholder="Subdivision" />
                </div>
                <div className="jobs-field">
                  <label htmlFor="job-lot">Lot number</label>
                  <input id="job-lot" name="lot" placeholder="Lot" />
                </div>
                <div className="jobs-field">
                  <label htmlFor="job-address">Street / address</label>
                  <input id="job-address" name="address" placeholder="Street address" />
                </div>
              </div>
              <p className="jobs-dialog-note">This preview does not save data. Create a job in the connected app to start a shared takeoff.</p>
              <div className="jobs-dialog-actions">
                <button className="jobs-secondary-button" type="button" onClick={() => setNewJobOpen(false)}>Cancel</button>
                <button className="jobs-new-button" type="submit">Create Job</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {toast && <div className="jobs-toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  );
}
