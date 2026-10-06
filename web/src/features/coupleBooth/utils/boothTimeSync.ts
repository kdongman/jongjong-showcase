/**
 * Simple ping/pong clock offset estimation.
 * localNow ≈ remoteNow + offset  =>  remoteNow ≈ localNow - offset
 */
export class BoothTimeSync {
  private samples: number[] = [];
  private offsetMs = 0;

  getOffsetMs(): number {
    return this.offsetMs;
  }

  toLocalTime(remoteTimestamp: number): number {
    return remoteTimestamp + this.offsetMs;
  }

  toSharedTime(localTimestamp: number): number {
    return localTimestamp - this.offsetMs;
  }

  recordPong(pingSentAt: number, remoteReceivedAt: number, localReceivedAt = Date.now()): void {
    const rtt = Math.max(0, localReceivedAt - pingSentAt);
    const estimatedRemoteNow = remoteReceivedAt + rtt / 2;
    const sample = localReceivedAt - estimatedRemoteNow;
    this.samples.push(sample);
    if (this.samples.length > 8) this.samples.shift();
    const sorted = [...this.samples].sort((a, b) => a - b);
    this.offsetMs = sorted[Math.floor(sorted.length / 2)] ?? 0;
  }

  msUntil(sharedCaptureAt: number, now = Date.now()): number {
    return this.toLocalTime(sharedCaptureAt) - now;
  }
}
