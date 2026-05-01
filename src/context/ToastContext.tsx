// Deprecated location — Toast lives at src/components/Toast.tsx.
// This file is a thin re-export shim to avoid import breakage in case
// anything was wired here during development. Safe to delete once
// every importer is verified to use the components/Toast path.
export { ToastProvider, useToast } from '../components/Toast'
