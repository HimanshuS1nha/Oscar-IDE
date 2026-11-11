import { create } from "zustand";

type CurrentTab = "Explorer" | "Search" | "Git";

type UseCurrentTabType = {
  currentTab: CurrentTab;
  setCurrentTab: (currentTab: CurrentTab) => void;
};

export const useCurrentTab = create<UseCurrentTabType>((set) => ({
  currentTab: "Explorer",
  setCurrentTab: (currentTab) => set({ currentTab }),
}));
