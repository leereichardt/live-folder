import { type Cookies } from "webextension-polyfill";
import * as cheerio from "cheerio";
import { onMessage } from "webext-bridge/background";
import { type LiveFolder } from "./live-folder";

export type PullRequest = {
  name: string;
  url: string;
  number: number;
  repository_name: string;
};

export class GithubHandler {
  private readonly _debug: boolean;
  private _isAuthenticated = false;

  private readonly _GH_DOMAIN_WITH_SUBDOMAIN = ".github.com";
  private readonly _GH_COOKIE_NAME = "logged_in";
  private readonly _GH_COOKIE_VALUE = "yes";
  private readonly _PR_ROW_CLASS = ".js-issue-row";
  private readonly _PR_TITLE_CLASS = ".js-navigation-open";
  private readonly _PRS_URL = "https://github.com/pulls";

  constructor({ debug }: { debug: boolean }) {
    this._debug = debug;

    onMessage("AUTH_STATE", async () => {
      const newAuthState = await this.isAuthenticatedFromBrowser();
      this.updateAuthState(newAuthState);
      return { isAuthenticated: newAuthState };
    });

    this.isAuthenticatedFromBrowser()
      .then((newAuthState) => {
        this.updateAuthState(newAuthState);
      })
      .catch((error) => {
        console.error("[INIT] Error initializing GithubHandler:", error);
      });
  }

  public updateAuthState(newAuthState: boolean) {
    if (newAuthState !== this._isAuthenticated) {
      this._isAuthenticated = newAuthState;
      // TODO: Find a way to handle the initial auth state vs user logging in (after logging in user has to wait one minute for the sync)
      //if (newAuthState) {
      //  this._lf.syncFolder();
      //}
    }
  }

  public isAuthenticatedFromCookie(cookie: Cookies.Cookie) {
    const check =
      cookie.domain === this._GH_DOMAIN_WITH_SUBDOMAIN &&
      cookie.name === this._GH_COOKIE_NAME &&
      cookie.value === this._GH_COOKIE_VALUE;

    return check;
  }

  public async isAuthenticatedFromBrowser() {
    const cookies = await browser.cookies.getAll({
      domain: this._GH_DOMAIN_WITH_SUBDOMAIN,
    });
    const check = cookies.some((cookie) =>
      this.isAuthenticatedFromCookie(cookie),
    );

    if (this._debug) console.log("[IS-AUTHENTICATED-FROM-BROWSER]", check);
    return check;
  }

  public isAuthCookie(cookie: Cookies.Cookie) {
    const check =
      cookie.domain === this._GH_DOMAIN_WITH_SUBDOMAIN &&
      cookie.name === this._GH_COOKIE_NAME;
    return check;
  }

  public get authenticated() {
    return this._isAuthenticated;
  }

  private async _getPRsHTMLPromise() {
    const response = await fetch(this._PRS_URL, {
      method: "GET",
      credentials: "include",
    });

    return response.text();
  }

  public async getPullRequests() {
    const newAuthState = await this.isAuthenticatedFromBrowser();
    this.updateAuthState(newAuthState);

    if (!this._isAuthenticated) {
      console.log("User is unauthenticated");
      return [];
    }

    const { data: html, error: htmlError } = await tryCatch(
      this._getPRsHTMLPromise(),
    );

    if (htmlError || !html) {
      // TODO: Handle error
      console.error(htmlError);
      return [];
    }

    const pullRequests: PullRequest[] = [];
    const $ = cheerio.load(html);

    $(this._PR_ROW_CLASS).each((_, item) => {
      const nameElement = $(item).find(this._PR_TITLE_CLASS);
      const name = nameElement?.text()?.trim();
      const urlAttr = nameElement?.attr?.("href");

      if (!name || !urlAttr) return;

      const urlParts = urlAttr.split("/");
      const number = parseInt(urlParts[urlParts.length - 1]);
      const repository_name = urlParts[urlParts.length - 3];
      const url = `https://github.com${urlAttr}`;

      pullRequests.push({ name, url, number, repository_name });
    });

    return pullRequests;
  }
}
