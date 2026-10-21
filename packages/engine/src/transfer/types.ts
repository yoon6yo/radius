import type { FileMeta, TransferMsg } from "@radius/protocol";

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

/** Thrown by {@link Sink.resume} when another transfer is using the same staging. */
export class StagingBusyError extends Error {
  constructor() {
    super("staging_busy");
  }
}

export interface FileSource {
  readonly size: number;
  read(offset: number, length: number): Promise<ArrayBuffer>;
}

export interface Sink {
  /** Loads persisted state of an interrupted transfer of the same files: verified block hashes per file. */
  resume?(files: FileMeta[]): Promise<(Uint8Array | undefined)[][]>;
  /** Persists (or with `null`, revokes) the verified hash of one block. */
  record?(fileIdx: number, blockIdx: number, hash: Uint8Array | null): Promise<void>;
  /** Reads back staged bytes so a resumed block is checked against disk, not just its recorded hash. */
  read?(fileIdx: number, offset: number, length: number): Promise<Uint8Array>;
  /** Must keep already written bytes when the file exists with the same size. */
  open(fileIdx: number, path: string, size: number): Promise<void>;
  write(fileIdx: number, offset: number, data: Uint8Array): Promise<void>;
  close(fileIdx: number): Promise<void>;
  abort(): Promise<void>;
}

export type Sha256 = (data: Uint8Array) => Promise<Uint8Array>;

export type TransferResult =
  | { status: "complete" }
  | { status: "rejected"; reason: "declined" | "no_space" | "busy" }
  | { status: "cancelled" }
  | { status: "failed"; reason: string };
