/** Ambient declarations for the browser client bundle. */

declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

interface Window {
  /** Boot manifest written by the host page for bundle-layer plugins. */
  __DSH_BOOT__?: {
    entries?: Array<{ id: string }>
  }
  /**
   * The host shell's own lifecycle, published by a shell that runs the host as
   * a child process (a Tauri or Electron app that spawned `dsh web`). Optional:
   * absent on every host that is not wrapped in one.
   *
   * A shell restart is not the same operation as the market's own: the shell
   * stops the process it started and relaunches its own window, so a detached
   * helper spawned by the host would be a second, competing lifecycle. When
   * the shell is there, the restart is asked for through it instead.
   */
  __dshHostShell?: {
    /**
     * Restart the host the way the shell's own menu item does. Returns
     * nothing on purpose: the window it answers on is about to go away, so
     * there is no state a caller could usefully read back.
     */
    restart?: () => void
  }
}
