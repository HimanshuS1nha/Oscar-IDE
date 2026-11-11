import { cn } from "@/lib/utils";

import OpenedFilesTabs from "@/components/editor/opened-files-tabs";

import { useCurrentTab } from "@/hooks/use-current-tab";

import { tabItems } from "@/constants/tab-items";

const MainTabs = () => {
  const { currentTab, setCurrentTab } = useCurrentTab();
  return (
    <div className="flex h-9 shrink-0 border-b text-sm">
      {/* Sidebar tabs: 3 × w-20 matches the sidebar's default 240px below.
          The last tab's border is the edge, so the row adds none of its own. */}
      <div className="flex shrink-0">
        {tabItems.map((item) => {
          return (
            <div
              key={item}
              className={cn(
                "flex h-full w-20 items-center border-r px-3",
                // Theme tokens, so the active tab reads in light and dark.
                item === currentTab
                  ? "-mb-px border-b border-b-primary bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <button onClick={() => setCurrentTab(item)}>{item}</button>
            </div>
          );
        })}
      </div>

      {/* Opened files sit over the editor, in the same row. */}
      <div className="flex min-w-0 flex-1">
        <OpenedFilesTabs />
      </div>
    </div>
  );
};

export default MainTabs;
