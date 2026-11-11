/** A tab to reopen. Only file tabs are kept, not Git diffs. */
export type SessionTab = {
  path: string;
  isPermanent: boolean;
};

export type SessionTabs = {
  tabs: SessionTab[];
  /** The focused tab's path, if it is one of `tabs`. */
  focusedPath: string | null;
};

/** The folder reopened on launch, already opened as the window's workspace. */
export type RestoredSession = SessionTabs & { folder: string };
