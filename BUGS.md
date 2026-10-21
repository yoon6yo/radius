# BUGS

## Open

### Pre-consent freeze/DoS via huge offer size (HIGH)
- What: offer with one file of size 2^53-1 -> `Receiver.loadResume`/`onOffer` iterate a 2^31-slot sparse array before the user is asked (measured 33 s main-thread freeze per file; x150 files).
- State: fixed on `fix/offer-size-cap` (uncommitted): `MAX_OFFER_BYTES` = 4 TiB total cap in `parseTransferMsg`.

### Self-review nits (LOW, unfixed, for CodeRabbit)
- `Sender.handleControl` `accept`: guard `pending.length === 0 && acked.size === 0` also passes for a duplicate `accept` while blocks are in flight -> blocks re-queued.
- `Receiver.onOffer`: offer while `active` is dropped silently (no `reject`); sender waits without timeout.
- `Sender.blockIdx` uses `findIndex` per ack/nack (O(n) each).
- `exportOpfs.stripUnsafe` can yield `""` for control-only names -> `a.download=""`.
- `Receiver.expected` keeps one entry per block until transfer end (bounded by announced blocks, now <= 1M).
- Unsafe-char regex duplicated in protocol `sanitizeName` and web `exportOpfs`.

### Device number is only 6 digits (HIGH, accepted by user request)
- What: `deviceFingerprint` shows 6 digits (~20 bits) of the device ID in the accept dialog; a lookalike ID can be ground offline in seconds, so it no longer defends against an impersonating device with the same name.
- Why: user asked for a 6-digit number; flagged by the security-guidance review. Tradeoff stated to the user before and after the change.
- State: open, intentional.
- Fix: restore >= 80 bits (25 digits, previous implementation), or add a short authentication string where both sides commit to fresh nonces before revealing, so the code cannot be precomputed. Do not truncate the static identity hash.
