import { GithubHandler, type PullRequest } from "./github-handler";
import { ConfigHandler } from "./config-handler";
import { TabGroupHandler } from "./tab-group-handler";

export class LiveFolder {
  private static _instance: LiveFolder;
  private _initialized = false;
  private readonly _debug: boolean;
  private _alarmListenerSetup = false;
  private _isSyncing = false;

  private readonly _githubHandler: GithubHandler;
  private readonly _configHandler: ConfigHandler;
  private readonly _tabGroupHandler: TabGroupHandler;

  private readonly _alarms = {
    UPDATE_PRS: "update-pull-requests",
  } as const;

  private constructor() {
    this._debug = true;
    this._githubHandler = new GithubHandler({
      debug: this._debug,
    });
    this._configHandler = new ConfigHandler(this, this._githubHandler);
    this._tabGroupHandler = new TabGroupHandler({
      debug: this._debug,
    });
  }

  static getInstance() {
    return (this._instance ??= new LiveFolder());
  }

  public async init() {
    if (this._initialized) return;

    try {
      await this._configHandler.ensureSettings();

      if (this._githubHandler.authenticated) {
        if (this._configHandler.supportsTabGroups()) {
          // Chrome: Tab groups
          const settings = await this._configHandler.getSettings();
          const groupId = await this._tabGroupHandler.ensureTabGroup({
            title: settings.name,
            color: settings.tabGroupColor,
            groupId: settings.tabGroupId,
          });
          await this._configHandler.setSettings({ tabGroupId: groupId });
        } else {
          // Firefox: Bookmarks
          const folder = await this._configHandler.ensureFolder();
          if (!folder) {
            console.error("[INIT]: Failed to create or retrieve folder");
            return;
          }
        }

        await this._setupAlarms();
        await this.syncFolder();
      }

      this._initialized = true;
      console.log("[INIT]: Live Folder initialized");
    } catch (error) {
      console.error("[INIT]: Error initializing Live Folder:", error);
    }
  }

  public async syncFolder() {
    // Wait for initialization to complete
    if (!this._initialized) {
      if (this._debug)
        console.log(
          "[SYNC-FOLDER] Not yet initialized, waiting before sync...",
        );
      // Wait up to 5 seconds for initialization
      let waited = 0;
      while (!this._initialized && waited < 5000) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        waited += 100;
      }
      if (!this._initialized) {
        console.warn("[SYNC-FOLDER] Initialization timeout, aborting sync");
        return;
      }
    }

    // Prevent concurrent syncs
    if (this._isSyncing) {
      if (this._debug)
        console.log("[SYNC-FOLDER] Already syncing, skipping this call");
      return;
    }

    this._isSyncing = true;

    try {
      if (this._debug) console.log("[SYNC-FOLDER] Starting sync");

      if (!this._githubHandler.authenticated) {
        if (this._debug)
          console.log("[SYNC-FOLDER] Not authenticated, skipping sync");
        return;
      }

      const settings = await this._configHandler.getSettings();

      const pullRequests = await this._githubHandler.getPullRequests(
        settings.prFilter,
        settings.organizationFilter,
      );
      if (!pullRequests) {
        if (this._debug) console.log("[SYNC-FOLDER] No pull requests found");
        return;
      }

      const updatePrsAlarm = await browser.alarms.get(this._alarms.UPDATE_PRS);
      if (settings.refreshInterval !== updatePrsAlarm?.periodInMinutes) {
        await this.updateRefreshInterval(settings.refreshInterval);
      }

      if (this._configHandler.supportsTabGroups()) {
        // Chrome: Use tab groups
        let groupId = settings.tabGroupId;

        // Ensure the tab group exists and is up to date
        groupId = await this._tabGroupHandler.ensureTabGroup({
          title: settings.name,
          color: settings.tabGroupColor,
          groupId,
        });

        if (groupId !== settings.tabGroupId) {
          await this._configHandler.setSettings({ tabGroupId: groupId });
        }

        // Attempt to sync tabs
        const syncSuccess = await this._tabGroupHandler.syncTabs({
          groupId,
          pullRequests,
          prNameFormat: settings.prNameFormat,
          formatPrName: this._configHandler.formatPrName.bind(
            this._configHandler,
          ),
          previousPrCount: settings.lastPrCount,
        });

        // If sync failed (the group became invalid), recreate the group and retry once
        if (!syncSuccess) {
          console.warn(
            "[SYNC-FOLDER] Tab group sync failed, recreating group and retrying...",
          );

          // Close any ungrouped PR tabs to prevent duplicates
          const prUrls = new Set(pullRequests.map((pr) => pr.url));
          await this._tabGroupHandler.closeUngroupedPrTabs(prUrls);

          // Wait a bit for cleanup to complete
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Force recreation by searching only by title (not using stored groupId)
          groupId = await this._tabGroupHandler.ensureTabGroup({
            title: settings.name,
            color: settings.tabGroupColor,
            groupId: -1, // Pass -1 to force search by title or create new
          });

          await this._configHandler.setSettings({ tabGroupId: groupId });

          // Retry sync with a new group
          const retrySuccess = await this._tabGroupHandler.syncTabs({
            groupId,
            pullRequests,
            prNameFormat: settings.prNameFormat,
            formatPrName: this._configHandler.formatPrName.bind(
              this._configHandler,
            ),
            previousPrCount: settings.lastPrCount,
          });

          if (!retrySuccess) {
            console.error(
              "[SYNC-FOLDER] Failed to sync tabs even after recreating group",
            );
          }
        }
      } else {
        // Firefox: Use bookmarks
        const folder = await this._configHandler.getFolder();
        if (!folder) {
          if (this._debug)
            console.log("[SYNC-FOLDER] No folder found, creating");
          const newFolder = await this._configHandler.initFolder();
          if (!newFolder) {
            console.error("[SYNC-FOLDER] Failed to create folder");
            return;
          }
        }

        const currentFolder = await this._configHandler.getFolder();
        if (!currentFolder) {
          console.error(
            "[SYNC-FOLDER] Folder not found after creation attempt",
          );
          return;
        }

        if (settings.name && currentFolder.title !== settings.name) {
          await browser.bookmarks.update(currentFolder.id, {
            title: settings.name,
          });
        }

        await this._syncBookmarks({
          folderId: currentFolder.id,
          pullRequests,
          prNameFormat: settings.prNameFormat,
        });
      }

      await this._configHandler.setSettings({
        lastPrUpdate: Date.now(),
        lastPrCount: pullRequests.length,
      });

      if (this._debug) console.log("[SYNC-FOLDER] Sync completed successfully");
    } catch (error) {
      console.error("[SYNC-FOLDER] Error syncing folder:", error);
    } finally {
      this._isSyncing = false;
    }
  }

  private async _setupAlarms() {
    try {
      if (this._debug) console.log("[SETUP-ALARMS]", this._alarms.UPDATE_PRS);

      const { refreshInterval } = await this._configHandler.getSettings();

      await browser.alarms.clear(this._alarms.UPDATE_PRS);

      browser.alarms.create(this._alarms.UPDATE_PRS, {
        periodInMinutes: refreshInterval,
        when: Date.now() + refreshInterval * 60 * 1000,
      });

      // Only add the listener once
      if (!this._alarmListenerSetup) {
        browser.alarms.onAlarm.addListener(async (alarm) => {
          if (this._debug) console.log("[ON-ALARM]", alarm);

          if (alarm.name === this._alarms.UPDATE_PRS) {
            await this.syncFolder();
          }
        });
        this._alarmListenerSetup = true;
        if (this._debug) console.log("[SETUP-ALARMS] Alarm listener set up");
      }
    } catch (error) {
      console.error("[SETUP-ALARMS] Error setting up alarms:", error);
    }
  }

  private async _syncBookmarks({
    folderId,
    pullRequests,
    prNameFormat,
  }: {
    folderId: string;
    pullRequests: Array<PullRequest>;
    prNameFormat: string;
  }) {
    try {
      if (this._debug)
        console.log(
          "[SYNC-BOOKMARKS] Syncing",
          pullRequests.length,
          "pull requests",
        );

      const existingBookmarks = await browser.bookmarks.getChildren(folderId);
      const existingUrls = new Map(
        existingBookmarks.map((bookmark) => [bookmark.url, bookmark]),
      );
      const processedUrls = new Set<string>();

      for (const pr of pullRequests) {
        const title = this._configHandler.formatPrName({
          pr,
          format: prNameFormat,
        });

        if (existingUrls.has(pr.url)) {
          const existing = existingUrls.get(pr.url)!;
          if (existing.title !== title) {
            await browser.bookmarks.update(existing.id, { title });
          }
        } else {
          await browser.bookmarks.create({
            parentId: folderId,
            title,
            url: pr.url,
          });
        }

        processedUrls.add(pr.url);
      }

      const bookmarksToRemove = existingBookmarks.filter(
        (bookmark) => bookmark.url && !processedUrls.has(bookmark.url),
      );

      for (const bookmark of bookmarksToRemove) {
        await browser.bookmarks.remove(bookmark.id);
      }

      if (this._debug) {
        console.log(
          "[SYNC-BOOKMARKS] Added/updated:",
          pullRequests.length,
          "Removed:",
          bookmarksToRemove.length,
        );
      }
    } catch (error) {
      console.error("[SYNC-BOOKMARKS] Error syncing bookmarks:", error);
    }
  }

  public async updateRefreshInterval(interval: number) {
    if (this._debug) console.log("[UPDATE-REFRESH]", interval);
    try {
      await browser.alarms.clear(this._alarms.UPDATE_PRS);
      browser.alarms.create(this._alarms.UPDATE_PRS, {
        periodInMinutes: interval,
      });
    } catch (error) {
      console.error("[UPDATE-REFRESH] Error updating refresh interval:", error);
    }
  }
}

const lf = LiveFolder.getInstance();
export default lf;
