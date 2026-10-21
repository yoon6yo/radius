import type { TransferMsg } from "@radius/protocol";

/** Transport used by a transfer; implemented over PeerConnection (or a fake in tests). */
export interface DataLink {
  readonly channelCount: number;
  isOpen(channel: number): boolean;
  bufferedAmount(channel: number): number;
  sendData(channel: number, frame: ArrayBuffer): boolean;
  sendControl(msg: TransferMsg): boolean;
  /** Resolves once the channel's buffer drained below its low threshold. */
  waitDrain(channel: number): Promise<void>;
  /** Resolves once at least one data channel is open. */
  waitReady(): Promise<void>;
}

export interface FileSource {
  readonly size: number;
  read(offset: number, length: number): Promise<ArrayBuffer>;
}

export interface Sink {
  open(fileIdx: number, path: string, size: number): Promise<void>;
  write(fileIdx: number, offset: number, data: Uint8Array): Promise<void>;
  close(fileIdx: number): Promise<void>;
  abort(): Promise<void>;
}

export type Sha256 = (data: Uint8Array) => Promise<Uint8Array>;

export type TransferResult =
  | { status: "complete" }
  | { status: "rejected"; reason: "declined" | "no_space" }
  | { status: "cancelled" }
  | { status: "failed"; reason: string };
