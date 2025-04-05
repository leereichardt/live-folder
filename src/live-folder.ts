import { GithubHandler, type PullRequest } from "./github-handler";
import { ConfigHandler } from "./config-handler";

export class LiveFolder {
  private static _instance: LiveFolder;
  private _initialized = false;
  private readonly _debug: boolean;

  private readonly _githubHandler: GithubHandler;
  private readonly _configHandler: ConfigHandler;

  private readonly _alarms = {
    UPDATE_PRS: "update-pull-requests",
  } as const;

  private constructor() {
    this._debug = true;
    this._githubHandler = new GithubHandler({
      debug: this._debug,
    });
    this._configHandler = new ConfigHandler(this, this._githubHandler);
  }

  static getInstance() {
    return (this._instance ??= new LiveFolder());
  }

  public async init() {
    if (this._initialized) return;

    try {
      await this._configHandler.ensureSettings();

      if (this._githubHandler.authenticated) {
        const folder = await this._configHandler.ensureFolder();
        if (!folder) {
          console.error("[INIT]: Failed to create or retrieve folder");
          return;
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

  private async _setupAlarms() {
    try {
      if (this._debug) console.log("[SETUP-ALARMS]", this._alarms.UPDATE_PRS);

      const { refreshInterval } = await this._configHandler.getSettings();

      await browser.alarms.clear(this._alarms.UPDATE_PRS);

      browser.alarms.create(this._alarms.UPDATE_PRS, {
        periodInMinutes: refreshInterval,
        when: Date.now() + refreshInterval * 60 * 1000,
      });

      browser.alarms.onAlarm.addListener(async (alarm) => {
        if (this._debug) console.log("[ON-ALARM]", alarm);

        if (alarm.name === this._alarms.UPDATE_PRS) {
          await this.syncFolder();
        }
      });
    } catch (error) {
      console.error("[SETUP-ALARMS] Error setting up alarms:", error);
    }
  }

  public async syncFolder() {
    try {
      if (this._debug) console.log("[SYNC-FOLDER] Starting sync");

      if (!this._githubHandler.authenticated) {
        if (this._debug)
          console.log("[SYNC-FOLDER] Not authenticated, skipping sync");
        return;
      }

      const folder = await this._configHandler.getFolder();
      if (!folder) {
        if (this._debug) console.log("[SYNC-FOLDER] No folder found, creating");
        const newFolder = await this._configHandler.initFolder();
        if (!newFolder) {
          console.error("[SYNC-FOLDER] Failed to create folder");
          return;
        }
      }

      const currentFolder = await this._configHandler.getFolder();
      if (!currentFolder) {
        console.error("[SYNC-FOLDER] Folder not found after creation attempt");
        return;
      }

      const pullRequests = await this._githubHandler.getPullRequests();
      if (!pullRequests) {
        if (this._debug) console.log("[SYNC-FOLDER] No pull requests found");
        return;
      }

      const settings = await this._configHandler.getSettings();

      if (settings.name && currentFolder.title !== settings.name) {
        await browser.bookmarks.update(currentFolder.id, {
          title: settings.name,
        });
      }

      const updatePrsAlarm = await browser.alarms.get(this._alarms.UPDATE_PRS);
      if (settings.refreshInterval !== updatePrsAlarm?.periodInMinutes) {
        await this.updateRefreshInterval(settings.refreshInterval);
      }

      await this._syncBookmarks({
        folderId: currentFolder.id,
        pullRequests,
        prNameFormat: settings.prNameFormat,
      });

      await this._configHandler.setSettings({
        lastPrUpdate: Date.now(),
      });

      if (this._debug) console.log("[SYNC-FOLDER] Sync completed successfully");
    } catch (error) {
      console.error("[SYNC-FOLDER] Error syncing folder:", error);
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
