import {
  FolderOpenIcon,
  LoaderCircleIcon,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { useSelectedFolder } from "@/hooks/use-selected-folder";

/** Shown by sidebars that need an opened folder, with a button to open one. */
const NoFolderState = ({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) => {
  const openFolder = useSelectedFolder((state) => state.openFolder);
  const isOpeningFolder = useSelectedFolder((state) => state.isOpeningFolder);

  return (
    <div className="flex flex-col items-center gap-4 px-5 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl border bg-muted/60 text-muted-foreground">
        <Icon className="size-6" strokeWidth={1.5} />
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      <Button
        className="w-full"
        onClick={openFolder}
        disabled={isOpeningFolder}
      >
        {isOpeningFolder ? (
          <LoaderCircleIcon className="animate-spin" />
        ) : (
          <FolderOpenIcon />
        )}
        {isOpeningFolder ? "Opening…" : "Open Folder"}
      </Button>
    </div>
  );
};

export default NoFolderState;
