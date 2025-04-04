import { Button } from "@/src/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/src/components/ui/tabs";
import { type LiveFolderConfig } from "@/src/config-handler";
import { AlertTriangle, Check, Info, Settings2, X } from "lucide-react";
import { sendMessage } from "webext-bridge/popup";
import * as React from "react";
import { SettingsForm } from "@/src/components/settings-form";
import browser from "webextension-polyfill";

export function Popup() {
  const [initialConfig, setInitialConfig] =
    React.useState<LiveFolderConfig | null>(null);
  const [isAuthenticated, setIsAuthenticated] = React.useState<boolean>(false);

  React.useEffect(() => {
    (async () => {
      const state = await getAuthState();
      setIsAuthenticated(state?.isAuthenticated ?? false);

      const config = await getInitialConfig();
      setInitialConfig(config ?? null);
    })();
  }, []);

  async function getAuthState() {
    try {
      const response = await sendMessage("AUTH_STATE", null, "background");
      return response;
    } catch (error) {
      console.error("Error getting auth state:", error);
    }
  }

  async function getInitialConfig() {
    try {
      const response = await sendMessage("GET_CONFIG", null, "background");
      return response;
    } catch (error) {
      console.error("Error getting initial config:", error);
    }
  }

  return (
    <div className="flex w-[420px] flex-col bg-background px-4 py-2">
      <header className="mb-2 flex items-baseline justify-between border-b border-b-border py-1">
        <h1 className="text-xl font-bold">live folder</h1>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => window.close()}
        >
          <X className="h-5 w-5" />
        </Button>
      </header>
      <main className="flex flex-col">
        <Tabs defaultValue="info">
          <TabsList className="w-full justify-start rounded-sm">
            <TabsTrigger value="info">
              <Info className="h-4 w-4" />
              <span className="sr-only">Information</span>
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings2 className="h-4 w-4" />
              <span className="sr-only">Settings</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="info">
            {isAuthenticated ? (
              <div className="inline-flex w-full items-start gap-x-3 rounded-sm bg-primary/40 p-2 text-xs font-medium">
                <Check className="h-3 w-3" />
                Everything is set up correctly!
              </div>
            ) : (
              <div className="inline-flex w-full items-start gap-x-3 rounded-sm bg-destructive/40 p-2 text-xs">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span>
                  You need to
                  <a
                    href="https://github.com/login"
                    target="_blank"
                    referrerPolicy="no-referrer"
                    className="mx-1 text-primary underline decoration-primary underline-offset-1"
                  >
                    login
                  </a>
                  to your Github account to track pull requests.
                </span>
              </div>
            )}
          </TabsContent>
          <TabsContent value="settings">
            <SettingsForm defaultValues={initialConfig} />
          </TabsContent>
        </Tabs>
      </main>
      <footer className="mt-2 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">
          v{browser.runtime.getManifest().version}
        </p>
      </footer>
    </div>
  );
}
