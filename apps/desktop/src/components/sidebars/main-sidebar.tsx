import { useCurrentTab } from "@/hooks/use-current-tab";
import FileExplorerSidebar from "./file-explorer-sidebar";
import GitSidebar from "./git-sidebar";
import SearchSidebar from "./search-sidebar";

const MainSidebar = () => {
  const currentTab = useCurrentTab((state) => state.currentTab);
  return (
    <div className="h-full w-full overflow-y-auto">
      {currentTab === "Explorer" ? <FileExplorerSidebar /> : null}
      {currentTab === "Search" ? <SearchSidebar /> : null}
      {currentTab === "Git" ? <GitSidebar /> : null}
    </div>
  );
};

export default MainSidebar;
