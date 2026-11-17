---
name: Native build readiness
description: Why the native speech dependency is pinned and what Linux sync can establish.
---

Keep the native speech SDK on an explicitly audited release until its replacement
has passed an Xcode build and device checks. Do not loosen the version range
merely because web tests and Capacitor sync pass.

**Why:** Source inspection found a Swift initializer argument-order error that
the JavaScript tests and Linux sync could not detect. Linux sync copies assets
and generates configuration; it does not compile Swift or resolve the complete
Apple build.

**How to apply:** Compare Swift APIs against the selected SDK release, then
compile with a Mac image satisfying the installed Capacitor major version's
Xcode requirements. Keep compilation, signing, offline relaunch, and real-phone
transcription as separate verification claims.
