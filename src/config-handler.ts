import { onMessage } from "webext-bridge/background";
import { type GithubHandler, type PullRequest } from "./github-handler";
import { type LiveFolder } from "./live-folder";

export type PrFilterType = "assigned" | "review-requested" | "both";

export type LiveFolderConfig = {
  id: string;
  name: string;
  refreshInterval: number; // in minutes
  prNameFormat: string;
  lastPrUpdate: number;
  tabGroupId: number;
  tabGroupColor: chrome.tabGroups.ColorEnum;
  prFilter: PrFilterType;
  organizationFilter: string; // comma-separated list of organizations
};

export class ConfigHandler {
  private readonly SETTINGS_KEY = "SETTINGS";
  public readonly DEFAULT_SETTINGS: LiveFolderConfig = {
    id: "__unset__",
    name: "Pull Requests",
    refreshInterval: 1,
    prNameFormat: "[%repository%] %name%",
    lastPrUpdate: 0,
    tabGroupId: -1,
    tabGroupColor: "blue",
    prFilter: "both",
    organizationFilter: "",
  };
  private _lf: LiveFolder;
  private _githubHandler: GithubHandler;

  constructor(lf: LiveFolder, githubHandler: GithubHandler) {
    this._lf = lf;
    this._githubHandler = githubHandler;

    onMessage("SET_CONFIG", async (message) => {
      try {
        console.log("[SET-CONFIG] Saving settings and triggering sync...");
        await this.setSettings(message.data);
        console.log("[SET-CONFIG] Settings saved, syncing folder now...");
        await this._lf.syncFolder();
        console.log("[SET-CONFIG] Sync completed successfully!");
        return { success: true };
      } catch (error) {
        console.error(
          "[SET-FOLDER-SETTINGS] Error setting folder settings:",
          error,
        );
        return { success: false };
      }
    });

    onMessage("GET_CONFIG", async () => {
      try {
        return await this.getSettings();
      } catch (error) {
        console.error(
          "[GET-FOLDER-SETTINGS] Error getting folder settings:",
          error,
        );
        return null;
      }
    });

    // NOTE: This handles the manual change of the folder name
    //       It keeps the folder name in sync with the settings
    browser.bookmarks.onChanged.addListener(async (id, changeInfo) => {
      if (changeInfo.title) {
        const settings = await this.getSettings();
        if (settings.name !== changeInfo.title && id === settings.id) {
          await this.setSettings({ name: changeInfo.title });
        }
      }
    });

    browser.cookies.onChanged.addListener(async ({ cookie }) => {
      if (this._githubHandler.isAuthCookie(cookie)) {
        const newAuthState =
          this._githubHandler.isAuthenticatedFromCookie(cookie);
        this._githubHandler.updateAuthState(newAuthState);
      }
    });

    browser.runtime.onInstalled.addListener(async () => {
      const newAuthState =
        await this._githubHandler.isAuthenticatedFromBrowser();
      this._githubHandler.updateAuthState(newAuthState);
    });

    browser.runtime.onStartup.addListener(async () => {
      await this._lf.syncFolder();
      const newAuthState =
        await this._githubHandler.isAuthenticatedFromBrowser();
      this._githubHandler.updateAuthState(newAuthState);
    });
  }

  public async ensureSettings(): Promise<LiveFolderConfig> {
    try {
      const settings = await this.getSettings();
      const hasAllKeys = Object.keys(this.DEFAULT_SETTINGS).every(
        (key) => settings[key as keyof LiveFolderConfig] !== undefined,
      );

      if (!hasAllKeys) {
        // TODO: Set only missing keys
        await this.setSettings(this.DEFAULT_SETTINGS);
        return this.DEFAULT_SETTINGS;
      }

      return settings;
    } catch (error) {
      console.error("[ENSURE-SETTINGS] Error ensuring settings:", error);
      await this.setSettings(this.DEFAULT_SETTINGS);
      return this.DEFAULT_SETTINGS;
    }
  }

  public async getSettings(): Promise<LiveFolderConfig> {
    try {
      const data = await browser.storage.local.get(this.SETTINGS_KEY);

      if (!data || !data[this.SETTINGS_KEY]) {
        return this.DEFAULT_SETTINGS;
      }

      return data[this.SETTINGS_KEY] as LiveFolderConfig;
    } catch (error) {
      console.error("[GET-SETTINGS] Error getting settings:", error);
      return this.DEFAULT_SETTINGS;
    }
  }

  public async setSettings(
    settings: Partial<LiveFolderConfig>,
  ): Promise<LiveFolderConfig> {
    try {
      const currentSettings = await this.getSettings();
      const updatedSettings = { ...currentSettings, ...settings };

      await browser.storage.local.set({
        [this.SETTINGS_KEY]: updatedSettings,
      });

      return updatedSettings;
    } catch (error) {
      console.error("[SET-SETTINGS] Error setting settings:", error);
      throw error;
    }
  }

  public async getFolder() {
    try {
      const settings = await this.getSettings();

      if (!settings.id || settings.id === this.DEFAULT_SETTINGS.id) {
        return null;
      }

      try {
        return (await browser.bookmarks.get(settings.id))[0];
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Bookmark not found")
        ) {
          await this.setSettings({ id: this.DEFAULT_SETTINGS.id });
        } else {
          throw error;
        }
        return null;
      }
    } catch (error) {
      console.error("[GET-FOLDER] Error getting folder:", error);
      return null;
    }
  }

  public async initFolder() {
    try {
      const existingFolder = await this.getFolder();
      if (existingFolder) {
        return existingFolder;
      }

      const parentId = this.getFolderParentIdByBrowser();
      if (!parentId) {
        console.error("[INIT-FOLDER] Could not determine parent folder ID");
        return null;
      }

      const settings = await this.getSettings();

      const folder = await browser.bookmarks.create({
        parentId,
        title: settings.name,
      });

      await this.setSettings({ id: folder.id });

      return folder;
    } catch (error) {
      console.error("[INIT-FOLDER] Error initializing folder:", error);
      return null;
    }
  }

  public async ensureFolder() {
    try {
      const folder = await this.getFolder();
      if (folder) {
        return folder;
      }

      return await this.initFolder();
    } catch (error) {
      console.error("[ENSURE-FOLDER] Error ensuring folder:", error);
      return null;
    }
  }

  public getFolderParentIdByBrowser() {
    switch (import.meta.env.BROWSER) {
      case "chrome":
        return "1";
      case "firefox":
        return "toolbar_____";
      default:
        console.error("[GET-FOLDER-PARENT]: Unknown browser", browser);
        return null;
    }
  }

  public formatPrName({ format, pr }: { format: string; pr: PullRequest }) {
    return format
      .replace(/%repository%/g, pr.repository_name)
      .replace(/%name%/g, pr.name)
      .replace(/%number%/g, pr.number.toString());
  }

  public supportsTabGroups() {
    return import.meta.env.BROWSER === "chrome";
  }
}
