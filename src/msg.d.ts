import { type ProtocolWithReturn } from "webext-bridge";
import { type LiveFolderConfig } from "./config-handler";

declare module "webext-bridge" {
  export interface ProtocolMap {
    AUTH_STATE: ProtocolWithReturn<
      null,
      {
        isAuthenticated: boolean;
      }
    >;
    GET_CONFIG: ProtocolWithReturn<null, LiveFolderConfig | null>;
    SET_CONFIG: ProtocolWithReturn<
      Partial<LiveFolderConfig>,
      {
        success: boolean;
      }
    >;
  }
}
