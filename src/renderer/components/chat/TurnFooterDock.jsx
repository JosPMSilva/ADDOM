/**
 * @deprecated Prefer `TurnShell`. Kept as a compatibility re-export after the
 * turn chrome moved from a footer-only dock (execution + files under the answer)
 * to a three-slot shell (execution → answer → files). Callers that imported
 * TurnFooterDock and passed children will now get TurnShell behavior.
 */
export { default } from './TurnShell.jsx'
