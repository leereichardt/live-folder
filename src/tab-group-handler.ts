import { type PullRequest } from "./github-handler";

export type TabGroupColor = chrome.tabGroups.ColorEnum;

export class TabGroupHandler {
  private readonly _debug: boolean;
  private _currentGroupId: number | null = null;
  private _listenerSetup = false;

  constructor({ debug }: { debug: boolean }) {
    this._debug = debug;
  }

  private async _ungroupAndPositionAfterGroup(tabId: number) {
    try {
      if (this._currentGroupId === null) return;

      // Get all tabs in the group to find the position
      const groupTabs = await chrome.tabs.query({
        groupId: this._currentGroupId,
      });

      // Find the highest index (last position in the group)
      const maxIndex = Math.max(...groupTabs.map((t) => t.index || 0));

      // Ungroup the tab
      await chrome.tabs.ungroup(tabId);

      // Move it to right after the group
      await chrome.tabs.move(tabId, { index: maxIndex + 1 });

      if (this._debug) {
        console.log(
          "[TAB-LISTENER] Ungrouped and positioned tab after group at index:",
          maxIndex + 1,
        );
      }
    } catch (error) {
      console.error(
        "[TAB-LISTENER] Error ungrouping and positioning tab:",
        error,
      );
    }
  }

  private _setupTabListener() {
    if (this._listenerSetup) return;

    // Listen for tab URL changes (when navigating within an existing tab)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      // Only process when URL changes
      if (!changeInfo.url) return;
      if (this._currentGroupId === null) return;

      // Check if this tab is in our PR group
      if (tab.groupId !== this._currentGroupId) return;

      const url = changeInfo.url;

      // Check if the new URL is a GitHub PR URL
      const isPrUrl = url.includes("github.com") && url.includes("/pull/");

      if (!isPrUrl) {
        // Tab navigated away from PR, ungroup and position it after the group
        void this._ungroupAndPositionAfterGroup(tabId);
      }
    });

    // Listen for new tabs created in the group (e.g., Cmd/Ctrl+click)
    chrome.tabs.onCreated.addListener((tab) => {
      if (this._currentGroupId === null) return;

      // Check if this new tab is in our PR group
      if (tab.groupId !== this._currentGroupId) return;

      // Give the tab a moment to load and get its URL
      setTimeout(() => {
        chrome.tabs
          .get(tab.id!)
          .then((updatedTab) => {
            const url = updatedTab.url || "";

            // Check if the URL is a GitHub PR URL
            const isPrUrl =
              url.includes("github.com") && url.includes("/pull/");

            if (!isPrUrl && url !== "about:blank") {
              // New tab is not a PR, ungroup and position it after the group
              void this._ungroupAndPositionAfterGroup(updatedTab.id!);
            }
          })
          .catch((error) => {
            // Tab might have been closed already
            if (this._debug) {
              console.log("[TAB-LISTENER] Could not get tab info:", error);
            }
          });
      }, 100); // Small delay to let the tab URL populate
    });

    this._listenerSetup = true;
    if (this._debug) console.log("[TAB-LISTENER] Tab listeners set up");
  }

  public async getTabGroup(
    groupId: number,
  ): Promise<chrome.tabGroups.TabGroup | null> {
    try {
      return await chrome.tabGroups.get(groupId);
    } catch (error) {
      if (this._debug) console.log("[GET-TAB-GROUP] Group not found:", groupId);
      return null;
    }
  }

  public async findTabGroupByTitle(
    title: string,
  ): Promise<chrome.tabGroups.TabGroup | null> {
    try {
      // Query all tab groups
      const allTabGroups = await chrome.tabGroups.query({});

      // Find the first one that matches the title
      const matchingGroup = allTabGroups.find((group) => group.title === title);

      if (matchingGroup) {
        if (this._debug)
          console.log(
            "[FIND-TAB-GROUP] Found existing group:",
            matchingGroup.id,
          );
        return matchingGroup;
      }

      if (this._debug)
        console.log("[FIND-TAB-GROUP] No group found with title:", title);
      return null;
    } catch (error) {
      console.error("[FIND-TAB-GROUP] Error searching for tab group:", error);
      return null;
    }
  }

  public async ensureTabGroup({
    title,
    color,
    groupId,
  }: {
    title: string;
    color: TabGroupColor;
    groupId?: number;
  }): Promise<number> {
    try {
      // Set up the tab listener if not already done
      this._setupTabListener();

      // First, try to find an existing group by title
      const existingByTitle = await this.findTabGroupByTitle(title);
      if (existingByTitle) {
        // Update color if changed
        if (existingByTitle.color !== color) {
          await chrome.tabGroups.update(existingByTitle.id, { color });
        }
        this._currentGroupId = existingByTitle.id;
        if (this._debug)
          console.log(
            "[ENSURE-TAB-GROUP] Using existing group by title:",
            existingByTitle.id,
          );
        return existingByTitle.id;
      }

      // Check if stored groupId is still valid
      if (groupId !== undefined && groupId !== -1) {
        const existingGroup = await this.getTabGroup(groupId);
        if (existingGroup) {
          // Update title and color if changed
          if (existingGroup.title !== title || existingGroup.color !== color) {
            await chrome.tabGroups.update(groupId, { title, color });
          }
          this._currentGroupId = groupId;
          return groupId;
        }
      }

      // Create new group with a placeholder tab
      // We'll keep this tab until we have real PR tabs
      const currentWindow = await chrome.windows.getCurrent();
      const tab = await chrome.tabs.create({
        windowId: currentWindow.id,
        active: false,
        url: "about:blank",
      });

      if (!tab.id) {
        throw new Error("Failed to create tab");
      }

      const newGroupId = await chrome.tabs.group({
        tabIds: [tab.id],
      });

      await chrome.tabGroups.update(newGroupId, {
        title,
        color,
        collapsed: true,
      });

      this._currentGroupId = newGroupId;
      if (this._debug)
        console.log("[ENSURE-TAB-GROUP] Created group:", newGroupId);
      return newGroupId;
    } catch (error) {
      console.error("[ENSURE-TAB-GROUP] Error ensuring tab group:", error);
      throw error;
    }
  }

  public async positionGroupAfterPinnedTabs(groupId: number) {
    try {
      const currentWindow = await chrome.windows.getCurrent();

      // Get all pinned tabs to find the position
      const pinnedTabs = await chrome.tabs.query({
        windowId: currentWindow.id,
        pinned: true,
      });

      const targetPosition = pinnedTabs.length;

      // Get all tabs in our group
      const groupTabs = await chrome.tabs.query({ groupId });

      if (groupTabs.length === 0) return;

      // Sort tabs by their current index to maintain order within the group
      groupTabs.sort((a, b) => (a.index || 0) - (b.index || 0));

      // Move all group tabs to start at the target position
      const tabIds = groupTabs
        .map((tab) => tab.id)
        .filter((id): id is number => id !== undefined);

      if (tabIds.length > 0) {
        await chrome.tabs.move(tabIds, { index: targetPosition });

        if (this._debug) {
          console.log(
            "[POSITION-GROUP] Moved group to position",
            targetPosition,
            "after",
            pinnedTabs.length,
            "pinned tabs",
          );
        }
      }
    } catch (error) {
      console.error("[POSITION-GROUP] Error positioning tab group:", error);
    }
  }

  public async syncTabs({
    groupId,
    pullRequests,
  }: {
    groupId: number;
    pullRequests: Array<PullRequest>;
    prNameFormat: string;
    formatPrName: (args: { pr: PullRequest; format: string }) => string;
  }) {
    try {
      if (this._debug) {
        console.log(
          "[SYNC-TABS] Syncing",
          pullRequests.length,
          "pull requests",
        );
      }

      // Get all tabs in the group
      const tabs = await chrome.tabs.query({ groupId });
      const existingUrls = new Map(tabs.map((tab) => [tab.url, tab]));
      const processedUrls = new Set<string>();

      // Add or update tabs for each PR
      for (const pr of pullRequests) {
        if (existingUrls.has(pr.url)) {
          // Tab already exists, just mark as processed
          processedUrls.add(pr.url);
        } else {
          // Create new tab
          const currentWindow = await chrome.windows.getCurrent();
          const newTab = await chrome.tabs.create({
            windowId: currentWindow.id,
            url: pr.url,
            active: false,
          });

          if (newTab.id) {
            await chrome.tabs.group({
              tabIds: [newTab.id],
              groupId,
            });
          }

          processedUrls.add(pr.url);
        }
      }

      // Remove tabs that no longer have PRs
      const tabsToRemove = tabs.filter((tab) => {
        // Remove if it's not in our current PR list (but not placeholder tabs yet)
        return (
          tab.url && tab.url !== "about:blank" && !processedUrls.has(tab.url)
        );
      });

      for (const tab of tabsToRemove) {
        if (tab.id) {
          await chrome.tabs.remove(tab.id);
        }
      }

      // Remove placeholder about:blank tabs only if we have real PR tabs
      if (pullRequests.length > 0) {
        const placeholderTabs = tabs.filter((tab) => tab.url === "about:blank");
        for (const tab of placeholderTabs) {
          if (tab.id) {
            await chrome.tabs.remove(tab.id);
          }
        }
      }

      // Position the group after pinned tabs
      await this.positionGroupAfterPinnedTabs(groupId);

      // Auto-collapse if empty, expand if has tabs
      const remainingTabs = await chrome.tabs.query({ groupId });
      if (
        remainingTabs.length === 0 ||
        (remainingTabs.length === 1 && remainingTabs[0].url === "about:blank")
      ) {
        await chrome.tabGroups.update(groupId, { collapsed: true });
      } else {
        await chrome.tabGroups.update(groupId, { collapsed: false });
      }

      if (this._debug) {
        console.log(
          "[SYNC-TABS] Added/updated:",
          pullRequests.length,
          "Removed:",
          tabsToRemove.length,
        );
      }
    } catch (error) {
      console.error("[SYNC-TABS] Error syncing tabs:", error);
    }
  }
}
