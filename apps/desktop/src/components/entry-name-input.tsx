import { ChevronRightIcon } from "lucide-react";
import { FileIcon, FolderIcon } from "@react-symbols/icons/utils";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { ipcErrorMessage } from "@/lib/ipc-error";
import { cn } from "@/lib/utils";
import type { DirectoryEntry } from "@/types";

/** The part of a file name before its extension (`index.test.ts` → `index.test`). */
const stemLength = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? dot : name.length;
};

/**
 * The inline name input VS Code shows in the tree, for creating and renaming.
 * - Enter submits, Escape cancels.
 * - Clicking away submits a valid, changed name and discards anything else.
 * - Errors from `validate` show as you type; errors thrown by `onSubmit` show
 *   after submitting, and the input stays open to fix them.
 */
export const EntryNameInput = ({
  id,
  type,
  initialName = "",
  isExpanded = false,
  paddingLeft,
  ariaLabel,
  validate,
  onSubmit,
  onCancel,
}: {
  /** Unique per input, for linking the error message. */
  id: string;
  type: DirectoryEntry["type"];
  initialName?: string;
  /** For folders: whether the chevron points down. */
  isExpanded?: boolean;
  paddingLeft: number;
  ariaLabel: string;
  /** A message if `name` (non-empty and changed) can't be used, else null. */
  validate: (name: string) => string | null;
  /** Does the work; the caller hides the input once it succeeds. */
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Read synchronously in `onBlur`, which can fire before a re-render.
  const isSubmittingRef = useRef(false);

  const isFolder = type === "directory";
  const isUnchanged = name.trim().length === 0 || name === initialName;
  const validationError = isUnchanged ? null : validate(name);
  const error = validationError ?? submitError;
  const errorId = `entry-name-error-${id}`;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // Renaming a file selects its name but not its extension, as in VS Code.
    if (initialName) {
      input.setSelectionRange(0, isFolder ? initialName.length : stemLength(initialName));
    }
    input.scrollIntoView({ block: "nearest" });
    // Only on mount: the input remounts for each new request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (isSubmittingRef.current) return;
    if (isUnchanged) return onCancel();
    if (validationError) return;

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onSubmit(name);
    } catch (caught) {
      setSubmitError(ipcErrorMessage(caught));
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      inputRef.current?.focus();
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Keep tree shortcuts (F2, Delete) from acting on the row underneath.
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };

  const onBlur = () => {
    if (isSubmittingRef.current) return;
    if (isUnchanged || error) onCancel();
    else void submit();
  };

  return (
    <div className="relative">
      <div
        className="flex h-6 w-full items-center gap-1.5 pr-1 text-[13px]"
        style={{ paddingLeft }}
      >
        {isFolder ? (
          <ChevronRightIcon
            className={cn(
              "size-4 shrink-0 text-muted-foreground",
              isExpanded && "rotate-90",
            )}
          />
        ) : (
          <span className="size-4 shrink-0" />
        )}
        {isFolder ? (
          <FolderIcon folderName={name} className="size-4 shrink-0" />
        ) : (
          <FileIcon fileName={name} autoAssign className="size-4 shrink-0" />
        )}
        <input
          ref={inputRef}
          value={name}
          readOnly={isSubmitting}
          spellCheck={false}
          autoComplete="off"
          aria-label={ariaLabel}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "h-5 min-w-0 flex-1 rounded-sm border border-ring bg-background px-1 text-[13px] outline-none",
            error && "border-destructive",
          )}
          onChange={(event) => {
            setName(event.target.value);
            setSubmitError(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        />
      </div>

      {error && (
        <p
          id={errorId}
          role="alert"
          className="absolute top-full right-1 z-20 rounded-b-sm border border-t-0 border-destructive bg-background px-1.5 py-1 text-xs break-words text-destructive shadow-md"
          style={{ left: paddingLeft + 44 }}
        >
          {error}
        </p>
      )}
    </div>
  );
};
