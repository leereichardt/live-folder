import { type Cookies } from "webextension-polyfill";
import * as cheerio from "cheerio";
import { onMessage } from "webext-bridge/background";
import { type PrFilterType } from "./config-handler";

export type PullRequest = {
  name: string;
  url: string;
  number: number;
  repository_name: string;
  organization: string;
};

export class GithubHandler {
  private readonly _debug: boolean;
  private _isAuthenticated = false;

  private readonly _GH_DOMAIN_WITH_SUBDOMAIN = ".github.com";
  private readonly _GH_COOKIE_NAME = "logged_in";
  private readonly _GH_COOKIE_VALUE = "yes";
  private readonly _PR_ROW_CLASS = ".js-issue-row";
  private readonly _PR_TITLE_CLASS = ".js-navigation-open";
  private readonly _PRS_ASSIGNED_URL = "https://github.com/pulls";
  private readonly _PRS_REVIEW_REQUESTED_URL = "https://github.com/pulls/review-requested";

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


    return (
      cookie.domain === this._GH_DOMAIN_WITH_SUBDOMAIN &&
      cookie.name === this._GH_COOKIE_NAME &&
      cookie.value === this._GH_COOKIE_VALUE
    );
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

    return (
      cookie.domain === this._GH_DOMAIN_WITH_SUBDOMAIN &&
      cookie.name === this._GH_COOKIE_NAME
    );
  }

  public get authenticated() {
    return this._isAuthenticated;
  }

  private async _getPRsHTMLPromise(url: string) {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
    });

    return response.text();
  }

  private async _parsePRsFromHTML(html: string): Promise<PullRequest[]> {
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
      const organization = urlParts[urlParts.length - 4];
      const url = `https://github.com${urlAttr}`;

      pullRequests.push({ name, url, number, repository_name, organization });
    });

    return pullRequests;
  }

  public async getPullRequests(filter: PrFilterType = "both", organizationFilter: string = "") {
    const newAuthState = await this.isAuthenticatedFromBrowser();
    this.updateAuthState(newAuthState);

    if (!this._isAuthenticated) {
      console.log("User is unauthenticated");
      return [];
    }

    const urlsToFetch: string[] = [];

    if (filter === "assigned" || filter === "both") {
      urlsToFetch.push(this._PRS_ASSIGNED_URL);
    }

    if (filter === "review-requested" || filter === "both") {
      urlsToFetch.push(this._PRS_REVIEW_REQUESTED_URL);
    }

    const allPullRequests: PullRequest[] = [];
    const seenUrls = new Set<string>();

    // Parse organization filter into a set for fast lookup
    const allowedOrgs = new Set(
      organizationFilter
        .split(",")
        .map((org) => org.trim().toLowerCase())
        .filter((org) => org.length > 0)
    );
    const hasOrgFilter = allowedOrgs.size > 0;

    for (const url of urlsToFetch) {
      const { data: html, error: htmlError } = await tryCatch(
        this._getPRsHTMLPromise(url),
      );

      if (htmlError || !html) {
        console.error("[GET-PULL-REQUESTS] Error fetching from", url, htmlError);
        continue;
      }

      const prs = await this._parsePRsFromHTML(html);

      // Deduplicate PRs by URL and filter by organization
      for (const pr of prs) {
        if (!seenUrls.has(pr.url)) {
          // Apply organization filter if set
          if (hasOrgFilter && !allowedOrgs.has(pr.organization.toLowerCase())) {
            continue;
          }

          seenUrls.add(pr.url);
          allPullRequests.push(pr);
        }
      }
    }

    if (this._debug) {
      console.log("[GET-PULL-REQUESTS] Found", allPullRequests.length, "PRs with filter:", filter, "orgs:", organizationFilter || "all");
    }

    return allPullRequests;
  }
}
