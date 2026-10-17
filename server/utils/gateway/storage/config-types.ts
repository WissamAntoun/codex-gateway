import type { GatewayConfig, HostRecord } from "~~/shared/types";

// These types never cross the HTTP/WS serialization boundary.
export interface StoredHostRecord extends HostRecord {
  privateKey?: string | null;
  password?: string | null;
}

export interface StoredGatewayConfig extends Omit<GatewayConfig, "hosts"> {
  hosts: StoredHostRecord[];
}
